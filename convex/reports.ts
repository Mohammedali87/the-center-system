import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { roundMoney } from "./balances";
import { canManage, hasPermission, requirePermission } from "./permissions";
import type { Role } from "./permissions";
import { jobStatusValidator, reportPeriodValidator } from "./validators";

type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type BalanceFilter = "all" | "withBalance" | "paid";
type CompletionFilter = "all" | "completed" | "notCompleted";
type JobStatus = Doc<"jobs">["status"];

const dayMs = 24 * 60 * 60 * 1000;
const balanceFilterValidator = v.union(
  v.literal("all"),
  v.literal("withBalance"),
  v.literal("paid")
);
const completionFilterValidator = v.union(
  v.literal("all"),
  v.literal("completed"),
  v.literal("notCompleted")
);

export const dashboard = query({
  args: {
    period: v.optional(reportPeriodValidator),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    employeeId: v.optional(v.id("users")),
    jobType: v.optional(v.string()),
    status: v.optional(jobStatusValidator),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    balanceDue: v.optional(balanceFilterValidator),
    completion: v.optional(completionFilterValidator)
  },
  handler: async (ctx, args) => {
    const { userId, role, user } = await requirePermission(ctx, "reports.view");
    const canViewEmployeePerformance = await hasPermission(ctx, user, "reports.employee_performance");
    const canViewCompanyRevenue = await hasPermission(ctx, user, "reports.company_revenue");
    const period = args.period ?? "daily";
    const bounds = periodBounds(period, args.startDate, args.endDate);
    const jobs = await loadCandidateJobs(ctx, {
      userId,
      role,
      employeeId: canManage(role) && canViewEmployeePerformance ? args.employeeId : userId,
      status: args.status,
      customerId: args.customerId,
      clientId: args.clientId
    });
    const nonDateJobs = jobs.filter((job) =>
      matchesFilters(job, {
        employeeId: canManage(role) && canViewEmployeePerformance ? args.employeeId : userId,
        jobType: args.jobType,
        status: args.status,
        customerId: args.customerId,
        clientId: args.clientId,
        balanceDue: args.balanceDue ?? "all",
        completion: args.completion ?? "all"
      })
    );
    const dateFilteredJobs = nonDateJobs.filter((job) => jobInReportWindow(job, bounds));
    const users = canViewEmployeePerformance ? await loadReportUsers(ctx, role, userId) : [user];
    const payments = await ctx.db.query("payments").take(1000);

    const dashboard = await buildDashboard(ctx, {
      period,
      bounds,
      jobs: dateFilteredJobs,
      paymentJobs: nonDateJobs,
      payments,
      users
    });
    if (!canViewCompanyRevenue) {
      dashboard.totalRevenueCollected = 0;
    }
    return dashboard;
  }
});

export const generateDailySnapshot = internalMutation({
  args: {},
  handler: async (ctx) => await generateSnapshot(ctx, "daily")
});

export const generateWeeklySnapshot = internalMutation({
  args: {},
  handler: async (ctx) => await generateSnapshot(ctx, "weekly")
});

export const generateMonthlySnapshot = internalMutation({
  args: {},
  handler: async (ctx) => await generateSnapshot(ctx, "monthly")
});

export const generateQuarterlySnapshot = internalMutation({
  args: {},
  handler: async (ctx) => await generateSnapshot(ctx, "quarterly")
});

export const generateAnnualSnapshot = internalMutation({
  args: {},
  handler: async (ctx) => await generateSnapshot(ctx, "annual")
});

async function generateSnapshot(ctx: MutationCtx, period: ReportPeriod) {
  const bounds = periodBounds(period);
  const [jobs, payments, users] = await Promise.all([
    ctx.db.query("jobs").take(1000),
    ctx.db.query("payments").take(1000),
    ctx.db.query("users").take(200)
  ]);
  const reportJobs = jobs.filter((job) => jobInReportWindow(job, bounds));
  const dashboard = await buildDashboard(ctx, {
    period,
    bounds,
    jobs: reportJobs,
    paymentJobs: jobs,
    payments,
    users: users.filter(isActiveEmployeeForReports)
  });
  const now = Date.now();

  await ctx.db.insert("reportSnapshots", {
    period,
    periodStart: bounds.startDate,
    periodEnd: bounds.endDate,
    totalJobsCreated: dashboard.totalJobsCreated,
    totalJobsCompleted: dashboard.totalJobsCompleted,
    jobsInProgress: dashboard.jobsInProgress,
    jobsOverdue: dashboard.jobsOverdue,
    totalRevenueCollected: dashboard.totalRevenueCollected,
    totalRemainingBalance: dashboard.totalRemainingBalance,
    completedJobsWithBalance: dashboard.completedJobsWithBalance,
    jobsNotCompletedByDueDate: dashboard.jobsNotCompletedByDueDate,
    createdAt: now
  });

  for (const employee of dashboard.employeePerformance) {
    await ctx.db.insert("employeePerformanceSnapshots", {
      period,
      periodStart: bounds.startDate,
      periodEnd: bounds.endDate,
      employeeId: employee.employeeId as Id<"users">,
      assignedJobs: employee.assignedJobs,
      completedJobs: employee.completedJobs,
      pendingJobs: employee.pendingJobs,
      overdueJobs: employee.overdueJobs,
      completedLateJobs: employee.completedLateJobs,
      completedOnTimeJobs: employee.completedOnTimeJobs,
      achievementPercentage: employee.achievementPercentage,
      notes: employee.managerNotes,
      createdAt: now
    });
  }

  const managers = users.filter(
    (user) =>
      (user.role === "owner" || user.role === "manager" || user.role === "supervisor") &&
      user.isActive !== false &&
      user.accessStatus !== "suspended" &&
      user.accessStatus !== "removed"
  );
  for (const manager of managers) {
    const notificationId = await ctx.db.insert("notifications", {
      userId: manager._id,
      jobId: null,
      type: "report",
      title: `${periodLabel(period)} report generated`,
      message: `${dashboard.totalJobsCreated} jobs created, ${dashboard.totalJobsCompleted} completed, and ${dashboard.jobsOverdue} overdue for ${bounds.startDate} through ${bounds.endDate}.`,
      isRead: false,
      priority: dashboard.jobsOverdue > 0 ? "medium" : "low",
      link: "/",
      dedupeKey: `${bounds.endDate}:report:${period}:${manager._id}`,
      emailStatus: "queued",
      emailSentAt: null,
      emailError: null,
      createdAt: now
    });
    await ctx.scheduler.runAfter(0, internal.notificationEmailActions.sendNotificationEmail, {
      notificationId
    });
  }

  return {
    period,
    totalJobsCreated: dashboard.totalJobsCreated,
    totalJobsCompleted: dashboard.totalJobsCompleted
  };
}

async function loadCandidateJobs(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    role: Role;
    employeeId?: Id<"users">;
    status?: JobStatus;
    customerId?: Id<"customers">;
    clientId?: Id<"clients">;
  }
) {
  if (!canManage(args.role)) {
    return await ctx.db
      .query("jobs")
      .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", args.userId))
      .take(1000);
  }
  if (args.employeeId) {
    const employeeId = args.employeeId;
    return await ctx.db
      .query("jobs")
      .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", employeeId))
      .take(1000);
  }
  if (args.customerId) {
    return await ctx.db
      .query("jobs")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .take(1000);
  }
  if (args.clientId) {
    return await ctx.db
      .query("jobs")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .take(1000);
  }
  if (args.status) {
    const status = args.status;
    return await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(1000);
  }
  return await ctx.db.query("jobs").take(1000);
}

async function loadReportUsers(ctx: QueryCtx, role: Role, userId: Id<"users">) {
  if (!canManage(role)) {
    const user = await ctx.db.get(userId);
    return user ? [user] : [];
  }
  const users = await ctx.db.query("users").take(200);
  return users.filter(isActiveEmployeeForReports);
}

async function buildDashboard(
  ctx: QueryCtx | MutationCtx,
  args: {
    period: ReportPeriod;
    bounds: { startDate: string; endDate: string; startMs: number; endMs: number };
    jobs: Doc<"jobs">[];
    paymentJobs: Doc<"jobs">[];
    payments: Doc<"payments">[];
    users: Doc<"users">[];
  }
) {
  const today = isoDate(Date.now());
  const jobIdsForPayments = new Set(args.paymentJobs.map((job) => job._id));
  const periodPayments = args.payments.filter(
    (payment) =>
      jobIdsForPayments.has(payment.jobId) &&
      payment.paidAt >= args.bounds.startMs &&
      payment.paidAt <= args.bounds.endMs
  );

  const totalJobsCreated = args.jobs.filter((job) => msInRange(job.createdAt, args.bounds)).length;
  const totalJobsCompleted = args.jobs.filter(
    (job) => isCompletedStatus(job.status) && msInRange(job.completedAt ?? job.updatedAt, args.bounds)
  ).length;
  const openJobs = args.jobs.filter((job) => isOpenStatus(job.status));
  const overdueJobs = openJobs.filter((job) => job.dueDate < today);
  const completedWithBalance = args.jobs.filter(
    (job) => isCompletedStatus(job.status) && remainingBalance(job) > 0
  );

  const [lateRows, balanceRows, employeePerformance] = await Promise.all([
    Promise.all(overdueJobs.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 50).map((job) => jobRow(ctx, job))),
    Promise.all(
      completedWithBalance
        .sort((a, b) => remainingBalance(b) - remainingBalance(a))
        .slice(0, 50)
        .map((job) => jobRow(ctx, job))
    ),
    buildEmployeePerformance(ctx, args.users, args.jobs, today)
  ]);

  return {
    period: args.period,
    periodStart: args.bounds.startDate,
    periodEnd: args.bounds.endDate,
    totalJobsCreated,
    totalJobsCompleted,
    jobsInProgress: openJobs.length,
    jobsOverdue: overdueJobs.length,
    totalRevenueCollected: roundMoney(periodPayments.reduce((sum, payment) => sum + payment.amount, 0)),
    totalRemainingBalance: roundMoney(args.jobs.reduce((sum, job) => sum + remainingBalance(job), 0)),
    completedJobsWithBalance: completedWithBalance.length,
    jobsNotCompletedByDueDate: overdueJobs.length,
    lateJobs: lateRows,
    balanceDueJobs: balanceRows,
    employeePerformance
  };
}

async function buildEmployeePerformance(
  ctx: QueryCtx | MutationCtx,
  users: Doc<"users">[],
  jobs: Doc<"jobs">[],
  today: string
) {
  const rows = [];
  for (const user of users) {
    const assigned = jobs.filter((job) => job.assignedEmployeeId === user._id);
    const completed = assigned.filter((job) => isCompletedStatus(job.status));
    const unfinished = assigned.filter((job) => isOpenStatus(job.status));
    const overdue = unfinished.filter((job) => job.dueDate < today);
    const completedLate = completed.filter((job) => {
      const completedAt = isoDate(job.completedAt ?? job.updatedAt);
      return completedAt > job.dueDate;
    });
    const completedOnTime = completed.filter((job) => {
      const completedAt = isoDate(job.completedAt ?? job.updatedAt);
      return completedAt <= job.dueDate;
    });
    rows.push({
      employeeId: user._id,
      employeeName: user.name ?? user.email ?? "Team member",
      assignedJobs: assigned.length,
      completedJobs: completed.length,
      pendingJobs: unfinished.length,
      overdueJobs: overdue.length,
      completedLateJobs: completedLate.length,
      completedOnTimeJobs: completedOnTime.length,
      achievementPercentage: assigned.length === 0 ? 0 : Math.round((completed.length / assigned.length) * 100),
      unfinishedJobs: await Promise.all(
        unfinished.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8).map((job) => jobRow(ctx, job))
      ),
      managerNotes:
        overdue.length > 0
          ? `${overdue.length} overdue job${overdue.length === 1 ? "" : "s"} need follow-up.`
          : unfinished.length > completed.length
            ? "Monitor open workload."
            : "On track."
    });
  }
  return rows.sort((a, b) => b.overdueJobs - a.overdueJobs || b.pendingJobs - a.pendingJobs);
}

async function jobRow(ctx: QueryCtx | MutationCtx, job: Doc<"jobs">) {
  const [customer, client, employee] = await Promise.all([
    job.customerId ? ctx.db.get(job.customerId) : Promise.resolve(null),
    job.clientId ? ctx.db.get(job.clientId) : Promise.resolve(null),
    ctx.db.get(job.assignedEmployeeId)
  ]);
  const jobOrderId = job.jobOrderId ?? makeJobOrderId(job._id);
  return {
    _id: job._id,
    jobOrderId,
    jobType: job.jobType,
    customerName: customer?.businessName ?? client?.clientName ?? "Unknown customer",
    assignedEmployeeName: employee?.name ?? employee?.email ?? "Unassigned",
    status: job.status,
    priority: job.priority,
    dueDate: job.dueDate,
    createdAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    remainingBalance: remainingBalance(job),
    link: `/jobs/${jobOrderId}`
  };
}

function matchesFilters(
  job: Doc<"jobs">,
  filters: {
    employeeId?: Id<"users">;
    jobType?: string;
    status?: JobStatus;
    customerId?: Id<"customers">;
    clientId?: Id<"clients">;
    balanceDue: BalanceFilter;
    completion: CompletionFilter;
  }
) {
  if (filters.employeeId && job.assignedEmployeeId !== filters.employeeId) return false;
  if (filters.status && job.status !== filters.status) return false;
  if (filters.customerId && job.customerId !== filters.customerId) return false;
  if (filters.clientId && job.clientId !== filters.clientId) return false;
  if (filters.jobType && !job.jobType.toLowerCase().includes(filters.jobType.trim().toLowerCase())) return false;
  if (filters.balanceDue === "withBalance" && remainingBalance(job) <= 0) return false;
  if (filters.balanceDue === "paid" && remainingBalance(job) > 0) return false;
  if (filters.completion === "completed" && !isCompletedStatus(job.status)) return false;
  if (filters.completion === "notCompleted" && !isOpenStatus(job.status)) return false;
  return true;
}

function jobInReportWindow(
  job: Doc<"jobs">,
  bounds: { startDate: string; endDate: string; startMs: number; endMs: number }
) {
  return (
    msInRange(job.createdAt, bounds) ||
    dateInRange(job.dueDate, bounds) ||
    (job.completedAt ? msInRange(job.completedAt, bounds) : false)
  );
}

function isCompletedStatus(status: JobStatus) {
  return status === "Completed" || status === "Completed With Balance";
}

function isOpenStatus(status: JobStatus) {
  return !isCompletedStatus(status) && status !== "Cancelled";
}

function remainingBalance(job: Doc<"jobs">) {
  return roundMoney(Math.max(0, job.fee - job.amountPaid));
}

function isActiveEmployeeForReports(user: Doc<"users">) {
  return (
    user.isActive !== false &&
    user.accessStatus !== "suspended" &&
    user.accessStatus !== "removed" &&
    user.role !== "owner"
  );
}

function periodBounds(period: ReportPeriod, startDate?: string, endDate?: string) {
  if (startDate || endDate) {
    const fallback = startDate ?? endDate ?? isoDate(Date.now());
    return boundsFromDates(startDate ?? fallback, endDate ?? fallback);
  }
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = isoDate(Date.now());

  if (period === "daily") return boundsFromDates(today, today);
  if (period === "weekly") {
    const day = now.getUTCDay() || 7;
    const start = isoDate(Date.now() - (day - 1) * dayMs);
    const end = isoDate(dateMs(start) + 6 * dayMs);
    return boundsFromDates(start, end);
  }
  if (period === "monthly") {
    const start = isoDate(Date.UTC(year, month, 1));
    const end = isoDate(Date.UTC(year, month + 1, 0));
    return boundsFromDates(start, end);
  }
  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const start = isoDate(Date.UTC(year, quarterStartMonth, 1));
    const end = isoDate(Date.UTC(year, quarterStartMonth + 3, 0));
    return boundsFromDates(start, end);
  }
  const start = isoDate(Date.UTC(year, 0, 1));
  const end = isoDate(Date.UTC(year, 11, 31));
  return boundsFromDates(start, end);
}

function boundsFromDates(startDate: string, endDate: string) {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  return {
    startDate: start,
    endDate: end,
    startMs: dateMs(start),
    endMs: dateMs(end) + dayMs - 1
  };
}

function msInRange(ms: number, bounds: { startMs: number; endMs: number }) {
  return ms >= bounds.startMs && ms <= bounds.endMs;
}

function dateInRange(date: string, bounds: { startDate: string; endDate: string }) {
  return date >= bounds.startDate && date <= bounds.endDate;
}

function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dateMs(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function makeJobOrderId(jobId: Id<"jobs"> | string) {
  return `JO-${jobId.slice(-6).toUpperCase()}`;
}

function periodLabel(period: ReportPeriod) {
  if (period === "daily") return "Daily";
  if (period === "weekly") return "Weekly";
  if (period === "monthly") return "Monthly";
  if (period === "quarterly") return "Quarterly";
  return "Annual";
}
