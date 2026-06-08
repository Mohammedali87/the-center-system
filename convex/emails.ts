import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { canManage, requirePermission, requireUser } from "./permissions";
import type { PermissionKey } from "./permissions";
import { emailTypeValidator } from "./validators";

type EmailType =
  | "invoice"
  | "job_completion"
  | "balance_reminder"
  | "missing_document"
  | "payment_receipt"
  | "general"
  | "reminder"
  | "completion";

type Template = {
  emailType: EmailType;
  label: string;
  subject: string;
  message: string;
};

const defaultTemplates: Template[] = [
  {
    emailType: "invoice",
    label: "Invoice",
    subject: "Invoice {{invoiceNumber}} from Center Business Services",
    message:
      "Hello {{clientName}},\n\nYour invoice {{invoiceNumber}} for {{jobType}} is ready.\n\nTotal fee: {{fee}}\nAmount paid: {{amountPaid}}\nBalance due: {{balance}}\nDue date: {{dueDate}}\n\nThank you,\nCenter Business Services"
  },
  {
    emailType: "balance_reminder",
    label: "Balance reminder",
    subject: "Balance due reminder for {{jobType}}",
    message:
      "Hello {{clientName}},\n\nThis is a friendly reminder that {{balance}} remains due for {{jobType}}.\n\nPlease contact Center Business Services if you have questions.\n\nThank you."
  },
  {
    emailType: "job_completion",
    label: "Job completed",
    subject: "{{jobType}} completed",
    message:
      "Hello {{clientName}},\n\nWe have completed {{jobType}} for your account.\n\nPayment status: {{paymentStatus}}\nRemaining balance: {{balance}}\n\nThank you for working with Center Business Services."
  },
  {
    emailType: "missing_document",
    label: "Missing document request",
    subject: "Documents needed for {{jobType}}",
    message:
      "Hello {{clientName}},\n\nWe need additional documents to continue {{jobType}}.\n\nPlease send the missing documents at your earliest convenience.\n\nThank you."
  },
  {
    emailType: "payment_receipt",
    label: "Payment receipt",
    subject: "Payment receipt for {{jobType}}",
    message:
      "Hello {{clientName}},\n\nThank you for your payment toward {{jobType}}.\n\nTotal paid: {{amountPaid}}\nRemaining balance: {{balance}}\n\nCenter Business Services"
  },
  {
    emailType: "general",
    label: "General message",
    subject: "Message from Center Business Services",
    message: "Hello {{clientName}},\n\n\n\nThank you,\nCenter Business Services"
  }
];

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requirePermission(ctx, "emails.send_client");
    const saved = await ctx.db.query("emailTemplates").take(100);
    return defaultTemplates.map((template) => {
      const override = saved.find((item) => normalizeEmailType(item.emailType) === template.emailType);
      return {
        _id: override?._id,
        emailType: template.emailType,
        label: template.label,
        subject: override?.subject ?? template.subject,
        message: override?.message ?? template.message,
        updatedAt: override?.updatedAt
      };
    });
  }
});

export const getDraft = query({
  args: {
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    emailType: emailTypeValidator
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, emailPermission(normalizeEmailType(args.emailType)));
    const prepared = await buildEmailContext(ctx, args);
    const template = await loadTemplate(ctx, normalizeEmailType(args.emailType));
    return {
      emailType: template.emailType,
      label: template.label,
      recipientEmail: prepared.recipientEmail,
      recipientName: prepared.recipientName,
      subject: renderTemplate(template.subject, prepared.variables),
      message: renderTemplate(template.message, prepared.variables)
    };
  }
});

export const list = query({
  args: {
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients"))
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send_client");
    const { userId, role } = await requireUser(ctx);
    let emails: Doc<"jobEmails">[];

    if (args.jobId !== undefined) {
      const job = await ctx.db.get(args.jobId);
      if (!job) return [];
      if (!canManage(role) && job.assignedEmployeeId !== userId) {
        throw new Error("You can only view emails for jobs assigned to you.");
      }
      emails = await ctx.db
        .query("jobEmails")
        .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
        .take(200);
    } else if (args.clientId !== undefined) {
      const client = await ctx.db.get(args.clientId);
      if (!client) return [];
      if (!canManage(role) && client.assignedTeamMemberId !== userId) {
        throw new Error("You can only view emails for clients assigned to you.");
      }
      emails = await ctx.db
        .query("jobEmails")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .take(200);
    } else if (args.customerId !== undefined) {
      emails = await ctx.db
        .query("jobEmails")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .take(200);
      if (!canManage(role)) {
        const visible: Doc<"jobEmails">[] = [];
        for (const email of emails) {
          if (!email.jobId) continue;
          const job = await ctx.db.get(email.jobId);
          if (job?.assignedEmployeeId === userId) visible.push(email);
        }
        emails = visible;
      }
    } else {
      emails = await ctx.db.query("jobEmails").take(200);
    }

    const enriched = await Promise.all(
      emails.map(async (email) => ({
        ...email,
        emailType: normalizeEmailType(email.emailType),
        sentBy: await ctx.db.get(email.sentBy)
      }))
    );
    return enriched.sort((a, b) => b.sentAt - a.sentAt);
  }
});

export const upsertTemplate = mutation({
  args: {
    emailType: emailTypeValidator,
    subject: v.string(),
    message: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, "emails.edit_templates");
    const emailType = normalizeEmailType(args.emailType);
    const subject = args.subject.trim();
    const message = args.message.trim();
    if (!subject || !message) throw new Error("Template subject and message are required.");

    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_email_type", (q) => q.eq("emailType", emailType))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        subject,
        message,
        updatedBy: userId,
        updatedAt: now
      });
      return existing._id;
    }
    return await ctx.db.insert("emailTemplates", {
      emailType,
      subject,
      message,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const upsertTemplateFromAction = internalMutation({
  args: {
    emailType: emailTypeValidator,
    subject: v.string(),
    message: v.string(),
    updatedBy: v.id("users")
  },
  handler: async (ctx, args) => {
    const emailType = normalizeEmailType(args.emailType);
    const subject = args.subject.trim();
    const message = args.message.trim();
    if (!subject || !message) throw new Error("Template subject and message are required.");

    const existing = await ctx.db
      .query("emailTemplates")
      .withIndex("by_email_type", (q) => q.eq("emailType", emailType))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        subject,
        message,
        updatedBy: args.updatedBy,
        updatedAt: now
      });
      return existing._id;
    }
    return await ctx.db.insert("emailTemplates", {
      emailType,
      subject,
      message,
      updatedBy: args.updatedBy,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const prepareSend = internalQuery({
  args: {
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    emailType: emailTypeValidator,
    recipientEmail: v.optional(v.string()),
    subject: v.string(),
    message: v.string()
  },
  handler: async (ctx, args) => {
    const { userId } = await requirePermission(ctx, emailPermission(normalizeEmailType(args.emailType)));
    const prepared = await buildEmailContext(ctx, args);
    const recipientEmail = args.recipientEmail?.trim() || prepared.recipientEmail;
    if (!recipientEmail || !recipientEmail.includes("@")) {
      throw new Error("A valid recipient email address is required.");
    }
    const subject = args.subject.trim();
    const message = args.message.trim();
    if (!subject || !message) throw new Error("Email subject and message are required.");

    return {
      sentBy: userId,
      jobId: prepared.job?._id,
      customerId: prepared.customer?._id,
      clientId: prepared.client?._id,
      recipientEmail,
      recipientName: prepared.recipientName,
      emailType: normalizeEmailType(args.emailType),
      subject,
      message
    };
  }
});

export const createEmailRecord = internalMutation({
  args: {
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    recipientEmail: v.string(),
    recipientName: v.optional(v.union(v.string(), v.null())),
    emailType: emailTypeValidator,
    subject: v.string(),
    message: v.string(),
    html: v.optional(v.string()),
    sentBy: v.id("users")
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("jobEmails", {
      jobId: args.jobId,
      customerId: args.customerId,
      clientId: args.clientId,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName ?? null,
      emailType: normalizeEmailType(args.emailType),
      subject: args.subject,
      message: args.message,
      html: args.html,
      sentBy: args.sentBy,
      sentAt: Date.now(),
      deliveryStatus: "queued",
      provider: "resend",
      providerMessageId: null,
      errorMessage: null
    });
  }
});

export const markEmailSent = internalMutation({
  args: {
    emailId: v.id("jobEmails"),
    providerMessageId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) throw new Error("Email record not found.");
    const now = Date.now();
    await ctx.db.patch(args.emailId, {
      deliveryStatus: "sent",
      providerMessageId: args.providerMessageId ?? null,
      errorMessage: null,
      sentAt: now
    });
    if (email.customerId) {
      await ctx.db.patch(email.customerId, { lastEmailSentAt: now, updatedAt: now });
    }
    if (email.clientId) {
      await ctx.db.patch(email.clientId, { lastEmailSentAt: now, updatedAt: now });
    }
    if (email.jobId) {
      await ctx.db.insert("jobActivities", {
        jobId: email.jobId,
        kind: "email",
        title: `${emailTypeLabel(normalizeEmailType(email.emailType))} email sent`,
        detail: `${email.subject} to ${email.recipientEmail ?? "client"}`,
        createdBy: email.sentBy,
        createdAt: now
      });
    }
    return null;
  }
});

export const markEmailFailed = internalMutation({
  args: {
    emailId: v.id("jobEmails"),
    errorMessage: v.string()
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return null;
    await ctx.db.patch(args.emailId, {
      deliveryStatus: "failed",
      errorMessage: args.errorMessage
    });
    if (email.jobId) {
      await ctx.db.insert("jobActivities", {
        jobId: email.jobId,
        kind: "email",
        title: "Email failed",
        detail: args.errorMessage.slice(0, 180),
        createdBy: email.sentBy,
        createdAt: Date.now()
      });
    }
    return null;
  }
});

async function buildEmailContext(
  ctx: QueryCtx,
  args: {
    jobId?: Id<"jobs">;
    customerId?: Id<"customers">;
    clientId?: Id<"clients">;
    recipientEmail?: string;
  }
) {
  const job = args.jobId ? await ctx.db.get(args.jobId) : null;
  if (args.jobId && !job) throw new Error("Job not found.");

  const customerId = job?.customerId ?? args.customerId;
  const clientId = job?.clientId ?? args.clientId;
  const [customer, client] = await Promise.all([
    customerId ? ctx.db.get(customerId) : Promise.resolve(null),
    clientId ? ctx.db.get(clientId) : Promise.resolve(null)
  ]);

  const recipientEmail = args.recipientEmail?.trim() || client?.email || customer?.email || "";
  const recipientName = client?.clientName ?? customer?.businessName ?? "Client";
  const balance = job ? Math.max(0, Number(job.fee) - Number(job.amountPaid)) : client?.balanceDue ?? customer?.balance ?? 0;
  const paymentStatus = balance <= 0 ? "Paid" : job && job.amountPaid > 0 ? "Partial" : "Unpaid";

  return {
    job,
    customer,
    client,
    recipientEmail,
    recipientName,
    variables: {
      clientName: recipientName,
      businessName: recipientName,
      jobType: job?.jobType ?? "your service",
      jobOrderId: job ? `JO-${job._id.slice(-6).toUpperCase()}` : "",
      invoiceNumber: job ? `CBS-${job._id.slice(-6).toUpperCase()}` : "",
      fee: money(job?.fee ?? balance),
      amountPaid: money(job?.amountPaid ?? 0),
      balance: money(balance),
      dueDate: job?.dueDate ?? "not scheduled",
      paymentStatus
    }
  };
}

async function loadTemplate(ctx: QueryCtx, emailType: EmailType): Promise<Template> {
  const normalized = normalizeEmailType(emailType);
  const saved = await ctx.db
    .query("emailTemplates")
    .withIndex("by_email_type", (q) => q.eq("emailType", normalized))
    .first();
  const fallback = defaultTemplates.find((template) => template.emailType === normalized) ?? defaultTemplates[0];
  return {
    ...fallback,
    subject: saved?.subject ?? fallback.subject,
    message: saved?.message ?? fallback.message
  };
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

function normalizeEmailType(emailType: EmailType): EmailType {
  if (emailType === "reminder") return "balance_reminder";
  if (emailType === "completion") return "job_completion";
  return emailType;
}

function emailPermission(emailType: EmailType): PermissionKey {
  if (emailType === "invoice") return "emails.send_invoice";
  if (emailType === "missing_document") return "emails.request_documents";
  return "emails.send_client";
}

function emailTypeLabel(emailType: EmailType) {
  if (emailType === "invoice") return "Invoice";
  if (emailType === "balance_reminder" || emailType === "reminder") return "Balance reminder";
  if (emailType === "job_completion" || emailType === "completion") return "Job completion";
  if (emailType === "missing_document") return "Missing document";
  if (emailType === "payment_receipt") return "Payment receipt";
  return "General";
}

function money(value: number | undefined | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value ?? 0));
}
