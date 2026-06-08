import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { roundMoney } from "./balances";
import { getEffectivePermissionKeys, hasAnyPermission, hasPermission, requirePermission, requireUser } from "./permissions";

type JobStatus = Doc<"jobs">["status"];
type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type ActivityType = "assigned" | "status" | "completed" | "payment" | "email" | "reminder" | "manager_note";

const dayMs = 24 * 60 * 60 * 1000;
const periods: ReportPeriod[] = ["daily", "weekly", "monthly", "quarterly", "annual"];

export const getDetail = query({
  args: {
    employeeId: v.id("users")
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requireUser(ctx);
    const canViewAllEmployees = await hasAnyPermission(ctx, user, ["team.view", "reports.employee_performance"]);
    if (!canViewAllEmployees && args.employeeId !== userId) {
      throw new Error("You cannot view another employee's performance.");
    }

    const employee = await ctx.db.get(args.employeeId);
    if (!employee) return null;

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", args.employeeId))
      .take(500);
    const notes = canViewAllEmployees ? await loadEmployeeNotes(ctx, args.employeeId) : [];
    const reminders = await ctx.db
      .query("notifications")
      .withIndex("by_user_id", (q) => q.eq("userId", args.employeeId))
      .take(200);

    const [jobRows, activityRows, noteRows] = await Promise.all([
      Promise.all(jobs.map((job) => jobRow(ctx, job))),
      buildActivityTimeline(ctx, jobs, reminders, notes),
      Promise.all(
        notes.map(async (note) => ({
          ...note,
          createdBy: await ctx.db.get(note.createdBy)
        }))
      )
    ]);

    return {
      profile: employee,
      permissions: await getEffectivePermissionKeys(ctx, employee),
      canEditAccess: await hasPermission(ctx, user, "team.edit"),
      canChangeRoles: await hasPermission(ctx, user, "team.change_roles"),
      canChangePermissions: await hasPermission(ctx, user, "team.change_permissions"),
      canAddManagerNotes: await hasPermission(ctx, user, "reports.employee_performance"),
      jobs: jobRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      summary: performanceSummary(jobs),
      reports: periods.map((period) => employeePeriodReport(jobs, period)),
      activity: activityRows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 200),
      notes: noteRows.sort((a, b) => b.createdAt - a.createdAt),
      reminders: reminders.sort((a, b) => b.createdAt - a.createdAt)
    };
  }
});

export const addManagerNote = mutation({
  args: {
    employeeId: v.id("users"),
    noteType: v.union(v.literal("performance"), v.literal("training"), v.literal("follow_up")),
    body: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "reports.employee_performance");
    const employee = await ctx.db.get(args.employeeId);
    if (!employee) throw new Error("Employee not found.");
    const body = args.body.trim();
    if (!body) throw new Error("Note is required.");

    return await ctx.db.insert("employeeNotes", {
      employeeId: args.employeeId,
      noteType: args.noteType,
      body,
      createdBy: userId,
      createdAt: Date.now()
    });
  }
});

async function loadEmployeeNotes(ctx: QueryCtx, employeeId: Id<"users">) {
  return await ctx.db
    .query("employeeNotes")
    .withIndex("by_employee_id", (q) => q.eq("employeeId", employeeId))
    .take(200);
}

async function jobRow(ctx: QueryCtx, job: Doc<"jobs">) {
  const [customer, client] = await Promise.all([
    job.customerId ? ctx.db.get(job.customerId) : Promise.resolve(null),
    job.clientId ? ctx.db.get(job.clientId) : Promise.resolve(null)
  ]);
  const jobOrderId = makeJobOrderId(job);
  return {
    _id: job._id,
    jobOrderId,
    customerName: customer?.businessName ?? client?.clientName ?? "Unknown account",
    jobType: job.jobType,
    status: job.status,
    priority: job.priority,
    dueDate: job.dueDate,
    completedAt: job.completedAt ?? null,
    remainingBalance: remainingBalance(job),
    notes: job.notes ?? null,
    link: `/jobs/${jobOrderId}`
  };
}

async function buildActivityTimeline(
  ctx: QueryCtx,
  jobs: Doc<"jobs">[],
  reminders: Doc<"notifications">[],
  notes: Doc<"employeeNotes">[]
) {
  const rows: Array<{
    id: string;
    type: ActivityType;
    title: string;
    detail?: string | null;
    jobOrderId?: string | null;
    link?: string | null;
    createdAt: number;
  }> = [];

  for (const job of jobs.slice(0, 120)) {
    const jobOrderId = makeJobOrderId(job);
    const activities = await ctx.db
      .query("jobActivities")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .take(100);
    for (const activity of activities) {
      rows.push({
        id: `activity:${activity._id}`,
        type: activityType(activity.kind),
        title: activity.title,
        detail: activity.detail ?? null,
        jobOrderId,
        link: `/jobs/${jobOrderId}`,
        createdAt: activity.createdAt
      });
    }
  }

  for (const reminder of reminders) {
    rows.push({
      id: `reminder:${reminder._id}`,
      type: "reminder",
      title: reminder.title,
      detail: reminder.message,
      jobOrderId: null,
      link: reminder.link ?? null,
      createdAt: reminder.createdAt
    });
  }

  for (const note of notes) {
    rows.push({
      id: `employee-note:${note._id}`,
      type: "manager_note",
      title: noteTypeLabel(note.noteType),
      detail: note.body,
      jobOrderId: null,
      link: null,
      createdAt: note.createdAt
    });
  }

  return rows;
}

function performanceSummary(jobs: Doc<"jobs">[]) {
  const completed = jobs.filter((job) => isCompletedStatus(job.status));
  const open = jobs.filter((job) => isOpenStatus(job.status));
  const today = isoDate(Date.now());
  const completedLate = completed.filter((job) => isoDate(job.completedAt ?? job.updatedAt) > job.dueDate);
  const completedOnTime = completed.filter((job) => isoDate(job.completedAt ?? job.updatedAt) <= job.dueDate);

  return {
    totalAssignedJobs: jobs.length,
    completedJobs: completed.length,
    pendingJobs: open.length,
    inProgressJobs: jobs.filter((job) => job.status === "In Progress").length,
    overdueJobs: open.filter((job) => job.dueDate < today).length,
    completedWithBalance: completed.filter((job) => remainingBalance(job) > 0).length,
    completedOnTime: completedOnTime.length,
    completedLate: completedLate.length,
    achievementPercentage: jobs.length === 0 ? 0 : Math.round((completed.length / jobs.length) * 100)
  };
}

function employeePeriodReport(jobs: Doc<"jobs">[], period: ReportPeriod) {
  const bounds = periodBounds(period);
  const assignedDuringPeriod = jobs.filter((job) => msInRange(job.assignedAt ?? job.createdAt, bounds));
  const completedDuringPeriod = jobs.filter(
    (job) => isCompletedStatus(job.status) && msInRange(job.completedAt ?? job.updatedAt, bounds)
  );
  const notCompleted = assignedDuringPeriod.filter((job) => isOpenStatus(job.status));
  const overdue = jobs.filter((job) => isOpenStatus(job.status) && job.dueDate <= bounds.endDate);
  const completionTimes = completedDuringPeriod.map((job) =>
    Math.max(0, (job.completedAt ?? job.updatedAt) - (job.assignedAt ?? job.createdAt)) / dayMs
  );
  const averageCompletionTimeDays =
    completionTimes.length === 0
      ? 0
      : roundMoney(completionTimes.reduce((sum, value) => sum + value, 0) / completionTimes.length);

  return {
    period,
    periodStart: bounds.startDate,
    periodEnd: bounds.endDate,
    jobsAssignedDuringPeriod: assignedDuringPeriod.length,
    jobsCompletedDuringPeriod: completedDuringPeriod.length,
    jobsNotCompleted: notCompleted.length,
    jobsOverdue: overdue.length,
    averageCompletionTimeDays,
    balanceDueFromCompletedJobs: roundMoney(
      completedDuringPeriod.reduce((sum, job) => sum + remainingBalance(job), 0)
    )
  };
}

function activityType(kind: Doc<"jobActivities">["kind"]): ActivityType {
  if (kind === "assigned") return "assigned";
  if (kind === "completed") return "completed";
  if (kind === "payment") return "payment";
  if (kind === "email") return "email";
  return "status";
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

function makeJobOrderId(job: Doc<"jobs">) {
  return job.jobOrderId ?? `JO-${job._id.slice(-6).toUpperCase()}`;
}

function noteTypeLabel(noteType: Doc<"employeeNotes">["noteType"]) {
  if (noteType === "training") return "Training note";
  if (noteType === "follow_up") return "Follow-up note";
  return "Performance note";
}

function periodBounds(period: ReportPeriod) {
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
    return boundsFromDates(isoDate(Date.UTC(year, month, 1)), isoDate(Date.UTC(year, month + 1, 0)));
  }
  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    return boundsFromDates(
      isoDate(Date.UTC(year, quarterStartMonth, 1)),
      isoDate(Date.UTC(year, quarterStartMonth + 3, 0))
    );
  }
  return boundsFromDates(isoDate(Date.UTC(year, 0, 1)), isoDate(Date.UTC(year, 11, 31)));
}

function boundsFromDates(startDate: string, endDate: string) {
  return {
    startDate,
    endDate,
    startMs: dateMs(startDate),
    endMs: dateMs(endDate) + dayMs - 1
  };
}

function msInRange(ms: number, bounds: { startMs: number; endMs: number }) {
  return ms >= bounds.startMs && ms <= bounds.endMs;
}

function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dateMs(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}
