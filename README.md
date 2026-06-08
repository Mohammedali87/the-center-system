# Center Business Services

Realtime internal operations system for a bookkeeping and business services office. The app uses Next.js, React, Tailwind CSS, Convex database/functions/subscriptions, and Convex Auth password login.

Convex is the persistent Vercel-compatible database, authentication backend, scheduler, and server authorization layer. The app does not write business data to local files.

## Features

- Role-based auth for owner, manager, and employee users
- Convex `users`, `clients`, `customers`, `jobs`, `payments`, `services`, and `tags` tables
- Realtime dashboard metrics with no manual refresh
- Employee workload summary and operational alerts for due dates and unpaid invoices
- TaxDome-style Clients page with active/archived tabs, search, bulk selection, client profiles, assigned team members, tags, balances, and notes
- Client CRUD for business and individual accounts with EIN or SSN/ITIN tracking
- Job management with service type, fee, paid amount, assignee, status, due date, priority, and notes
- Bulk job creation from selected clients, including one-time, monthly, quarterly, and yearly recurrence fields
- Bulk email and reminder placeholders, bulk employee assignment, bulk tag assignment, and bulk archive/restore
- Employee view filtered to assigned jobs only
- Job invoice previews with paid, partial, and unpaid states
- Owner team administration for adding users, editing roles/access, suspending, restoring, and removing access
- Convex-backed service catalog with custom services, hidden services, and default service seeding
- Payment recording/editing/deleting that updates job and customer balances
- Backend-only Resend email sending for invoices, completion notices, balance reminders, missing document requests, receipts, and general client messages
- Convex email history with recipient, subject, sent-by user, sent date, delivery status, and provider message id
- Seed action for demo users, customers, clients, tags, jobs, recurring client jobs, and payments
- First non-demo sign-up bootstraps an owner account; later sign-ups default to employee and can be promoted by the owner
- Admin-created users receive temporary passwords and must change them on first login
- Admin password reset with session invalidation
- Task deadline date/time plus deduplicated 24-hour and 3-hour Resend reminders
- Permission-scoped OpenAI CRM assistant with confirmation before write actions

## Offline Payroll

This project also includes a standalone offline payroll file:

```text
offline-payroll.html
```

Open it directly in a browser to manage payroll for multiple client companies without starting Next.js or Convex. It stores client account details, employees, pay runs, Form W-4 inputs, tax-year configuration tables, employee Social Security/Medicare deductions, employer payroll taxes, printable payroll checks, printable pay stubs, tax/wage report worksheets, CSV exports, and JSON backups in that browser on that computer.

Payroll rates are intentionally editable instead of hard-coded. Verify tax and filing requirements before using any run for live payroll.

## Local Setup

For the easiest local start on Windows, double-click:

```text
START WEBSITE.cmd
```

It installs dependencies on the first run, creates the local Convex backend and auth keys when needed, starts the production-mode website, and opens `http://localhost:3000`.

The individual setup commands below remain available for development.

1. Install dependencies if they are not already installed:

```bash
npm install
```

2. Start Convex once to create a cloud dev deployment and `.env.local`:

```powershell
.\start-convex.ps1
```

3. Configure Convex Auth keys after Convex finishes initial setup:

```powershell
.\setup-auth-keys.ps1
```

4. Run the app:

```powershell
.\start-next.ps1
```

Open `http://localhost:3000`.

5. Load demo data from the login screen, or run:

```bash
npm run seed
```

If global `npm` is not available on Windows, use:

```powershell
$env:Path = "$PWD\.tools\node-v24.15.0-win-x64;$env:Path"
.\.tools\node-v24.15.0-win-x64\npm.cmd run seed
```

Demo accounts:

- `owner@centerbusiness.test` / `OwnerDemo123!`
- `manager@centerbusiness.test` / `ManagerDemo123!`
- `employee@centerbusiness.test` / `EmployeeDemo123!`

## Deployment

This project is meant to run as a real online system. The frontend should be hosted on Vercel and the backend/database should run on a Convex production deployment. Office users access the same secure website link from their own computers, tablets, or phones, and Convex keeps jobs, payments, team access, and dashboard metrics synced in real time.

See [VERCEL_TROUBLESHOOTING.md](VERCEL_TROUBLESHOOTING.md) for deployment, authentication, reminder, chatbot, cron, and production test help.

### First Admin And Team Setup

The first normal account created becomes the admin/owner. After that, public sign-up is rejected and the admin creates staff and supervisor accounts from Team. New users must replace their temporary password before entering the workspace.

### Reminder Scheduling And OpenAI

Convex cron checks deadlines every 30 minutes. Tasks receive one reminder in the 24-hour window and one in the 3-hour window. Changing a deadline clears both reminder flags.

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in Convex for natural-language assistant answers. The default is `gpt-5.5`. Write commands create a pending proposal and require explicit confirmation.

### Tests And Stress Data

```bash
npm run lint
npm test
npm run build
npm run seed:stress
```

The stress seed creates one admin, two supervisors, seven staff users, 100 tasks, and 300 notes. Run it only in a demo or test deployment.

### Production Checklist

- Create a Convex production deployment for the online database and server functions.
- Deploy the Next.js frontend to Vercel.
- Set the Vercel production URL, or your custom domain such as `https://yourbusinessapp.com`.
- Configure Convex Auth keys in the Convex production environment.
- Add the same production Convex URL to Vercel as `NEXT_PUBLIC_CONVEX_URL`.
- Use the Team admin panel inside the app to add, edit, suspend, restore, or remove employee access.
- Give every owner, manager, and employee their own login. Do not share accounts.

### Convex Production Backend

1. Create or select the Convex production deployment:

```bash
npx convex deploy
```

2. Generate auth keys:

```bash
npm run keys
```

3. Set production Convex environment variables in the Convex dashboard, or with the CLI:

```bash
npx convex env set SITE_URL https://yourbusinessapp.com
```

Set these Convex environment variables for the production deployment:

```bash
SITE_URL=https://yourbusinessapp.com
JWT_PRIVATE_KEY=<private key from npm run keys>
JWKS=<jwks JSON from npm run keys>
```

Convex stores the online database, authentication tables, users, clients, jobs, payments, services, tags, job notes, documents, email logs, and activity timeline records.

### Production Email Setup with Resend

Emails are sent only from Convex server actions. The browser never receives the Resend API key.

1. Create a Resend account and add your sending domain, for example:

```text
biz.center
```

2. In Resend, open the domain details and copy the DNS records it gives you.

3. In your DNS provider for `biz.center`, add the required SPF and DKIM records shown by Resend. Resend recommends using a subdomain for sending reputation when appropriate, but if you want the office sender to be `info@biz.center`, verify the domain that authorizes that address.

4. Optional but recommended: add a DMARC TXT record after SPF/DKIM are working.

5. In Resend, click **Verify DNS Records** and wait until the domain status is `verified`.

6. Create a Resend API key with send permissions.

7. Set these environment variables on the Convex production deployment, not in Vercel:

```bash
npx convex env set RESEND_API_KEY re_your_key_here
npx convex env set FROM_EMAIL "Center Business Services <info@biz.center>"
```

8. Redeploy Convex:

```bash
npx convex deploy
```

The app includes editable templates for invoice, balance reminder, job completion, missing document request, payment receipt, and general message emails. Owners and managers can edit the subject/message before sending and optionally save the edited content as the next template.

### Vercel Production Frontend

1. Create a production deploy key in the Convex dashboard and add it to Vercel as:

```bash
CONVEX_DEPLOY_KEY=<your production Convex deploy key>
```

2. Import this project into Vercel, or double-click:

```text
DEPLOY TO VERCEL.cmd
```

3. Keep the build settings from `vercel.json`. Each Vercel build deploys the Convex functions and injects the production `NEXT_PUBLIC_CONVEX_URL` into the Next.js build.

4. After deployment, set the Convex production `SITE_URL` and `APP_URL` to the exact Vercel URL or custom domain, configure the other backend secrets listed above, and redeploy.

5. From the in-app Team panel, add each employee with the proper role:

- Owner: full access
- Manager: jobs, customers, employees, services, payments
- Employee: assigned jobs only

### Local Production Test

```bash
npm run build
npm run start
```

Convex handles the database, server functions, auth routes, and realtime subscriptions. There are no Express or REST API routes in this project.
