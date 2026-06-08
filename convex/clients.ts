import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { assertMoney, roundMoney } from "./balances";
import { canManage, hasPermission, requirePermission } from "./permissions";
import { clientTypeValidator, priorityValidator, recurrenceTypeValidator } from "./validators";

type ClientType = "Business" | "Individual";
type RecurrenceType = "none" | "monthly" | "quarterly" | "yearly";
type DemoTagKey = "bookkeeping" | "payroll" | "salesTax" | "license" | "taxReturn";

type ClientFieldArgs = {
  clientName: string;
  clientType: ClientType;
  businessLegalName?: string | null;
  dba?: string | null;
  businessCategory?: string | null;
  businessAddress?: string | null;
  mailingAddress?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  ownerContactPerson?: string | null;
  taxId?: string | null;
  assignedTeamMemberId?: Id<"users"> | null;
  balanceDue: number;
  notes?: string | null;
  tagIds?: Id<"tags">[];
};

type ClientWithRelations = Doc<"clients"> & {
  tags: Doc<"tags">[];
  assignedTeamMember: Doc<"users"> | null;
};

const clientJobInputValidator = v.object({
  jobType: v.string(),
  fee: v.number(),
  assignedEmployeeId: v.id("users"),
  dueDate: v.string(),
  priority: priorityValidator,
  requestedBy: v.optional(v.string()),
  clientContactPhone: v.optional(v.string()),
  amountPaid: v.optional(v.number()),
  notes: v.optional(v.string()),
  recurrenceType: recurrenceTypeValidator,
  nextDueDate: v.optional(v.union(v.string(), v.null())),
  autoCreateNextJob: v.boolean()
});

function makeJobOrderId(jobId: Id<"jobs"> | string) {
  return `JO-${jobId.slice(-6).toUpperCase()}`;
}

async function addAssignmentNotification(
  ctx: MutationCtx,
  args: {
    jobId: Id<"jobs">;
    assignedEmployeeId: Id<"users">;
    jobOrderId: string;
    clientName: string;
    jobType: string;
    dueDate: string;
  }
) {
  const notificationId = await ctx.db.insert("notifications", {
    userId: args.assignedEmployeeId,
    jobId: args.jobId,
    type: "assigned",
    title: "New job assigned",
    message: `${args.jobOrderId} - ${args.jobType} for ${args.clientName} is due ${args.dueDate}.`,
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

export const list = query({
  args: {
    archived: v.optional(v.boolean()),
    search: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId, role, user } = await requirePermission(ctx, "clients.view");
    const canViewBalance = await hasPermission(ctx, user, "clients.view_balance");
    const archived = args.archived ?? false;
    const search = args.search?.trim().toLowerCase();

    const clients = canManage(role)
      ? await ctx.db
          .query("clients")
          .withIndex("by_archived", (q) => q.eq("archived", archived))
          .take(500)
      : (
          await ctx.db
            .query("clients")
            .withIndex("by_assigned_team_member", (q) => q.eq("assignedTeamMemberId", userId))
            .take(500)
        ).filter((client) => client.archived === archived);

    const filtered = clients.filter((client) => {
      if (!search) return true;
      const haystack = [
        client.clientName,
        client.clientType,
        client.businessLegalName,
        client.dba,
        client.businessCategory,
        client.email,
        client.phoneNumber,
        client.ownerContactPerson,
        client.taxId
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

    const enriched = await Promise.all(filtered.map((client) => enrichClient(ctx, client)));
    if (!canViewBalance) {
      for (const client of enriched) client.balanceDue = 0;
    }
    return enriched.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }
});

export const get = query({
  args: {
    clientId: v.id("clients")
  },
  handler: async (ctx, args) => {
    const { userId, role, user } = await requirePermission(ctx, "clients.view");
    const client = await ctx.db.get(args.clientId);
    if (!client) return null;
    if (!canManage(role) && client.assignedTeamMemberId !== userId) {
      throw new Error("You can only view clients assigned to you.");
    }
    const enriched = await enrichClient(ctx, client);
    if (!(await hasPermission(ctx, user, "clients.view_balance"))) {
      enriched.balanceDue = 0;
    }
    return enriched;
  }
});

export const listTags = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "clients.view");
    return (await ctx.db.query("tags").take(200)).sort((a, b) => a.name.localeCompare(b.name));
  }
});

export const create = mutation({
  args: clientFieldsValidator(),
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "clients.add");
    assertMoney(args.balanceDue, "Balance due");

    const now = Date.now();
    const clientId = await ctx.db.insert("clients", {
      ...cleanClientArgs(args),
      balanceDue: roundMoney(args.balanceDue),
      archived: false,
      archivedAt: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });
    await replaceClientTags(ctx, clientId, args.tagIds ?? [], userId);
    return clientId;
  }
});

export const update = mutation({
  args: {
    clientId: v.id("clients"),
    ...clientFieldsValidator()
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "clients.edit");
    assertMoney(args.balanceDue, "Balance due");

    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Client not found.");

    await ctx.db.patch(args.clientId, {
      ...cleanClientArgs(args),
      balanceDue: roundMoney(args.balanceDue),
      updatedAt: Date.now()
    });
    await replaceClientTags(ctx, args.clientId, args.tagIds ?? [], userId);
    return null;
  }
});

export const archive = mutation({
  args: {
    clientId: v.id("clients"),
    archived: v.boolean()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "clients.archive");
    await ctx.db.patch(args.clientId, {
      archived: args.archived,
      archivedAt: args.archived ? Date.now() : null,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const bulkArchive = mutation({
  args: {
    clientIds: v.array(v.id("clients")),
    archived: v.boolean()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "clients.archive");
    const now = Date.now();
    let updated = 0;
    for (const clientId of args.clientIds) {
      const client = await ctx.db.get(clientId);
      if (!client) continue;
      await ctx.db.patch(clientId, {
        archived: args.archived,
        archivedAt: args.archived ? now : null,
        updatedAt: now
      });
      updated += 1;
    }
    return { updated };
  }
});

export const bulkAssignEmployee = mutation({
  args: {
    clientIds: v.array(v.id("clients")),
    assignedTeamMemberId: v.id("users")
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "jobs.assign");
    const employee = await ctx.db.get(args.assignedTeamMemberId);
    if (
      !employee ||
      employee.isActive === false ||
      employee.accessStatus === "suspended" ||
      employee.accessStatus === "removed"
    ) {
      throw new Error("Assigned employee not found or inactive.");
    }

    let updated = 0;
    const now = Date.now();
    for (const clientId of args.clientIds) {
      const client = await ctx.db.get(clientId);
      if (!client) continue;
      await ctx.db.patch(clientId, {
        assignedTeamMemberId: args.assignedTeamMemberId,
        updatedAt: now
      });
      updated += 1;
    }
    return { updated };
  }
});

export const bulkAssignTags = mutation({
  args: {
    clientIds: v.array(v.id("clients")),
    tagIds: v.array(v.id("tags"))
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "settings.manage_tags");
    for (const tagId of args.tagIds) {
      const tag = await ctx.db.get(tagId);
      if (!tag) throw new Error("One or more selected tags no longer exist.");
    }

    let updated = 0;
    for (const clientId of args.clientIds) {
      const client = await ctx.db.get(clientId);
      if (!client) continue;
      for (const tagId of args.tagIds) {
        await addClientTag(ctx, clientId, tagId, userId);
      }
      await ctx.db.patch(clientId, { updatedAt: Date.now() });
      updated += 1;
    }
    return { updated };
  }
});

export const bulkCreateJobs = mutation({
  args: {
    clientIds: v.array(v.id("clients")),
    jobType: v.string(),
    fee: v.number(),
    assignedEmployeeId: v.id("users"),
    dueDate: v.string(),
    priority: priorityValidator,
    requestedBy: v.optional(v.string()),
    clientContactPhone: v.optional(v.string()),
    amountPaid: v.optional(v.number()),
    notes: v.optional(v.string()),
    recurrenceType: recurrenceTypeValidator,
    nextDueDate: v.optional(v.union(v.string(), v.null())),
    autoCreateNextJob: v.boolean()
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePermission(ctx, "jobs.add");
    if (!(await hasPermission(ctx, user, "jobs.assign"))) {
      throw new Error("Permission required: Assign jobs.");
    }
    assertMoney(args.fee, "Fee");
    const amountPaid = roundMoney(args.amountPaid ?? 0);
    assertMoney(amountPaid, "Amount paid");
    if (amountPaid > args.fee) {
      throw new Error("Amount paid cannot exceed the job fee.");
    }

    const jobType = args.jobType.trim();
    if (jobType.length < 2) {
      throw new Error("Job type is required.");
    }

    const employee = await ctx.db.get(args.assignedEmployeeId);
    if (
      !employee ||
      employee.isActive === false ||
      employee.accessStatus === "suspended" ||
      employee.accessStatus === "removed"
    ) {
      throw new Error("Assigned employee not found or inactive.");
    }

    const recurrenceType: RecurrenceType = args.recurrenceType;
    const now = Date.now();
    const jobIds: Id<"jobs">[] = [];
    for (const clientId of args.clientIds) {
      const client = await ctx.db.get(clientId);
      if (!client || client.archived) continue;
      const fee = roundMoney(args.fee);
      const remainingBalance = roundMoney(Math.max(0, fee - amountPaid));
      const jobId = await ctx.db.insert("jobs", {
        clientId,
        jobType,
        fee,
        amountPaid,
        assignedEmployeeId: args.assignedEmployeeId,
        status: "Assigned",
        dueDate: args.dueDate,
        priority: args.priority,
        requestedBy: cleanOptional(args.requestedBy),
        clientContactPhone: cleanOptional(args.clientContactPhone),
        recurrenceType,
        nextDueDate: recurrenceType === "none" ? null : args.nextDueDate ?? null,
        autoCreateNextJob: recurrenceType === "none" ? false : args.autoCreateNextJob,
        notes: args.notes?.trim() ?? "",
        createdBy: userId,
        createdAt: now,
        assignedAt: now,
        completedAt: null,
        updatedAt: now
      });
      const jobOrderId = makeJobOrderId(jobId);
      await ctx.db.patch(jobId, { jobOrderId });
      if (amountPaid > 0) {
        await ctx.db.insert("payments", {
          jobId,
          clientId,
          amount: amountPaid,
          note: "Advance payment",
          receivedBy: userId,
          paidAt: now
        });
        await ctx.db.insert("jobActivities", {
          jobId,
          kind: "payment",
          title: "Advance payment received",
          detail: `${amountPaid} received when the job was created`,
          createdBy: userId,
          createdAt: now
        });
      }
      await ctx.db.insert("jobActivities", {
        jobId,
        kind: "created",
        title: "Job created",
        detail: `${jobType} created from the client page`,
        createdBy: userId,
        createdAt: now
      });
      await addAssignmentNotification(ctx, {
        jobId,
        assignedEmployeeId: args.assignedEmployeeId,
        jobOrderId,
        clientName: client.clientName,
        jobType,
        dueDate: args.dueDate
      });
      await ctx.db.patch(clientId, {
        balanceDue: roundMoney(Number(client.balanceDue ?? 0) + remainingBalance),
        updatedAt: now
      });
      jobIds.push(jobId);
    }
    return { created: jobIds.length, jobIds };
  }
});

export const createJobsForClient = mutation({
  args: {
    clientId: v.id("clients"),
    jobs: v.array(clientJobInputValidator)
  },
  handler: async (ctx, args) => {
    const { userId, user } = await requirePermission(ctx, "jobs.add");
    if (!(await hasPermission(ctx, user, "jobs.assign"))) {
      throw new Error("Permission required: Assign jobs.");
    }
    const client = await ctx.db.get(args.clientId);
    if (!client || client.archived) throw new Error("Client not found or archived.");
    if (args.jobs.length === 0) throw new Error("Add at least one job order.");

    const now = Date.now();
    const jobIds: Id<"jobs">[] = [];
    let balanceIncrease = 0;

    for (const job of args.jobs) {
      const jobType = job.jobType.trim();
      if (jobType.length < 2) throw new Error("Job type is required.");
      assertMoney(job.fee, "Fee");
      const amountPaid = roundMoney(job.amountPaid ?? 0);
      assertMoney(amountPaid, "Amount paid");

      const employee = await ctx.db.get(job.assignedEmployeeId);
      if (
        !employee ||
        employee.isActive === false ||
        employee.accessStatus === "suspended" ||
        employee.accessStatus === "removed"
      ) {
        throw new Error("Assigned employee not found or inactive.");
      }

      const recurrenceType: RecurrenceType = job.recurrenceType;
      const fee = roundMoney(job.fee);
      if (amountPaid > fee) {
        throw new Error("Amount paid cannot exceed the job fee.");
      }
      const jobId = await ctx.db.insert("jobs", {
        clientId: args.clientId,
        jobType,
        fee,
        amountPaid,
        assignedEmployeeId: job.assignedEmployeeId,
        status: "Assigned",
        dueDate: job.dueDate,
        priority: job.priority,
        requestedBy: cleanOptional(job.requestedBy),
        clientContactPhone: cleanOptional(job.clientContactPhone),
        recurrenceType,
        nextDueDate: recurrenceType === "none" ? null : job.nextDueDate ?? null,
        autoCreateNextJob: recurrenceType === "none" ? false : job.autoCreateNextJob,
        notes: job.notes?.trim() ?? "",
        createdBy: userId,
        createdAt: now,
        assignedAt: now,
        completedAt: null,
        updatedAt: now
      });
      const jobOrderId = makeJobOrderId(jobId);
      await ctx.db.patch(jobId, { jobOrderId });
      if (amountPaid > 0) {
        await ctx.db.insert("payments", {
          jobId,
          clientId: args.clientId,
          amount: amountPaid,
          note: "Advance payment",
          receivedBy: userId,
          paidAt: now
        });
        await ctx.db.insert("jobActivities", {
          jobId,
          kind: "payment",
          title: "Advance payment received",
          detail: `${amountPaid} received when the job was created`,
          createdBy: userId,
          createdAt: now
        });
      }
      await ctx.db.insert("jobActivities", {
        jobId,
        kind: "created",
        title: "Job created",
        detail: `${jobType} created from the client details page`,
        createdBy: userId,
        createdAt: now
      });
      await addAssignmentNotification(ctx, {
        jobId,
        assignedEmployeeId: job.assignedEmployeeId,
        jobOrderId,
        clientName: client.clientName,
        jobType,
        dueDate: job.dueDate
      });
      jobIds.push(jobId);
      balanceIncrease += roundMoney(Math.max(0, fee - amountPaid));
    }

    await ctx.db.patch(args.clientId, {
      balanceDue: roundMoney(Number(client.balanceDue ?? 0) + balanceIncrease),
      updatedAt: now
    });

    return { created: jobIds.length, jobIds };
  }
});

export const bulkSendEmail = mutation({
  args: {
    clientIds: v.array(v.id("clients")),
    subject: v.string(),
    message: v.string()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send_client");
    return {
      queued: args.clientIds.length,
      subject: args.subject.trim(),
      messagePreview: args.message.trim().slice(0, 120)
    };
  }
});

export const bulkCreateReminders = mutation({
  args: {
    clientIds: v.array(v.id("clients")),
    reminderDate: v.string(),
    message: v.string()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_notifications");
    return {
      created: args.clientIds.length,
      reminderDate: args.reminderDate,
      messagePreview: args.message.trim().slice(0, 120)
    };
  }
});

export const upsertTag = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "settings.manage_tags");
    return await upsertTagInternal(ctx, args.name, args.color ?? "#2563eb", userId);
  }
});

export const updateTag = mutation({
  args: {
    tagId: v.id("tags"),
    name: v.string(),
    color: v.string()
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_tags");
    const tag = await ctx.db.get(args.tagId);
    if (!tag) throw new Error("Tag not found.");

    const name = cleanTagName(args.name);
    const normalizedName = name.toLowerCase();
    const matching = await ctx.db
      .query("tags")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
      .first();
    if (matching && matching._id !== args.tagId) {
      throw new Error("A tag with that name already exists.");
    }

    await ctx.db.patch(args.tagId, {
      name,
      normalizedName,
      color: cleanTagColor(args.color),
      updatedAt: Date.now()
    });
    return null;
  }
});

export const removeTag = mutation({
  args: {
    tagId: v.id("tags")
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "settings.manage_tags");
    const tag = await ctx.db.get(args.tagId);
    if (!tag) return null;

    const links = await ctx.db
      .query("clientTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.tagId))
      .take(500);
    for (const link of links) {
      await ctx.db.delete(link._id);
    }
    await ctx.db.delete(args.tagId);
    return null;
  }
});

export const seedDemoClients = internalMutation({
  args: {
    ownerId: v.id("users"),
    managerId: v.id("users"),
    employeeId: v.id("users")
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_client_name", (q) => q.eq("clientName", "Luna Market"))
      .first();
    if (existing) {
      return { seeded: false };
    }

    const tagIds: Record<DemoTagKey, Id<"tags">> = {
      bookkeeping: await upsertTagInternal(ctx, "Bookkeeping", "#2563eb", args.ownerId),
      payroll: await upsertTagInternal(ctx, "Payroll", "#16845b", args.ownerId),
      salesTax: await upsertTagInternal(ctx, "Sales Tax", "#b56a04", args.ownerId),
      license: await upsertTagInternal(ctx, "Licensing", "#7c3aed", args.ownerId),
      taxReturn: await upsertTagInternal(ctx, "Tax Return", "#c93737", args.ownerId)
    };

    const now = Date.now();
    const demoClients = buildDemoClients(args.managerId, args.employeeId);
    for (const demo of demoClients) {
      const clientId = await ctx.db.insert("clients", {
        ...demo.client,
        createdBy: args.ownerId,
        createdAt: now,
        updatedAt: now
      });
      for (const tagKey of demo.tagKeys) {
        await addClientTag(ctx, clientId, tagIds[tagKey], args.ownerId);
      }
    }

    const recurringJobs = [
      {
        clientName: "Luna Market",
        jobType: "Monthly bookkeeping",
        fee: 450,
        assignedEmployeeId: args.employeeId,
        dueDate: "2026-06-05",
        priority: "Medium" as const,
        recurrenceType: "monthly" as const,
        nextDueDate: "2026-07-05"
      },
      {
        clientName: "Riverbend Deli",
        jobType: "Monthly sales tax filing",
        fee: 175,
        assignedEmployeeId: args.employeeId,
        dueDate: "2026-06-20",
        priority: "High" as const,
        recurrenceType: "monthly" as const,
        nextDueDate: "2026-07-20"
      },
      {
        clientName: "Maple Auto Repair",
        jobType: "Quarterly payroll reports",
        fee: 325,
        assignedEmployeeId: args.managerId,
        dueDate: "2026-07-15",
        priority: "Medium" as const,
        recurrenceType: "quarterly" as const,
        nextDueDate: "2026-10-15"
      }
    ];

    for (const recurringJob of recurringJobs) {
      const client = await ctx.db
        .query("clients")
        .withIndex("by_client_name", (q) => q.eq("clientName", recurringJob.clientName))
        .first();
      if (!client) continue;

      const jobId = await ctx.db.insert("jobs", {
        clientId: client._id,
        jobType: recurringJob.jobType,
        fee: recurringJob.fee,
        amountPaid: 0,
        assignedEmployeeId: recurringJob.assignedEmployeeId,
        status: "Assigned",
        dueDate: recurringJob.dueDate,
        priority: recurringJob.priority,
        recurrenceType: recurringJob.recurrenceType,
        nextDueDate: recurringJob.nextDueDate,
        autoCreateNextJob: true,
        notes: "Recurring demo job generated for the Clients workspace.",
        createdBy: args.ownerId,
        createdAt: now,
        assignedAt: now,
        completedAt: null,
        updatedAt: now
      });
      const jobOrderId = makeJobOrderId(jobId);
      await ctx.db.patch(jobId, { jobOrderId });
      await addAssignmentNotification(ctx, {
        jobId,
        assignedEmployeeId: recurringJob.assignedEmployeeId,
        jobOrderId,
        clientName: client.clientName,
        jobType: recurringJob.jobType,
        dueDate: recurringJob.dueDate
      });
      await ctx.db.patch(client._id, {
        balanceDue: roundMoney(client.balanceDue + recurringJob.fee),
        updatedAt: now
      });
    }

    return { seeded: true };
  }
});

async function enrichClient(ctx: QueryCtx, client: Doc<"clients">): Promise<ClientWithRelations> {
  const links = await ctx.db
    .query("clientTags")
    .withIndex("by_client", (q) => q.eq("clientId", client._id))
    .take(40);
  const [assignedTeamMember, tags] = await Promise.all([
    client.assignedTeamMemberId ? ctx.db.get(client.assignedTeamMemberId) : Promise.resolve(null),
    Promise.all(links.map((link) => ctx.db.get(link.tagId)))
  ]);

  return {
    ...client,
    assignedTeamMember,
    tags: tags.filter((tag): tag is Doc<"tags"> => tag !== null)
  };
}

function clientFieldsValidator() {
  return {
    clientName: v.string(),
    clientType: clientTypeValidator,
    businessLegalName: v.optional(v.union(v.string(), v.null())),
    dba: v.optional(v.union(v.string(), v.null())),
    businessCategory: v.optional(v.union(v.string(), v.null())),
    businessAddress: v.optional(v.union(v.string(), v.null())),
    mailingAddress: v.optional(v.union(v.string(), v.null())),
    phoneNumber: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    ownerContactPerson: v.optional(v.union(v.string(), v.null())),
    taxId: v.optional(v.union(v.string(), v.null())),
    assignedTeamMemberId: v.optional(v.union(v.id("users"), v.null())),
    balanceDue: v.number(),
    notes: v.optional(v.union(v.string(), v.null())),
    tagIds: v.optional(v.array(v.id("tags")))
  };
}

function cleanClientArgs(args: ClientFieldArgs) {
  const clientName = args.clientName.trim();
  if (clientName.length < 2) {
    throw new Error("Client name is required.");
  }

  return {
    clientName,
    clientType: args.clientType,
    businessLegalName: cleanOptional(args.businessLegalName),
    dba: cleanOptional(args.dba),
    businessCategory: cleanOptional(args.businessCategory),
    businessAddress: cleanOptional(args.businessAddress),
    mailingAddress: cleanOptional(args.mailingAddress),
    phoneNumber: cleanOptional(args.phoneNumber),
    email: cleanOptional(args.email),
    ownerContactPerson: cleanOptional(args.ownerContactPerson),
    taxId: cleanOptional(args.taxId),
    assignedTeamMemberId: args.assignedTeamMemberId ?? null,
    notes: cleanOptional(args.notes)
  };
}

async function replaceClientTags(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  tagIds: Id<"tags">[],
  userId: Id<"users">
) {
  const existing = await ctx.db
    .query("clientTags")
    .withIndex("by_client", (q) => q.eq("clientId", clientId))
    .take(100);
  for (const link of existing) {
    await ctx.db.delete(link._id);
  }
  for (const tagId of [...new Set(tagIds)]) {
    await addClientTag(ctx, clientId, tagId, userId);
  }
}

async function addClientTag(
  ctx: MutationCtx,
  clientId: Id<"clients">,
  tagId: Id<"tags">,
  userId: Id<"users">
) {
  const existing = await ctx.db
    .query("clientTags")
    .withIndex("by_client_and_tag", (q) => q.eq("clientId", clientId).eq("tagId", tagId))
    .first();
  if (!existing) {
    await ctx.db.insert("clientTags", {
      clientId,
      tagId,
      createdBy: userId,
      createdAt: Date.now()
    });
  }
}

async function upsertTagInternal(ctx: MutationCtx, nameInput: string, color: string, userId: Id<"users">) {
  const name = cleanTagName(nameInput);
  const normalizedName = name.toLowerCase();
  const existing = await ctx.db
    .query("tags")
    .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
    .first();
  if (existing) {
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("tags", {
    name,
    normalizedName,
    color: cleanTagColor(color),
    createdBy: userId,
    createdAt: now,
    updatedAt: now
  });
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function cleanTagName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new Error("Tag name is required.");
  }
  return name;
}

function cleanTagColor(value: string) {
  const color = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2563eb";
}

function buildDemoClients(managerId: Id<"users">, employeeId: Id<"users">) {
  const rows: Array<{
    clientName: string;
    clientType: ClientType;
    legal: string;
    dba: string;
    category: string;
    contact: string;
    balanceDue: number;
    tagKeys: DemoTagKey[];
  }> = [
    {
      clientName: "Luna Market",
      clientType: "Business",
      legal: "Luna Market LLC",
      dba: "Luna Market",
      category: "Convenience Store",
      contact: "Avery Brooks",
      balanceDue: 350,
      tagKeys: ["bookkeeping", "salesTax"]
    },
    {
      clientName: "Riverbend Deli",
      clientType: "Business",
      legal: "Riverbend Deli Inc.",
      dba: "Riverbend Deli",
      category: "Restaurant",
      contact: "Maya Carter",
      balanceDue: 225,
      tagKeys: ["license", "salesTax"]
    },
    {
      clientName: "Oak Supply Co.",
      clientType: "Business",
      legal: "Oak Supply Company",
      dba: "Oak Supply",
      category: "Wholesale",
      contact: "Noah Jenkins",
      balanceDue: 0,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "Maple Auto Repair",
      clientType: "Business",
      legal: "Maple Auto Repair LLC",
      dba: "Maple Auto",
      category: "Automotive",
      contact: "Eli Stone",
      balanceDue: 480,
      tagKeys: ["bookkeeping", "payroll"]
    },
    {
      clientName: "Bright Path Childcare",
      clientType: "Business",
      legal: "Bright Path Childcare LLC",
      dba: "Bright Path",
      category: "Childcare",
      contact: "Nora Lee",
      balanceDue: 125,
      tagKeys: ["payroll", "taxReturn"]
    },
    {
      clientName: "Cedar Ridge Rentals",
      clientType: "Business",
      legal: "Cedar Ridge Rentals LP",
      dba: "Cedar Ridge",
      category: "Real Estate",
      contact: "Camila Ortiz",
      balanceDue: 910,
      tagKeys: ["bookkeeping"]
    },
    {
      clientName: "Mason Food Mart",
      clientType: "Business",
      legal: "Mason Food Mart LLC",
      dba: "Mason Mart",
      category: "Convenience Store",
      contact: "Sam Mason",
      balanceDue: 175,
      tagKeys: ["salesTax", "license"]
    },
    {
      clientName: "Nashville Smoke Shop",
      clientType: "Business",
      legal: "Nashville Smoke Shop Inc.",
      dba: "Nash Smoke",
      category: "Retail Tobacco",
      contact: "Rita Shah",
      balanceDue: 640,
      tagKeys: ["license", "salesTax"]
    },
    {
      clientName: "Green Fork Catering",
      clientType: "Business",
      legal: "Green Fork Catering LLC",
      dba: "Green Fork",
      category: "Catering",
      contact: "Theo Wright",
      balanceDue: 300,
      tagKeys: ["bookkeeping", "taxReturn"]
    },
    {
      clientName: "Summit Logistics",
      clientType: "Business",
      legal: "Summit Logistics Group",
      dba: "Summit Logistics",
      category: "Transportation",
      contact: "Iris King",
      balanceDue: 0,
      tagKeys: ["payroll"]
    },
    {
      clientName: "Elena Rodriguez",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Individual Tax",
      contact: "Elena Rodriguez",
      balanceDue: 75,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "Marcus Hill",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Individual Tax",
      contact: "Marcus Hill",
      balanceDue: 0,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "Priya Raman",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Consultant",
      contact: "Priya Raman",
      balanceDue: 210,
      tagKeys: ["bookkeeping", "taxReturn"]
    },
    {
      clientName: "Dylan Carter",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Contractor",
      contact: "Dylan Carter",
      balanceDue: 95,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "Amara Wilson",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Individual Tax",
      contact: "Amara Wilson",
      balanceDue: 0,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "James Porter",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Contractor",
      contact: "James Porter",
      balanceDue: 185,
      tagKeys: ["bookkeeping"]
    },
    {
      clientName: "Hannah Kim",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Individual Tax",
      contact: "Hannah Kim",
      balanceDue: 40,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "Owen Patel",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Consultant",
      contact: "Owen Patel",
      balanceDue: 0,
      tagKeys: ["bookkeeping"]
    },
    {
      clientName: "Leah Thompson",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Individual Tax",
      contact: "Leah Thompson",
      balanceDue: 125,
      tagKeys: ["taxReturn"]
    },
    {
      clientName: "Victor Nguyen",
      clientType: "Individual",
      legal: "",
      dba: "",
      category: "Contractor",
      contact: "Victor Nguyen",
      balanceDue: 60,
      tagKeys: ["taxReturn"]
    }
  ];

  return rows.map((row, index) => {
    const city = index % 2 === 0 ? "Nashville" : "Memphis";
    return {
      client: {
        clientName: row.clientName,
        clientType: row.clientType,
        businessLegalName: row.legal || null,
        dba: row.dba || null,
        businessCategory: row.category,
        businessAddress: `${100 + index} Commerce St, ${city}, TN`,
        mailingAddress: `${200 + index} Mail Ave, ${city}, TN`,
        phoneNumber: `(615) 555-${String(1200 + index).slice(-4)}`,
        email: `${row.clientName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/\.$/, "")}@example.test`,
        ownerContactPerson: row.contact,
        taxId:
          row.clientType === "Business"
            ? `12-345${String(1000 + index).slice(-4)}`
            : `XXX-XX-${String(2000 + index).slice(-4)}`,
        assignedTeamMemberId: index % 3 === 0 ? managerId : employeeId,
        balanceDue: row.balanceDue,
        notes: index % 4 === 0 ? "Prefers email reminders before due dates." : "",
        archived: index === 19,
        archivedAt: index === 19 ? Date.now() : null
      },
      tagKeys: row.tagKeys
    };
  });
}
