import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requirePermission, requireUser } from "./permissions";
import { notificationPriorityValidator, notificationTypeValidator } from "./validators";

type NotificationType = Doc<"notifications">["type"];
type NotificationPriority = Doc<"notifications">["priority"];
type JobStatus = Doc<"jobs">["status"];

const dayMs = 24 * 60 * 60 * 1000;

export const list = query({
  args: {
    unreadOnly: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const notifications = args.unreadOnly
      ? await ctx.db
          .query("notifications")
          .withIndex("by_user_id_and_is_read", (q) => q.eq("userId", userId).eq("isRead", false))
          .take(80)
      : await ctx.db
          .query("notifications")
          .withIndex("by_user_id", (q) => q.eq("userId", userId))
          .take(80);

    return notifications.sort((a, b) => b.createdAt - a.createdAt);
  }
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_is_read", (q) => q.eq("userId", userId).eq("isRead", false))
      .take(100);
    return unread.length;
  }
});

export const markRead = mutation({
  args: {
    notificationId: v.id("notifications")
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    if (notification.userId !== userId) {
      throw new Error("You can only update your own notifications.");
    }
    await ctx.db.patch(args.notificationId, { isRead: true });
    return null;
  }
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_id_and_is_read", (q) => q.eq("userId", userId).eq("isRead", false))
      .take(100);
    for (const notification of unread) {
      await ctx.db.patch(notification._id, { isRead: true });
    }
    return { updated: unread.length };
  }
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    jobId: v.optional(v.union(v.id("jobs"), v.null())),
    type: notificationTypeValidator,
    title: v.string(),
    message: v.string(),
    priority: notificationPriorityValidator,
    link: v.optional(v.union(v.string(), v.null())),
    dedupeKey: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_notifications");
    return await createNotificationOnce(ctx, {
      userId: args.userId,
      jobId: args.jobId ?? null,
      type: args.type,
      title: args.title,
      message: args.message,
      priority: args.priority,
      link: args.link ?? null,
      dedupeKey: args.dedupeKey ?? null,
      createdAt: Date.now()
    });
  }
});

export const checkJobDeadlines = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = isoDate(Date.now());
    const tomorrow = isoDate(Date.now() + dayMs);
    const jobs = await ctx.db.query("jobs").withIndex("by_due_date").take(1000);
    const managers = await listManagersAndOwners(ctx);
    const overdueByEmployee = new Map<Id<"users">, number>();

    for (const job of jobs) {
      if (isTerminalStatus(job.status)) continue;

      const accountName = await accountNameForJob(ctx, job);
      const employee = await ctx.db.get(job.assignedEmployeeId);
      const employeeName = employee?.name ?? employee?.email ?? "Assigned employee";
      const jobOrderId = job.jobOrderId ?? makeJobOrderId(job._id);
      const link = `/jobs/${jobOrderId}`;
      const deadlineAt = job.deadlineAt ?? dateMs(`${job.dueDate}T17:00:00.000Z`);
      const hoursRemaining = (deadlineAt - now) / (60 * 60 * 1000);

      if (hoursRemaining > 3 && hoursRemaining <= 24 && !job.reminder24hSentAt) {
        await createDeadlineReminder(ctx, {
          job,
          employeeName,
          accountName,
          jobOrderId,
          link,
          window: "24h",
          deadlineAt
        });
        await ctx.db.patch(job._id, { reminder24hSentAt: now });
      }

      if (hoursRemaining > 0 && hoursRemaining <= 3 && !job.reminder3hSentAt) {
        await createDeadlineReminder(ctx, {
          job,
          employeeName,
          accountName,
          jobOrderId,
          link,
          window: "3h",
          deadlineAt
        });
        await ctx.db.patch(job._id, { reminder3hSentAt: now });
      }

      if (job.dueDate === tomorrow) {
        await createNotificationOnce(ctx, {
          userId: job.assignedEmployeeId,
          jobId: job._id,
          type: "dueSoon",
          title: "Job due tomorrow",
          message: messageForJob(jobOrderId, accountName, job.jobType, job.dueDate, employeeName),
          priority: job.priority === "High" ? "high" : "medium",
          link,
          dedupeKey: `${today}:dueSoon:${job._id}:${job.assignedEmployeeId}`,
          createdAt: Date.now()
        });
      }

      if (job.dueDate === today) {
        await createNotificationOnce(ctx, {
          userId: job.assignedEmployeeId,
          jobId: job._id,
          type: "dueToday",
          title: "Job due today",
          message: messageForJob(jobOrderId, accountName, job.jobType, job.dueDate, employeeName),
          priority: "high",
          link,
          dedupeKey: `${today}:dueToday:${job._id}:${job.assignedEmployeeId}`,
          createdAt: Date.now()
        });
      }

      if (job.dueDate < today) {
        overdueByEmployee.set(job.assignedEmployeeId, (overdueByEmployee.get(job.assignedEmployeeId) ?? 0) + 1);
        if (job.status !== "Overdue") {
          await ctx.db.patch(job._id, {
            status: "Overdue",
            updatedAt: Date.now()
          });
          await ctx.db.insert("jobActivities", {
            jobId: job._id,
            kind: "status",
            title: "Job marked overdue",
            detail: `Due date ${job.dueDate} passed before completion.`,
            createdBy: null,
            createdAt: Date.now()
          });
        }
        await createNotificationOnce(ctx, {
          userId: job.assignedEmployeeId,
          jobId: job._id,
          type: "overdue",
          title: "Overdue job reminder",
          message: messageForJob(jobOrderId, accountName, job.jobType, job.dueDate, employeeName),
          priority: "high",
          link,
          dedupeKey: `${today}:overdue:${job._id}:${job.assignedEmployeeId}`,
          createdAt: Date.now()
        });

        if (daysPastDue(job.dueDate, today) >= 2) {
          for (const manager of managers) {
            await createNotificationOnce(ctx, {
              userId: manager._id,
              jobId: job._id,
              type: "managerAlert",
              title: "Job overdue more than 2 days",
              message: `${jobOrderId} - ${job.jobType} for ${accountName} is assigned to ${employeeName} and was due ${job.dueDate}.`,
              priority: "high",
              link,
              dedupeKey: `${today}:managerOverdue:${job._id}:${manager._id}`,
              createdAt: Date.now()
            });
          }
        }
      }

      if (job.amountPaid < job.fee && isCompletedStatus(job.status)) {
        await createNotificationOnce(ctx, {
          userId: job.assignedEmployeeId,
          jobId: job._id,
          type: "balance",
          title: "Completed job has balance due",
          message: `${jobOrderId} - ${job.jobType} for ${accountName} is complete with a remaining balance.`,
          priority: "medium",
          link,
          dedupeKey: `${today}:balance:${job._id}:${job.assignedEmployeeId}`,
          createdAt: Date.now()
        });
      }
    }

    for (const [employeeId, overdueCount] of overdueByEmployee.entries()) {
      if (overdueCount < 3) continue;
      const employee = await ctx.db.get(employeeId);
      const employeeName = employee?.name ?? employee?.email ?? "Team member";
      for (const manager of managers) {
        await createNotificationOnce(ctx, {
          userId: manager._id,
          jobId: null,
          type: "managerAlert",
          title: "Employee has multiple overdue jobs",
          message: `${employeeName} has ${overdueCount} overdue jobs that need review.`,
          priority: "high",
      link: "/",
      dedupeKey: `${today}:multiOverdue:${employeeId}:${manager._id}`,
      createdAt: Date.now()
        });
      }
    }

    return { checked: jobs.length };
  }
});

export const prepareEmail = internalQuery({
  args: {
    notificationId: v.id("notifications")
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    const user = await ctx.db.get(notification.userId);
    if (!user?.email) return null;
    return {
      notificationId: notification._id,
      recipientEmail: user.email,
      recipientName: user.name ?? user.email,
      subject: `${notification.title} - Center Business Services`,
      message: notification.message,
      link: notification.link ?? null,
      priority: notification.priority,
      emailStatus: notification.emailStatus ?? "queued"
    };
  }
});

export const markEmailSent = internalMutation({
  args: {
    notificationId: v.id("notifications")
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      emailStatus: "sent",
      emailSentAt: Date.now(),
      emailError: null
    });
    return null;
  }
});

export const markEmailFailed = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    errorMessage: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      emailStatus: "failed",
      emailSentAt: null,
      emailError: args.errorMessage
    });
    return null;
  }
});

export const markEmailSkipped = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    reason: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      emailStatus: "skipped",
      emailSentAt: null,
      emailError: args.reason
    });
    return null;
  }
});

async function createNotificationOnce(
  ctx: MutationCtx,
  notification: {
    userId: Id<"users">;
    jobId: Id<"jobs"> | null;
    type: NotificationType;
    title: string;
    message: string;
    priority: NotificationPriority;
    link: string | null;
    dedupeKey: string | null;
    createdAt: number;
  }
) {
  if (notification.dedupeKey) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", notification.dedupeKey))
      .first();
    if (existing) return existing._id;
  }
  const notificationId = await ctx.db.insert("notifications", {
    userId: notification.userId,
    jobId: notification.jobId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: false,
    priority: notification.priority,
    link: notification.link,
    dedupeKey: notification.dedupeKey,
    emailStatus: "queued",
    emailSentAt: null,
    emailError: null,
    createdAt: notification.createdAt
  });
  await ctx.scheduler.runAfter(0, internal.notificationEmailActions.sendNotificationEmail, {
    notificationId
  });
  return notificationId;
}

async function accountNameForJob(ctx: QueryCtx | MutationCtx, job: Doc<"jobs">) {
  const [customer, client] = await Promise.all([
    job.customerId ? ctx.db.get(job.customerId) : Promise.resolve(null),
    job.clientId ? ctx.db.get(job.clientId) : Promise.resolve(null)
  ]);
  return customer?.businessName ?? client?.clientName ?? "Unknown customer";
}

async function listManagersAndOwners(ctx: MutationCtx) {
  const [owners, managers, supervisors] = await Promise.all([
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "owner")).take(50),
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "manager")).take(50),
    ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "supervisor")).take(50)
  ]);
  return [...owners, ...managers, ...supervisors].filter(
    (user) => user.isActive !== false && user.accessStatus !== "suspended" && user.accessStatus !== "removed"
  );
}

function isCompletedStatus(status: JobStatus) {
  return status === "Completed" || status === "Completed With Balance";
}

function isTerminalStatus(status: JobStatus) {
  return isCompletedStatus(status) || status === "Cancelled";
}

function makeJobOrderId(jobId: Id<"jobs"> | string) {
  return `JO-${jobId.slice(-6).toUpperCase()}`;
}

function isoDate(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysPastDue(dueDate: string, today: string) {
  return Math.floor((dateMs(today) - dateMs(dueDate)) / dayMs);
}

function dateMs(date: string) {
  return new Date(date.includes("T") ? date : `${date}T00:00:00.000Z`).getTime();
}

function messageForJob(jobOrderId: string, accountName: string, jobType: string, dueDate: string, employeeName: string) {
  return `${jobOrderId} - ${jobType} for ${accountName} is due ${dueDate}. Assigned employee: ${employeeName}.`;
}

async function createDeadlineReminder(
  ctx: MutationCtx,
  args: {
    job: Doc<"jobs">;
    employeeName: string;
    accountName: string;
    jobOrderId: string;
    link: string;
    window: "24h" | "3h";
    deadlineAt: number;
  }
) {
  const title = args.window === "24h" ? "Task due within 24 hours" : "Task due within 3 hours";
  const notificationId = await createNotificationOnce(ctx, {
    userId: args.job.assignedEmployeeId,
    jobId: args.job._id,
    type: "dueSoon",
    title,
    message: `${args.jobOrderId} - ${args.job.jobType} for ${args.accountName} is assigned to ${args.employeeName} and is due ${new Date(args.deadlineAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC. Current status: ${args.job.status}.`,
    priority: args.window === "3h" ? "high" : "medium",
    link: args.link,
    dedupeKey: `deadline:${args.window}:${args.job._id}`,
    createdAt: Date.now()
  });
  await ctx.db.insert("auditLogs", {
    userId: null,
    action: `reminder.${args.window}.queued`,
    targetUserId: args.job.assignedEmployeeId,
    entityType: "jobs",
    entityId: args.job._id,
    newValue: notificationId,
    createdAt: Date.now()
  });
}
