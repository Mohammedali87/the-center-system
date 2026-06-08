import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { emailTypeValidator } from "./validators";

export const send = action({
  args: {
    jobId: v.optional(v.id("jobs")),
    customerId: v.optional(v.id("customers")),
    clientId: v.optional(v.id("clients")),
    emailType: emailTypeValidator,
    recipientEmail: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    saveTemplate: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<{ emailId: Id<"jobEmails">; providerMessageId?: string | null }> => {
    const prepared = await ctx.runQuery(internal.emails.prepareSend, {
      jobId: args.jobId,
      customerId: args.customerId,
      clientId: args.clientId,
      emailType: args.emailType,
      recipientEmail: args.recipientEmail,
      subject: args.subject,
      message: args.message
    });
    if (args.saveTemplate) {
      await ctx.runMutation(internal.emails.upsertTemplateFromAction, {
        emailType: prepared.emailType,
        subject: prepared.subject,
        message: prepared.message,
        updatedBy: prepared.sentBy
      });
    }

    const html = renderHtml(prepared.message);
    const emailId: Id<"jobEmails"> = await ctx.runMutation(internal.emails.createEmailRecord, {
      ...prepared,
      html
    });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL || "Center Business Services <info@biz.center>";
    if (!apiKey) {
      await ctx.runMutation(internal.emails.markEmailFailed, {
        emailId,
        errorMessage: "RESEND_API_KEY is not configured in Convex."
      });
      throw new Error("RESEND_API_KEY is not configured in Convex.");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": emailId
      },
      body: JSON.stringify({
        from,
        to: [prepared.recipientEmail],
        subject: prepared.subject,
        html,
        text: prepared.message,
        tags: [
          { name: "email_type", value: normalizeTag(prepared.emailType) },
          { name: "source", value: "center_business_services" }
        ]
      })
    });

    const payload = (await response.json().catch(() => null)) as { id?: string; message?: string; error?: string } | null;
    if (!response.ok || !payload?.id) {
      const errorMessage = payload?.message || payload?.error || `Resend returned HTTP ${response.status}`;
      await ctx.runMutation(internal.emails.markEmailFailed, {
        emailId,
        errorMessage
      });
      throw new Error(errorMessage);
    }

    await ctx.runMutation(internal.emails.markEmailSent, {
      emailId,
      providerMessageId: payload.id
    });
    return { emailId, providerMessageId: payload.id };
  }
});

function renderHtml(message: string) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;font-size:14px">${paragraphs}</div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeTag(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256);
}
