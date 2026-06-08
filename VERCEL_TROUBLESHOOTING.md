# Vercel Troubleshooting

This app uses Vercel for Next.js and Convex for persistent data, authentication, scheduled reminders, server-side authorization, and backend actions.

## Environment Variables Checklist

Set in Vercel:

```env
CONVEX_DEPLOY_KEY=<production Convex deploy key>
```

`vercel.json` deploys Convex during the Vercel build and injects `NEXT_PUBLIC_CONVEX_URL` automatically.

Set in the Convex dashboard:

```env
SITE_URL=https://your-app.vercel.app
APP_URL=https://your-app.vercel.app
JWT_PRIVATE_KEY=
JWKS=
RESEND_API_KEY=
FROM_EMAIL=Center Business Services <info@your-verified-domain.com>
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
```

This project does not use `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `EMAIL_API_KEY`, or `CRON_SECRET`. Convex replaces those database/auth/cron concerns. Never place server secrets in `NEXT_PUBLIC_*`.

## Common Deployment Issues

### Build failed, package installation, or TypeScript errors

Run `npm install`, `npm run lint`, `npm test`, and `npm run build`. Confirm Vercel uses Node.js 20.9 or newer and the repository root contains `package.json`. Commit `package-lock.json` and do not mix package managers.

### Missing environment variables

`CONVEX_DEPLOY_KEY` must exist in Vercel before building. Backend variables belong in Convex. Redeploy after changing either platform's variables.

### Next.js route, API route, or Server Action not working

Most backend operations are Convex functions rather than Next.js API routes or Server Actions. Check the Convex Functions and Logs views.

## Storage And Database Issues

### Connection failed, schema missing, or tables not created

Verify `NEXT_PUBLIC_CONVEX_URL`, then run `npx convex dev` locally or `npx convex deploy` for production. Convex applies `convex/schema.ts`; there are no SQL migrations.

### Local storage works but Vercel does not

Do not add filesystem or in-memory persistence. Users, tasks, notes, reminders, chatbot proposals, and audit logs belong in Convex.

### Test the connection

Open the deployed app and sign in. Inspect Convex logs for schema, connection, or authorization errors.

## Authentication Issues

### Login not working

Confirm `SITE_URL` matches the exact production origin, auth keys are configured, and `NEXT_PUBLIC_CONVEX_URL` uses the production deployment.

### Password reset or first-login password change not working

Admins reset passwords from Team. Reset invalidates sessions and sets `mustChangePassword`. The user signs in with the temporary password, then creates a new password. Passwords require 10 characters, uppercase, lowercase, and a number.

### Role permissions not working or user can access the wrong page

UI visibility is not the security boundary. Confirm the called Convex function uses `requirePermission`, `requireUser`, or an assignment check. Review `auditLogs` and permission overrides.

### Session or cookie issues

Confirm HTTPS and the exact `SITE_URL`. Browser privacy settings must allow cookies. Password resets intentionally invalidate existing sessions.

## Email Reminder Issues

### Emails not sending or sender not verified

Set `RESEND_API_KEY`, verify the sender domain, and set `FROM_EMAIL` in Convex. Check `notifications.emailStatus` and `emailError`.

### Duplicate, 24-hour, or 3-hour reminders

Notifications use deterministic dedupe keys. Jobs store `reminder24hSentAt` and `reminder3hSentAt`; changing a deadline resets both. Confirm the task is open and its `deadlineAt` falls inside the intended window. Legacy tasks default to 17:00 UTC on `dueDate`.

### Manually test reminder logic

Create a task due two hours from now, then run the internal `notifications:checkJobDeadlines` function from the Convex dashboard. Verify the notification, reminder flag, audit log, and email status.

## OpenAI Chatbot Issues

### API key missing, rate limited, or chatbot not responding

Without `OPENAI_API_KEY`, task questions use a deterministic permission-scoped summary. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in Convex for natural-language answers. Check Convex logs and OpenAI project limits.

### Chatbot cannot access tasks or gives unauthorized information

Assistant context is generated server-side. Staff receive only assigned tasks; supervisors/admins receive team tasks. Treat unauthorized output as a security incident and inspect `convex/chatbot.ts`.

### Chatbot action or confirmation fails

Write actions create a `chatProposals` record. The user must approve it before execution, it expires after 15 minutes, and authorization is checked again at confirmation time.

## Convex Cron Issues

Convex cron is used instead of Vercel Cron. `convex/crons.ts` checks deadlines every 30 minutes, so reminders are approximate within that interval. This avoids Vercel Hobby cron frequency limits.

If cron works locally but not in production, run `npx convex deploy`, inspect the Convex cron dashboard, and check function logs.

## Manual Production Test Checklist

- [ ] Create the first admin before any other user exists
- [ ] Admin creates a staff user with a temporary password
- [ ] Staff is forced to change the password
- [ ] Admin creates and assigns a task with a date and time
- [ ] Staff sees only their assigned task
- [ ] Staff adds a note and changes status
- [ ] Supervisor views team progress and notes
- [ ] Admin resets a forgotten password
- [ ] Test 24-hour and 3-hour reminders and verify no duplicates
- [ ] Ask a staff chatbot question and verify isolation
- [ ] Confirm a chatbot note/status action
- [ ] Run `npm run lint`, `npm test`, and `npm run build`
- [ ] Redeploy Vercel and Convex, then repeat the permission test
