import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { recalculateClientBalance, recalculateCustomerBalance, roundMoney } from "./balances";
import { canManage, getEffectivePermissionKeys, hasPermission, requireUser } from "./permissions";

const proposalAction = v.union(
  v.literal("add_note"),
  v.literal("complete_task"),
  v.literal("change_deadline"),
  v.literal("change_status"),
  v.literal("record_payment"),
  v.literal("create_client"),
  v.literal("create_service"),
  v.literal("create_scheduled_task"),
  v.literal("reassign_task")
);

export const ask = action({
  args: { message: v.string() },
  handler: async (ctx, args): Promise<{ text: string; proposalId?: Id<"chatProposals"> }> => {
    const message = args.message.trim();
    if (!message) throw new Error("Enter a question.");
    const context = await ctx.runQuery(internal.chatbot.getContext, {});
    const command = parseCommand(message);
    if (command) {
      const job = command.jobOrderId
        ? context.jobs.find((row) => row.jobOrderId.toUpperCase() === command.jobOrderId?.toUpperCase())
        : null;
      if (command.jobOrderId && !job) {
        throw new Error("That task was not found or you do not have permission to access it.");
      }
      const proposalId = await ctx.runMutation(internal.chatbot.createProposal, {
        action: command.action,
        jobId: job?._id ?? null,
        payload: command.payload,
        summary: command.summary.replace("{{task}}", job ? `${job.jobOrderId} ${job.jobType}` : "")
      });
      return {
        text: `I prepared this action for your approval: ${command.summary.replace("{{task}}", job ? `${job.jobOrderId} ${job.jobType}` : "")}`,
        proposalId
      };
    }

    const fallback = summarizeContext(context.jobs, message);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { text: fallback };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        reasoning: { effort: "medium" },
        input: [
          {
            role: "system",
            content:
              "You are Center A.I bot inside Center Business Services. Answer only from the provided permission-scoped CRM context. Be concise, practical, and professional. Format responses as clean Markdown: use short descriptive headings, compact bullet lists, bold job IDs and important statuses, and inline code only for commands. Keep each job on one bullet. Avoid long introductions, excessive headings, raw tables, and repeated advice. Put suggested commands in one final 'Next actions' section only when useful. Never claim data changed unless a confirmed action result says it changed."
          },
          {
            role: "user",
            content: `Role: ${context.role}\nPermissions: ${context.permissions.join(", ")}\nQuestion: ${message}\nCRM context:\n${JSON.stringify(context)}`
          }
        ],
        max_output_tokens: 700
      })
    });
    const payload = (await response.json().catch(() => null)) as OpenAIResponse | null;
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    return { text: extractOpenAIText(payload) || fallback };
  }
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireUser(ctx);
    return await ctx.db
      .query("chatProposals")
      .withIndex("by_user_id_and_status", (q) => q.eq("userId", userId).eq("status", "pending"))
      .order("desc")
      .take(20);
  }
});

export const confirm = mutation({
  args: { proposalId: v.id("chatProposals"), approved: v.boolean() },
  handler: async (ctx, args) => {
    const { userId, role, user } = await requireUser(ctx);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.userId !== userId) throw new Error("Chatbot proposal not found.");
    if (proposal.status !== "pending" || proposal.expiresAt < Date.now()) {
      throw new Error("This chatbot proposal is no longer available.");
    }
    if (!args.approved) {
      await ctx.db.patch(proposal._id, { status: "cancelled", confirmedAt: Date.now() });
      return "Action cancelled.";
    }

    const job = proposal.jobId ? await ctx.db.get(proposal.jobId) : null;
    const now = Date.now();
    let affectedEntityId: Id<"jobs"> | Id<"clients"> | Id<"services"> | null = proposal.jobId ?? null;
    let affectedEntityType = proposal.jobId ? "jobs" : proposal.action === "create_client" ? "clients" : "services";
    if (proposal.action === "add_note") {
      if (!job || (!canManage(role) && job.assignedEmployeeId !== userId)) throw new Error("You do not have permission to change this task.");
      const body = proposal.payload.trim();
      if (!body) throw new Error("Note is empty.");
      await ctx.db.insert("jobNotes", { jobId: job._id, audience: "employee", body, createdBy: userId, createdAt: now });
      await ctx.db.insert("jobActivities", {
        jobId: job._id,
        kind: "note",
        title: "Note added by chatbot",
        detail: body.slice(0, 120),
        createdBy: userId,
        createdAt: now
      });
    } else if (proposal.action === "complete_task") {
      if (!job || !(await hasPermission(ctx, user, "jobs.complete")) || (!canManage(role) && job.assignedEmployeeId !== userId)) {
        throw new Error("permission required: Mark jobs completed.");
      }
      await ctx.db.patch(job._id, { status: "Completed", completedAt: now, updatedAt: now });
      await ctx.db.insert("jobActivities", {
        jobId: job._id,
        kind: "completed",
        title: "Task completed by chatbot",
        createdBy: userId,
        createdAt: now
      });
    } else if (proposal.action === "change_deadline") {
      if (!job || !(await hasPermission(ctx, user, "jobs.edit"))) throw new Error("Permission required: Edit jobs.");
      const deadlineAt = Number(proposal.payload);
      if (!Number.isFinite(deadlineAt)) throw new Error("Invalid deadline.");
      await ctx.db.patch(job._id, {
        dueDate: new Date(deadlineAt).toISOString().slice(0, 10),
        deadlineAt,
        reminder24hSentAt: null,
        reminder3hSentAt: null,
        updatedAt: now
      });
    } else if (proposal.action === "change_status") {
      if (!job || (!canManage(role) && job.assignedEmployeeId !== userId)) throw new Error("You do not have permission to change this task.");
      const status = parseJobStatus(proposal.payload);
      const permission = isCompletedStatus(status) ? "jobs.complete" : "jobs.edit";
      if (!(await hasPermission(ctx, user, permission))) throw new Error(`Permission required: ${permission === "jobs.complete" ? "Mark jobs completed" : "Edit jobs"}.`);
      await ctx.db.patch(job._id, { status, completedAt: isCompletedStatus(status) ? job.completedAt ?? now : null, updatedAt: now });
      await ctx.db.insert("jobActivities", { jobId: job._id, kind: isCompletedStatus(status) ? "completed" : "status", title: "Status changed by Center A.I bot", detail: `${job.status} to ${status}`, createdBy: userId, createdAt: now });
    } else if (proposal.action === "record_payment") {
      if (!job || !(await hasPermission(ctx, user, "payments.add"))) throw new Error("Permission required: Add payments.");
      const data = parsePayload<{ amount: number; note: string }>(proposal.payload);
      const amount = roundMoney(Number(data.amount));
      if (!Number.isFinite(amount) || amount <= 0 || job.amountPaid + amount > job.fee) throw new Error("Payment must be positive and cannot exceed the remaining balance.");
      await ctx.db.insert("payments", { jobId: job._id, customerId: job.customerId, clientId: job.clientId, amount, note: data.note, receivedBy: userId, paidAt: now });
      const amountPaid = roundMoney(job.amountPaid + amount);
      await ctx.db.patch(job._id, { amountPaid, status: amountPaid >= job.fee ? "Completed" : job.status, completedAt: amountPaid >= job.fee ? job.completedAt ?? now : job.completedAt, updatedAt: now });
      if (job.customerId) await recalculateCustomerBalance(ctx, job.customerId);
      if (job.clientId) await recalculateClientBalance(ctx, job.clientId);
    } else if (proposal.action === "create_client") {
      if (!(await hasPermission(ctx, user, "clients.add"))) throw new Error("Permission required: Add clients.");
      const data = parsePayload<{ name: string; email: string | null; phone: string | null }>(proposal.payload);
      const name = data.name.trim();
      if (!name) throw new Error("Client name is required.");
      affectedEntityId = await ctx.db.insert("clients", { clientName: name, clientType: "Business", email: cleanNullable(data.email), phoneNumber: cleanNullable(data.phone), assignedTeamMemberId: null, balanceDue: 0, notes: null, archived: false, archivedAt: null, createdBy: userId, createdAt: now, updatedAt: now });
    } else if (proposal.action === "create_service") {
      if (!(await hasPermission(ctx, user, "settings.manage_services"))) throw new Error("Permission required: Manage services.");
      const data = parsePayload<{ name: string; fee: number | null }>(proposal.payload);
      const name = data.name.trim().replace(/\s+/g, " ");
      if (name.length < 2) throw new Error("Service name is required.");
      const normalizedName = name.toLowerCase();
      const existing = await ctx.db.query("services").withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName)).first();
      if (existing) {
        await ctx.db.patch(existing._id, { name, defaultFee: data.fee, isActive: true, updatedAt: now });
        affectedEntityId = existing._id;
      } else {
        affectedEntityId = await ctx.db.insert("services", { name, normalizedName, defaultFee: data.fee, isActive: true, createdBy: userId, createdAt: now, updatedAt: now });
      }
    } else if (proposal.action === "reassign_task") {
      if (!job || !(await hasPermission(ctx, user, "jobs.edit")) || !(await hasPermission(ctx, user, "jobs.reassign"))) {
        throw new Error("Permission required: Edit and reassign jobs.");
      }
      const data = parsePayload<{ assignee: string }>(proposal.payload);
      const employee = await findActiveUser(ctx, data.assignee);
      const customer = job.customerId ? await ctx.db.get(job.customerId) : null;
      await ctx.db.patch(job._id, { assignedEmployeeId: employee._id, assignedAt: now, updatedAt: now });
      await ctx.db.insert("jobActivities", { jobId: job._id, kind: "assigned", title: "Task reassigned by Center A.I bot", detail: employee.name ?? employee.email ?? data.assignee, createdBy: userId, createdAt: now });
      await addAssignmentNotification(ctx, job, employee._id, customer?.businessName ?? "Customer");
    } else {
      if (!(await hasPermission(ctx, user, "jobs.add")) || !(await hasPermission(ctx, user, "jobs.assign"))) {
        throw new Error("Permission required: Add and assign jobs.");
      }
      const data = parsePayload<{ jobType: string; customer: string; assignee: string; deadlineAt: number; priority: Doc<"jobs">["priority"]; fee: number }>(proposal.payload);
      const customer = await findCustomer(ctx, data.customer);
      const employee = await findActiveUser(ctx, data.assignee);
      const fee = roundMoney(Number(data.fee));
      if (!data.jobType.trim()) throw new Error("Task name is required.");
      if (!Number.isFinite(data.deadlineAt)) throw new Error("Invalid deadline.");
      if (!Number.isFinite(fee) || fee < 0) throw new Error("Fee cannot be negative.");
      const jobId = await ctx.db.insert("jobs", {
        customerId: customer._id,
        jobType: data.jobType.trim(),
        fee,
        amountPaid: 0,
        assignedEmployeeId: employee._id,
        status: "Assigned",
        dueDate: new Date(data.deadlineAt).toISOString().slice(0, 10),
        deadlineAt: data.deadlineAt,
        reminder24hSentAt: null,
        reminder3hSentAt: null,
        priority: data.priority,
        notes: "",
        createdBy: userId,
        createdAt: now,
        assignedAt: now,
        completedAt: null,
        updatedAt: now
      });
      const jobOrderId = makeJobOrderId(jobId);
      await ctx.db.patch(jobId, { jobOrderId });
      await ctx.db.insert("jobActivities", { jobId, kind: "created", title: "Task scheduled by Center A.I bot", detail: `${jobOrderId} opened for ${data.jobType.trim()}`, createdBy: userId, createdAt: now });
      await addAssignmentNotification(ctx, { _id: jobId, jobOrderId, dueDate: new Date(data.deadlineAt).toISOString().slice(0, 10), jobType: data.jobType.trim() }, employee._id, customer.businessName);
      await recalculateCustomerBalance(ctx, customer._id);
      affectedEntityId = jobId;
      affectedEntityType = "jobs";
      await ctx.db.patch(proposal._id, { jobId });
    }
    await ctx.db.patch(proposal._id, { status: "confirmed", confirmedAt: now });
    await ctx.db.insert("auditLogs", {
      userId,
      action: `chatbot.${proposal.action}.confirmed`,
      entityType: affectedEntityType,
      entityId: affectedEntityId,
      newValue: proposal.summary,
      createdAt: now
    });
    return `Completed: ${proposal.summary}`;
  }
});

export const getContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { userId, role, user } = await requireUser(ctx);
    const permissions = await getEffectivePermissionKeys(ctx, user);
    const jobs = canManage(role)
      ? await ctx.db.query("jobs").take(200)
      : await ctx.db.query("jobs").withIndex("by_assigned_employee", (q) => q.eq("assignedEmployeeId", userId)).take(200);
    const clients = permissions.includes("clients.view")
      ? canManage(role)
        ? await ctx.db.query("clients").withIndex("by_archived", (q) => q.eq("archived", false)).take(100)
        : await ctx.db.query("clients").withIndex("by_assigned_team_member", (q) => q.eq("assignedTeamMemberId", userId)).take(100)
      : [];
    const team = permissions.includes("team.view") && canManage(role) ? await ctx.db.query("users").take(100) : [];
    return {
      role,
      permissions,
      jobs: jobs.map((job) => ({
        _id: job._id,
        jobOrderId: job.jobOrderId ?? `JO-${job._id.slice(-6).toUpperCase()}`,
        jobType: job.jobType,
        status: job.status,
        priority: job.priority,
        dueDate: job.dueDate,
        deadlineAt: job.deadlineAt ?? null,
        assignedEmployeeId: job.assignedEmployeeId,
        fee: permissions.includes("payments.view_balances") ? job.fee : null,
        amountPaid: permissions.includes("payments.view_balances") ? job.amountPaid : null
      })),
      clients: clients.map((client) => ({ name: client.clientName, type: client.clientType, balanceDue: permissions.includes("clients.view_balance") ? client.balanceDue : null })),
      team: team.map((member) => ({ name: member.name ?? member.email ?? "Team member", role: member.role, active: member.isActive !== false }))
    };
  }
});

export const createProposal = internalMutation({
  args: {
    action: proposalAction,
    jobId: v.union(v.id("jobs"), v.null()),
    payload: v.string(),
    summary: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requireUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("chatProposals", {
      userId,
      action: args.action,
      jobId: args.jobId,
      payload: args.payload,
      summary: args.summary,
      status: "pending",
      createdAt: now,
      expiresAt: now + 15 * 60 * 1000,
      confirmedAt: null
    });
  }
});

function parseCommand(message: string) {
  const note = message.match(/add\s+(?:a\s+)?note\s+to\s+(JO-[A-Z0-9]+)\s*[:\-]\s*(.+)/i);
  if (note) {
    return { action: "add_note" as const, jobOrderId: note[1], payload: note[2], summary: `Add note to {{task}}: ${note[2]}` };
  }
  const complete = message.match(/mark\s+(JO-[A-Z0-9]+)\s+(?:as\s+)?completed?/i);
  if (complete) {
    return { action: "complete_task" as const, jobOrderId: complete[1], payload: "", summary: "Mark {{task}} completed" };
  }
  const deadline = message.match(/change\s+(?:the\s+)?deadline\s+(?:for\s+)?(JO-[A-Z0-9]+)\s+to\s+(.+)/i);
  if (deadline) {
    const timestamp = Date.parse(deadline[2]);
    if (!Number.isFinite(timestamp)) throw new Error("Use a clear deadline such as 2026-06-10 3:00 PM.");
    return {
      action: "change_deadline" as const,
      jobOrderId: deadline[1],
      payload: String(timestamp),
      summary: `Change deadline for {{task}} to ${new Date(timestamp).toLocaleString("en-US")}`
    };
  }
  const status = message.match(/(?:change|set|update)\s+(?:the\s+)?status\s+(?:for|of)\s+(JO-[A-Z0-9]+)\s+to\s+(.+)/i);
  if (status) {
    const value = parseJobStatus(status[2]);
    return { action: "change_status" as const, jobOrderId: status[1], payload: value, summary: `Change {{task}} status to ${value}` };
  }
  const payment = message.match(/record\s+(?:a\s+)?payment\s+(?:of\s+)?\$?([\d,.]+)\s+(?:for|to)\s+(JO-[A-Z0-9]+)(?:\s*[:\-]\s*(.+))?/i);
  if (payment) {
    const amount = Number(payment[1].replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid positive payment amount.");
    return { action: "record_payment" as const, jobOrderId: payment[2], payload: JSON.stringify({ amount, note: payment[3]?.trim() ?? "Recorded by Center A.I bot" }), summary: `Record $${amount.toFixed(2)} payment for {{task}}` };
  }
  const reassign = message.match(/(?:assign|reassign)\s+(?:task\s+)?(JO-[A-Z0-9]+)\s+to\s+(.+)/i);
  if (reassign) {
    const assignee = reassign[2].trim();
    return { action: "reassign_task" as const, jobOrderId: reassign[1], payload: JSON.stringify({ assignee }), summary: `Reassign {{task}} to ${assignee}` };
  }
  const scheduledTask = message.match(/(?:create\s+(?:a\s+)?scheduled\s+task|schedule\s+(?:a\s+)?task)\s+(.+?)\s+for\s+(.+?)\s+(?:assign|assigned)\s+to\s+(.+?)\s+due\s+(.+?)(?:\s+priority\s+(low|medium|high))?(?:\s+fee\s+\$?([\d,.]+))?$/i);
  if (scheduledTask) {
    const deadlineAt = Date.parse(scheduledTask[4]);
    const fee = scheduledTask[6] ? Number(scheduledTask[6].replace(/,/g, "")) : 0;
    if (!Number.isFinite(deadlineAt)) throw new Error("Use a clear deadline such as 2026-07-15 3:00 PM.");
    if (!Number.isFinite(fee) || fee < 0) throw new Error("Enter a valid non-negative fee.");
    const priority = normalizePriority(scheduledTask[5]);
    return {
      action: "create_scheduled_task" as const,
      payload: JSON.stringify({ jobType: scheduledTask[1].trim(), customer: scheduledTask[2].trim(), assignee: scheduledTask[3].trim(), deadlineAt, priority, fee }),
      summary: `Schedule ${scheduledTask[1].trim()} for ${scheduledTask[2].trim()}, assigned to ${scheduledTask[3].trim()}, due ${new Date(deadlineAt).toLocaleString("en-US")}`
    };
  }
  const client = message.match(/create\s+(?:a\s+)?client\s+(.+?)(?:\s+email\s+(\S+@\S+))?(?:\s+phone\s+(.+))?$/i);
  if (client) {
    return { action: "create_client" as const, payload: JSON.stringify({ name: client[1].trim(), email: client[2] ?? null, phone: client[3]?.trim() ?? null }), summary: `Create client ${client[1].trim()}` };
  }
  const service = message.match(/create\s+(?:a\s+)?service\s+(.+?)(?:\s+(?:with\s+)?fee\s+\$?([\d,.]+))?$/i);
  if (service) {
    const fee = service[2] ? Number(service[2].replace(/,/g, "")) : null;
    return { action: "create_service" as const, payload: JSON.stringify({ name: service[1].trim(), fee }), summary: `Create service ${service[1].trim()}${fee !== null ? ` with a $${fee.toFixed(2)} default fee` : ""}` };
  }
  return null;
}

function summarizeContext(jobs: Array<Pick<Doc<"jobs">, "status" | "dueDate"> & { jobOrderId: string; jobType: string }>, message: string) {
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const lower = message.toLowerCase();
  const selected = lower.includes("overdue")
    ? jobs.filter((job) => job.dueDate < today && !job.status.startsWith("Completed"))
    : lower.includes("today")
      ? jobs.filter((job) => job.dueDate === today)
      : lower.includes("week") || lower.includes("soon")
        ? jobs.filter((job) => job.dueDate >= today && job.dueDate <= week)
        : jobs.filter((job) => !job.status.startsWith("Completed"));
  if (!selected.length) return "No matching tasks were found in the records you are allowed to view.";
  return selected.slice(0, 20).map((job) => `${job.jobOrderId}: ${job.jobType} - ${job.status}, due ${job.dueDate}`).join("\n");
}

const jobStatuses: Doc<"jobs">["status"][] = ["New", "Assigned", "In Progress", "Waiting on Client", "Waiting on Government", "Completed", "Completed With Balance", "Overdue", "Cancelled"];
function parseJobStatus(value: string): Doc<"jobs">["status"] {
  const normalized = value.trim().toLowerCase();
  const status = jobStatuses.find((item) => item.toLowerCase() === normalized);
  if (!status) throw new Error(`Use one of these statuses: ${jobStatuses.join(", ")}.`);
  return status;
}
function isCompletedStatus(status: Doc<"jobs">["status"]) {
  return status === "Completed" || status === "Completed With Balance";
}
function parsePayload<T>(payload: string): T {
  return JSON.parse(payload) as T;
}
function cleanNullable(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function makeJobOrderId(jobId: Id<"jobs"> | string) {
  return `JO-${jobId.slice(-6).toUpperCase()}`;
}

function normalizePriority(value?: string): Doc<"jobs">["priority"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "low") return "Low";
  if (normalized === "high") return "High";
  return "Medium";
}

async function findActiveUser(ctx: Parameters<typeof requireUser>[0], name: string) {
  const normalized = name.trim().toLowerCase();
  const users = await ctx.db.query("users").take(200);
  const matches = users.filter((user) => user.isActive !== false && user.accessStatus !== "suspended" && user.accessStatus !== "removed" && [user.name, user.email].some((value) => value?.trim().toLowerCase() === normalized));
  if (matches.length !== 1) throw new Error(matches.length ? `More than one active user matches "${name}". Use their email address.` : `No active user matches "${name}".`);
  return matches[0];
}

async function findCustomer(ctx: Parameters<typeof requireUser>[0], name: string) {
  const normalized = name.trim().toLowerCase();
  const customers = await ctx.db.query("customers").take(200);
  const matches = customers.filter((customer) => customer.businessName.trim().toLowerCase() === normalized);
  if (matches.length !== 1) throw new Error(matches.length ? `More than one customer matches "${name}".` : `No customer matches "${name}".`);
  return matches[0];
}

async function addAssignmentNotification(
  ctx: MutationCtx,
  job: { _id: Id<"jobs">; jobOrderId?: string; jobType: string; dueDate: string },
  assignedEmployeeId: Id<"users">,
  accountName: string
) {
  const notificationId = await ctx.db.insert("notifications", {
    userId: assignedEmployeeId,
    jobId: job._id,
    type: "assigned",
    title: "New job assigned",
    message: `${job.jobOrderId ?? makeJobOrderId(job._id)} - ${job.jobType} for ${accountName} is due ${job.dueDate}.`,
    isRead: false,
    priority: "medium",
    link: `/jobs/${job.jobOrderId ?? makeJobOrderId(job._id)}`,
    dedupeKey: null,
    emailStatus: "queued",
    emailSentAt: null,
    emailError: null,
    createdAt: Date.now()
  });
  await ctx.scheduler.runAfter(0, internal.notificationEmailActions.sendNotificationEmail, { notificationId });
}

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

function extractOpenAIText(payload: OpenAIResponse | null) {
  const shortcut = payload?.output_text?.trim();
  if (shortcut) return shortcut;
  return payload?.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n")
    .trim();
}
