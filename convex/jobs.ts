import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertMoney,
  recalculateClientBalance,
  recalculateCustomerBalance,
  roundMoney
} from "./balances";
import { canManage, hasPermission, requirePermission } from "./permissions";
import { jobStatusValidator, priorityValidator } from "./validators";

type JobWithRelations = Doc<"jobs"> & {
  jobOrderId: string;
  remainingBalance: number;
  customer: Doc<"customers"> | null;
  client: Doc<"clients"> | null;
  assignedEmployee: Doc<"users"> | null;
};

type JobActivityKind = "created" | "assigned" | "status" | "payment" | "email" | "note" | "document" | "completed";
type JobStatus = Doc<"jobs">["status"];

type ActivityRow = {
  _id: string;
  jobId: Id<"jobs">;
  kind: JobActivityKind;
  title: string;
  detail?: string | null;
  createdBy?: Doc<"users"> | null;
  createdAt: number;
};

type JobDetails = {
  job: JobWithRelations;
  payments: Array<
    Omit<Doc<"payments">, "receivedBy"> & {
      job: JobWithRelations;
      customer: Doc<"customers"> | null;
      client: Doc<"clients"> | null;
      receivedBy: Doc<"users"> | null;
    }
  >;
  documents: Array<Omit<Doc<"jobDocuments">, "uploadedBy"> & { uploadedBy: Doc<"users"> | null }>;
  emails: Array<Omit<Doc<"jobEmails">, "sentBy"> & { sentBy: Doc<"users"> | null }>;
  notes: Array<Omit<Doc<"jobNotes">, "createdBy"> & { createdBy: Doc<"users"> | null }>;
  activities: ActivityRow[];
};

function makeJobOrderId(jobId: Id<"jobs"> | string) {
  return `JO-${jobId.slice(-6).toUpperCase()}`;
}

async function enrichJob(ctx: QueryCtx | MutationCtx, job: Doc<"jobs">): Promise<JobWithRelations> {
  const [customer, client, assignedEmployee] = await Promise.all([
    job.customerId ? ctx.db.get(job.customerId) : Promise.resolve(null),
    job.clientId ? ctx.db.get(job.clientId) : Promise.resolve(null),
    ctx.db.get(job.assignedEmployeeId)
  ]);

  return {
    ...job,
    jobOrderId: job.jobOrderId ?? makeJobOrderId(job._id),
    remainingBalance: roundMoney(Math.max(0, job.fee - job.amountPaid)),
    customer,
    client,
    assignedEmployee
  };
}

async function findJobByRouteId(ctx: QueryCtx, id: string) {
  const routeId = id.trim();
  const upperRouteId = routeId.toUpperCase();
  try {
    const directJob = await ctx.db.get(routeId as Id<"jobs">);
    if (directJob) return directJob;
  } catch {
    // Not a Convex id; continue with public job order lookup.
  }
  const indexedJobs = await ctx.db
    .query("jobs")
    .withIndex("by_job_order_id", (q) => q.eq("jobOrderId", upperRouteId))
    .take(1);
  if (indexedJobs[0]) return indexedJobs[0];
  const jobs = await ctx.db.query("jobs").take(1000);
  return jobs.find((job) => (job.jobOrderId ?? makeJobOrderId(job._id)) === upperRouteId) ?? null;
}

function canViewJob(role: "owner" | "manager" | "supervisor" | "employee" | "viewer", userId: Id<"users">, job: Doc<"jobs">) {
  return canManage(role) || job.assignedEmployeeId === userId;
}

function isCompletedStatus(status: JobStatus) {
  return status === "Completed" || status === "Completed With Balance";
}

async function addJobActivity(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    kind: JobActivityKind;
    title: string;
    detail?: string | null;
    createdBy?: Id<"users"> | null;
  }
) {
  await ctx.db.insert("jobActivities", {
    jobId: args.jobId,
    kind: args.kind,
    title: args.title,
    detail: args.detail ?? null,
    createdBy: args.createdBy ?? null,
    createdAt: Date.now()
  });
}

async function addAssignmentNotification(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    assignedEmployeeId: Id<"users">;
    jobOrderId: string;
    accountName: string;
    jobType: string;
    dueDate: string;
  }
) {
  const notificationId = await ctx.db.insert("notifications", {
    userId: args.assignedEmployeeId,
    jobId: args.jobId,
    type: "assigned",
    title: "New job assigned",
    message: `${args.jobOrderId} - ${args.jobType} for ${args.accountName} is due ${args.dueDate}.`,
    isRead: false,
    priority: "medium",
    link: `/jobs/${args.jobOrderId}`,
    dedupeKey: null,
    emailStatus: "queued",
    emailSentAt: null,
    emailError: null,
    createdAt: Date.now()
  });
  await ctx.scheduler.runAfter(0, internal.notificationEmailActions.sendNotificationEmail, {
    notificationId
  });
}

export const get = query({
  args: {
    id: v.string()
  },
  handler: async (ctx, args): Promise<JobDetails | null> => {
    const { userId, role, user } = await requirePermission(ctx, "jobs.view");
    const job = await findJobByRouteId(ctx, args.id);
    if (!job) return null;
    if (!canViewJob(role, userId, job)) {
      throw new Error("You can only view jobs assigned to you.");
    }
    const canViewPayments = await hasPermission(ctx, user, "payments.view");
    const canSendEmail = await hasPermission(ctx, user, "emails.send_client");

    const enrichedJob = await enrichJob(ctx, job);
    const [payments, documents, emails, notes, activities] = await Promise.all([
      ctx.db
        .query("payments")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(200),
      ctx.db
        .query("jobDocuments")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(200),
      ctx.db
        .query("jobEmails")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(200),
      ctx.db
        .query("jobNotes")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(200),
      ctx.db
        .query("jobActivities")
        .withIndex("by_job", (q) => q.eq("jobId", job._id))
        .take(300)
    ]);

    const [paymentsWithUsers, documentsWithUsers, emailsWithUsers, notesWithUsers, storedActivities] =
      await Promise.all([
        Promise.all(
          payments.map(async (payment) => ({
            ...payment,
            job: enrichedJob,
            customer: enrichedJob.customer,
            client: enrichedJob.client,
            receivedBy: await ctx.db.get(payment.receivedBy)
          }))
        ),
        Promise.all(
          documents.map(async (document) => ({
            ...document,
            uploadedBy: await ctx.db.get(document.uploadedBy)
          }))
        ),
        Promise.all(
          emails.map(async (email) => ({
            ...email,
            sentBy: await ctx.db.get(email.sentBy)
          }))
        ),
        Promise.all(
          notes.map(async (note) => ({
            ...note,
            createdBy: await ctx.db.get(note.createdBy)
          }))
        ),
        Promise.all(
          activities.map(async (activity) => ({
            _id: activity._id,
            jobId: activity.jobId,
            kind: activity.kind,
            title: activity.title,
            detail: activity.detail,
            createdBy: activity.createdBy ? await ctx.db.get(activity.createdBy) : null,
            createdAt: activity.createdAt
          }))
        )
      ]);

    const derivedActivities: ActivityRow[] = [
      {
        _id: `${job._id}-created`,
        jobId: job._id,
        kind: "created",
        title: "Job created",
        detail: `${makeJobOrderId(job._id)} opened for ${job.jobType}`,
        createdBy: null,
        createdAt: job.createdAt
      },
      {
        _id: `${job._id}-assigned`,
        jobId: job._id,
        kind: "assigned",
        title: "Assigned employee",
        detail: enrichedJob.assignedEmployee?.name ?? enrichedJob.assignedEmployee?.email ?? "Unassigned",
        createdBy: null,
        createdAt: job.createdAt
      }
    ];
    if (isCompletedStatus(job.status)) {
      derivedActivities.push({
        _id: `${job._id}-completed`,
        jobId: job._id,
        kind: "completed",
        title: job.fee > job.amountPaid ? "Completed with balance" : "Job completed",
        detail:
          job.fee > job.amountPaid
            ? `${roundMoney(job.fee - job.amountPaid)} still outstanding`
            : "No remaining balance",
        createdBy: null,
        createdAt: job.completedAt ?? job.updatedAt
      });
    }

    return {
      job: enrichedJob,
      payments: canViewPayments ? paymentsWithUsers.sort((a, b) => b.paidAt - a.paidAt) : [],
      documents: documentsWithUsers.sort((a, b) => b.uploadedAt - a.uploadedAt),
      emails: canSendEmail ? emailsWithUsers.sort((a, b) => b.sentAt - a.sentAt) : [],
      notes: notesWithUsers.sort((a, b) => b.createdAt - a.createdAt),
      activities: [...storedActivities, ...derivedActivities].sort((a, b) => b.createdAt - a.createdAt)
    };
  }
});

export const list = query({
  args: {
    status: v.optional(jobStatusValidator),
    employeeId: v.optional(v.id("users")),
    priority: v.optional(priorityValidator),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    search: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requirePermission(ctx, "jobs.view");
    let jobs: Doc<"jobs">[];

    if (!canManage(role)) {
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", userId))
        .take(200);
    } else if (args.customerId !== undefined) {
      const customerId = args.customerId;
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_customer", (q) => q.eq("customerId", customerId))
        .take(200);
    } else if (args.clientId !== undefined) {
      const clientId = args.clientId;
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_client", (q) => q.eq("clientId", clientId))
        .take(200);
    } else if (args.employeeId !== undefined) {
      const employeeId = args.employeeId;
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", employeeId))
        .take(200);
    } else if (args.status !== undefined) {
      const status = args.status;
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(200);
    } else if (args.priority !== undefined) {
      const priority = args.priority;
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_priority", (q) => q.eq("priority", priority))
        .take(200);
    } else {
      jobs = await ctx.db.query("jobs").take(200);
    }

    jobs = jobs.filter((job) => {
      if (args.status && job.status !== args.status) return false;
      if (args.employeeId && job.assignedEmployeeId !== args.employeeId) return false;
      if (args.priority && job.priority !== args.priority) return false;
      if (args.customerId && job.customerId !== args.customerId) return false;
      if (args.clientId && job.clientId !== args.clientId) return false;
      return true;
    });

    const enriched = await Promise.all(jobs.map((job) => enrichJob(ctx, job)));
    const search = args.search?.trim().toLowerCase();

    return enriched
      .filter((job) =>
        search
          ? `${job.jobType} ${job.customer?.businessName ?? ""} ${job.client?.clientName ?? ""} ${job.requestedBy ?? ""} ${job.clientContactPhone ?? ""} ${job.notes ?? ""}`
              .toLowerCase()
              .includes(search)
          : true
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }
});

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    jobType: v.string(),
    fee: v.number(),
    amountPaid: v.number(),
    assignedEmployeeId: v.id("users"),
    status: jobStatusValidator,
    dueDate: v.string(),
    deadlineAt: v.optional(v.number()),
    priority: priorityValidator,
    requestedBy: v.optional(v.string()),
    clientContactPhone: v.optional(v.string()),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePermission(ctx, "jobs.add");
    if (!(await hasPermission(ctx, user, "jobs.assign"))) {
      throw new Error("Permission required: Assign jobs.");
    }
    assertMoney(args.fee, "Fee");
    assertMoney(args.amountPaid, "Amount paid");
    if (args.amountPaid > args.fee) {
      throw new Error("Amount paid cannot exceed the job fee.");
    }

    const [customer, employee] = await Promise.all([
      ctx.db.get(args.customerId),
      ctx.db.get(args.assignedEmployeeId)
    ]);
    if (!customer) throw new Error("Customer not found.");
    if (!employee) throw new Error("Assigned employee not found.");

    const now = Date.now();
    const jobId = await ctx.db.insert("jobs", {
      customerId: args.customerId,
      jobType: args.jobType.trim(),
      fee: roundMoney(args.fee),
      amountPaid: roundMoney(args.amountPaid),
      assignedEmployeeId: args.assignedEmployeeId,
      status: args.status,
      dueDate: args.dueDate,
      deadlineAt: args.deadlineAt ?? null,
      reminder24hSentAt: null,
      reminder3hSentAt: null,
      priority: args.priority,
      requestedBy: cleanOptional(args.requestedBy),
      clientContactPhone: cleanOptional(args.clientContactPhone),
      notes: args.notes?.trim() ?? "",
      createdBy: userId,
      createdAt: now,
      assignedAt: now,
      completedAt: isCompletedStatus(args.status) ? now : null,
      updatedAt: now
    });
    await ctx.db.patch(jobId, { jobOrderId: makeJobOrderId(jobId) });

    if (args.amountPaid > 0) {
      await ctx.db.insert("payments", {
        jobId,
        customerId: args.customerId,
        amount: roundMoney(args.amountPaid),
        note: "Initial payment",
        receivedBy: userId,
        paidAt: now
      });
      await addJobActivity(ctx, {
        jobId,
        kind: "payment",
        title: "Initial payment received",
        detail: `${roundMoney(args.amountPaid)} received when the job was created`,
        createdBy: userId
      });
    }

    await addJobActivity(ctx, {
      jobId,
      kind: "created",
      title: "Job created",
      detail: `${makeJobOrderId(jobId)} opened for ${args.jobType.trim()}`,
      createdBy: userId
    });
    await addAssignmentNotification(ctx, {
      jobId,
      assignedEmployeeId: args.assignedEmployeeId,
      jobOrderId: makeJobOrderId(jobId),
      accountName: customer.businessName,
      jobType: args.jobType.trim(),
      dueDate: args.dueDate
    });
    await addAudit(ctx, userId, "task.created", jobId, null, args.jobType.trim());

    await recalculateCustomerBalance(ctx, args.customerId);
    return jobId;
  }
});

export const update = mutation({
  args: {
    jobId: v.id("jobs"),
    customerId: v.id("customers"),
    jobType: v.string(),
    fee: v.number(),
    assignedEmployeeId: v.id("users"),
    status: jobStatusValidator,
    dueDate: v.string(),
    deadlineAt: v.optional(v.number()),
    priority: priorityValidator,
    requestedBy: v.optional(v.string()),
    clientContactPhone: v.optional(v.string()),
    notes: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePermission(ctx, "jobs.edit");
    assertMoney(args.fee, "Fee");

    const existing = await ctx.db.get(args.jobId);
    if (!existing) throw new Error("Job not found.");
    if (existing.clientId) {
      throw new Error("Client jobs should be edited from the Clients page.");
    }
    if (args.fee < existing.amountPaid) {
      throw new Error("Fee cannot be lower than amount already paid.");
    }

    const previousCustomerId = existing.customerId;
    const assignmentChanged = existing.assignedEmployeeId !== args.assignedEmployeeId;
    const statusChanged = existing.status !== args.status;
    const deadlineChanged = existing.dueDate !== args.dueDate || (existing.deadlineAt ?? null) !== (args.deadlineAt ?? null);
    if (assignmentChanged && !(await hasPermission(ctx, user, "jobs.reassign"))) {
      throw new Error("Permission required: Reassign jobs.");
    }
    if (statusChanged && isCompletedStatus(args.status) && !(await hasPermission(ctx, user, "jobs.complete"))) {
      throw new Error("Permission required: Mark jobs completed.");
    }
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      customerId: args.customerId,
      jobType: args.jobType.trim(),
      fee: roundMoney(args.fee),
      assignedEmployeeId: args.assignedEmployeeId,
      status: args.status,
      dueDate: args.dueDate,
      deadlineAt: args.deadlineAt ?? null,
      reminder24hSentAt: deadlineChanged ? null : existing.reminder24hSentAt ?? null,
      reminder3hSentAt: deadlineChanged ? null : existing.reminder3hSentAt ?? null,
      priority: args.priority,
      requestedBy: cleanOptional(args.requestedBy),
      clientContactPhone: cleanOptional(args.clientContactPhone),
      notes: args.notes?.trim() ?? "",
      assignedAt: assignmentChanged ? now : existing.assignedAt ?? null,
      completedAt: isCompletedStatus(args.status) ? existing.completedAt ?? now : null,
      updatedAt: now
    });

    if (assignmentChanged) {
      const employee = await ctx.db.get(args.assignedEmployeeId);
      await addJobActivity(ctx, {
        jobId: args.jobId,
        kind: "assigned",
        title: "Assigned employee changed",
        detail: employee?.name ?? employee?.email ?? "New assignee",
        createdBy: userId
      });
      const customer = await ctx.db.get(args.customerId);
      await addAssignmentNotification(ctx, {
        jobId: args.jobId,
        assignedEmployeeId: args.assignedEmployeeId,
        jobOrderId: existing.jobOrderId ?? makeJobOrderId(args.jobId),
        accountName: customer?.businessName ?? "Customer",
        jobType: args.jobType.trim(),
        dueDate: args.dueDate
      });
      await addAudit(ctx, userId, "task.reassigned", args.jobId, existing.assignedEmployeeId, args.assignedEmployeeId);
    }
    if (statusChanged) {
      await addJobActivity(ctx, {
        jobId: args.jobId,
        kind: isCompletedStatus(args.status) ? "completed" : "status",
        title: "Status changed",
        detail: `${existing.status} to ${args.status}`,
        createdBy: userId
      });
      await addAudit(ctx, userId, "task.status_changed", args.jobId, existing.status, args.status);
    }
    if (deadlineChanged) {
      await addAudit(
        ctx,
        userId,
        "task.deadline_changed",
        args.jobId,
        String(existing.deadlineAt ?? existing.dueDate),
        String(args.deadlineAt ?? args.dueDate)
      );
    }

    if (previousCustomerId && previousCustomerId !== args.customerId) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
        .take(200);
      for (const payment of payments) {
        await ctx.db.patch(payment._id, { customerId: args.customerId });
      }
      await recalculateCustomerBalance(ctx, previousCustomerId);
    }

    await recalculateCustomerBalance(ctx, args.customerId);
    return null;
  }
});

function cleanOptional(value: string | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

export const updateStatus = mutation({
  args: {
    jobId: v.id("jobs"),
    status: jobStatusValidator
  },
  handler: async (ctx, args) => {
    const { userId, role, user } = await requirePermission(ctx, "jobs.view");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found.");

    if (!canManage(role) && job.assignedEmployeeId !== userId) {
      throw new Error("You can only update jobs assigned to you.");
    }
    const requiredPermission = isCompletedStatus(args.status) ? "jobs.complete" : "jobs.edit";
    if (!(await hasPermission(ctx, user, requiredPermission))) {
      throw new Error(
        requiredPermission === "jobs.complete"
          ? "Permission required: Mark jobs completed."
          : "Permission required: Edit jobs."
      );
    }

    const previousStatus = job.status;
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: args.status,
      completedAt: isCompletedStatus(args.status) ? job.completedAt ?? now : null,
      updatedAt: now
    });
    if (previousStatus !== args.status) {
      await addJobActivity(ctx, {
        jobId: args.jobId,
        kind: isCompletedStatus(args.status) ? "completed" : "status",
        title: "Status changed",
        detail: `${previousStatus} to ${args.status}`,
        createdBy: userId
      });
      await addAudit(ctx, userId, "task.status_changed", args.jobId, previousStatus, args.status);
    }
    return null;
  }
});

export const addNote = mutation({
  args: {
    jobId: v.id("jobs"),
    audience: v.union(v.literal("employee"), v.literal("manager"), v.literal("internal")),
    body: v.string()
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requirePermission(ctx, "jobs.view");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found.");
    if (role === "supervisor" || role === "viewer") {
      throw new Error("Supervisors and viewers can view notes but cannot add them.");
    }
    if (!canViewJob(role, userId, job)) {
      throw new Error("You can only add notes to jobs assigned to you.");
    }
    if (args.audience === "manager" && !canManage(role)) {
      throw new Error("Manager notes require manager access.");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Note is required.");

    const noteId = await ctx.db.insert("jobNotes", {
      jobId: args.jobId,
      audience: args.audience,
      body,
      createdBy: userId,
      createdAt: Date.now()
    });
    await addJobActivity(ctx, {
      jobId: args.jobId,
      kind: "note",
      title: "Internal note added",
      detail: body.slice(0, 120),
      createdBy: userId
    });
    await addAudit(ctx, userId, "task.note_added", args.jobId, null, body.slice(0, 180));
    return noteId;
  }
});

async function addAudit(
  ctx: MutationCtx,
  userId: Id<"users"> | null,
  action: string,
  jobId: Id<"jobs">,
  oldValue: string | null,
  newValue: string | null
) {
  await ctx.db.insert("auditLogs", {
    userId,
    action,
    entityType: "jobs",
    entityId: jobId,
    oldValue,
    newValue,
    createdAt: Date.now()
  });
}

export const addDocumentRecord = mutation({
  args: {
    jobId: v.id("jobs"),
    name: v.string(),
    fileType: v.string(),
    sizeLabel: v.optional(v.string()),
    url: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "jobs.edit");
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found.");
    const name = args.name.trim();
    if (!name) throw new Error("Document name is required.");
    const documentId = await ctx.db.insert("jobDocuments", {
      jobId: args.jobId,
      name,
      fileType: args.fileType.trim() || "Document",
      sizeLabel: cleanOptional(args.sizeLabel),
      url: cleanOptional(args.url),
      uploadedBy: userId,
      uploadedAt: Date.now()
    });
    await addJobActivity(ctx, {
      jobId: args.jobId,
      kind: "document",
      title: "Document added",
      detail: name,
      createdBy: userId
    });
    return documentId;
  }
});

export const remove = mutation({
  args: {
    jobId: v.id("jobs")
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "jobs.delete");
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
      .take(200);
    for (const payment of payments) {
      await ctx.db.delete(payment._id);
    }

    await ctx.db.delete(args.jobId);
    if (job.customerId) {
      await recalculateCustomerBalance(ctx, job.customerId);
    }
    if (job.clientId) {
      await recalculateClientBalance(ctx, job.clientId);
    }
    return null;
  }
});
