import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const sendNotificationEmail = internalAction({
  args: {
    notificationId: v.id("notifications")
  },
  handler: async (ctx, args) => {
    const prepared = await ctx.runQuery(internal.notifications.prepareEmail, {
      notificationId: args.notificationId
    });
    if (!prepared) return null;
    if (prepared.emailStatus === "sent") return null;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.notifications.markEmailFailed, {
        notificationId: args.notificationId,
        errorMessage: "RESEND_API_KEY is not configured in Convex."
      });
      return null;
    }

    const from = process.env.FROM_EMAIL || "Center Business Services <info@biz.center>";
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const url = prepared.link ? `${appUrl.replace(/\/$/, "")}${prepared.link}` : appUrl;
    const text = `${prepared.message}\n\nOpen in Center Business Services: ${url}`;
    const html = renderHtml(prepared.message, url);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `notification-${args.notificationId}`
      },
      body: JSON.stringify({
        from,
        to: [prepared.recipientEmail],
        subject: prepared.subject,
        html,
        text,
        tags: [
          { name: "source", value: "center_business_services_notifications" },
          { name: "priority", value: prepared.priority }
        ]
      })
    });

    const payload = (await response.json().catch(() => null)) as { id?: string; message?: string; error?: string } | null;
    if (!response.ok || !payload?.id) {
      const errorMessage = payload?.message || payload?.error || `Resend returned HTTP ${response.status}`;
      await ctx.runMutation(internal.notifications.markEmailFailed, {
        notificationId: args.notificationId,
        errorMessage
      });
      return null;
    }

    await ctx.runMutation(internal.notifications.markEmailSent, {
      notificationId: args.notificationId
    });
    return null;
  }
});

function renderHtml(message: string, url: string) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;font-size:14px">${paragraphs}<p><a href="${escapeHtml(
    url
  )}" style="color:#2563eb">Open in Center Business Services</a></p></div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
