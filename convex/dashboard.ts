import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { canManage, hasPermission, requirePermission } from "./permissions";
import { roundMoney } from "./balances";

function isCompletedStatus(status: Doc<"jobs">["status"]) {
  return status === "Completed" || status === "Completed With Balance";
}

function isOpenStatus(status: Doc<"jobs">["status"]) {
  return !isCompletedStatus(status) && status !== "Cancelled";
}

async function enrichJob(ctx: QueryCtx, job: Doc<"jobs">) {
  const [customer, client, assignedEmployee] = await Promise.all([
    job.customerId ? ctx.db.get(job.customerId) : Promise.resolve(null),
    job.clientId ? ctx.db.get(job.clientId) : Promise.resolve(null),
    ctx.db.get(job.assignedEmployeeId)
  ]);

  return {
    ...job,
    jobOrderId: job.jobOrderId ?? `JO-${job._id.slice(-6).toUpperCase()}`,
    remainingBalance: roundMoney(Math.max(0, job.fee - job.amountPaid)),
    customer,
    client,
    assignedEmployee
  };
}

export const metrics = query({
  args: {},
  handler: async (ctx) => {
    const { userId, role, user } = await requirePermission(ctx, "jobs.view");
    const canViewRevenue = await hasPermission(ctx, user, "reports.company_revenue");
    const canViewBalances = await hasPermission(ctx, user, "payments.view_balances");
    const canViewTeam = await hasPermission(ctx, user, "team.view");
    const jobs = canManage(role)
      ? await ctx.db.query("jobs").take(300)
      : await ctx.db
          .query("jobs")
          .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", userId))
          .take(300);

    const customers = canManage(role) ? await ctx.db.query("customers").take(300) : [];
    const clients = canManage(role)
      ? await ctx.db
          .query("clients")
          .withIndex("by_archived", (q) => q.eq("archived", false))
          .take(300)
      : [];
    const users = canManage(role) && canViewTeam
      ? await ctx.db.query("users").take(100)
      : [await ctx.db.get(userId)].filter((user): user is Doc<"users"> => user !== null);
    const totalRevenue = canViewRevenue ? jobs.reduce((sum, job) => sum + Number(job.amountPaid), 0) : 0;
    const outstanding = !canViewBalances
      ? 0
      : canManage(role)
      ? customers.reduce((sum, customer) => sum + Number(customer.balance), 0) +
        clients.reduce((sum, client) => sum + Number(client.balanceDue), 0)
      : jobs.reduce((sum, job) => sum + Math.max(0, Number(job.fee) - Number(job.amountPaid)), 0);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);

    const employeeWorkload = users
      .filter((user) => user.isActive !== false && user.role !== "owner")
      .map((user) => {
        const assigned = jobs.filter((job) => job.assignedEmployeeId === user._id);
        return {
          userId: user._id,
          name: user.name ?? user.email ?? "Team member",
          role: user.role ?? "employee",
          totalJobs: assigned.length,
          pendingJobs: assigned.filter((job) => isOpenStatus(job.status)).length,
          completedJobs: assigned.filter((job) => isCompletedStatus(job.status)).length,
          highPriorityJobs: assigned.filter(
            (job) => job.priority === "High" && isOpenStatus(job.status)
          ).length
        };
      })
      .sort((a, b) => b.pendingJobs - a.pendingJobs);

    const dueAlerts = jobs
      .filter((job) => isOpenStatus(job.status) && job.dueDate <= soon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5)
      .map((job) => ({
        kind: "dueDate" as const,
        severity: job.dueDate < today ? ("high" as const) : ("medium" as const),
        title: job.dueDate < today ? "Overdue job" : "Due soon",
        detail: `${job.jobType} is due ${job.dueDate}`,
        jobId: job._id
      }));

    const paymentAlerts = jobs
      .filter((job) => Math.max(0, job.fee - job.amountPaid) > 0)
      .sort((a, b) => Math.max(0, b.fee - b.amountPaid) - Math.max(0, a.fee - a.amountPaid))
      .slice(0, 5)
      .map((job) => ({
        kind: "unpaidInvoice" as const,
        severity: "medium" as const,
        title: "Outstanding invoice",
        detail: `${job.jobType} has ${roundMoney(Math.max(0, job.fee - job.amountPaid))} remaining`,
        jobId: job._id
      }));

    const recentJobs = await Promise.all(
      [...jobs]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
        .map((job) => enrichJob(ctx, job))
    );

    return {
      totalJobs: jobs.length,
      pendingJobs: jobs.filter((job) => isOpenStatus(job.status)).length,
      completedJobs: jobs.filter((job) => isCompletedStatus(job.status)).length,
      totalRevenue: roundMoney(totalRevenue),
      outstandingBalances: roundMoney(outstanding),
      highPriorityJobs: jobs.filter((job) => job.priority === "High" && isOpenStatus(job.status)).length,
      employeeWorkload,
      alerts: [...dueAlerts, ...paymentAlerts].slice(0, 8),
      recentJobs
    };
  }
});
