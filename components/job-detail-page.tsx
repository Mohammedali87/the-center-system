"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  NotebookTabs,
  ReceiptText,
  Upload,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import { api } from "@/lib/api";
import {
  dateShort,
  invoiceNumber,
  jobOrderId,
  money,
  requesterLabel,
  roleLabel
} from "@/lib/format";
import { userCan, userCanAny } from "@/lib/permissions";
import type { EmailDraft, EmailType, JobActivityDoc, JobDetailsDoc, JobStatus } from "@/lib/types";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea, cn } from "./ui";

type DetailTab = "overview" | "payments" | "documents" | "communication" | "notes" | "timeline";

const tabs: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "payments", label: "Payments" },
  { key: "documents", label: "Documents" },
  { key: "communication", label: "Email" },
  { key: "notes", label: "Notes" },
  { key: "timeline", label: "Timeline" }
];

export function JobDetailPage({ routeId }: { routeId: string }) {
  const details = useQuery(api.jobs.get, { id: routeId });
  const me = useQuery(api.auth.getMe, {});
  const canViewBalances = userCan(me, "payments.view_balances");
  const canViewPayments = userCan(me, "payments.view");
  const canRecordPayment = userCan(me, "payments.add");
  const canAddDocument = userCan(me, "jobs.edit");
  const canAddNote = userCan(me, "jobs.view");
  const canSendAnyEmail = userCanAny(me, ["emails.send_client", "emails.send_invoice", "emails.request_documents"]);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [emailType, setEmailType] = useState<EmailType | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const visibleTabs = tabs.filter((item) => {
    if (item.key === "payments") return canViewPayments || canRecordPayment;
    if (item.key === "communication") return canSendAnyEmail;
    if (item.key === "documents") return canAddDocument || (details?.documents.length ?? 0) > 0;
    return true;
  });
  const activeTab = visibleTabs.some((item) => item.key === tab) ? tab : "overview";

  const recordPayment = useMutation(api.payments.record);
  const sendEmail = useAction(api.emails.send);
  const addNote = useMutation(api.jobs.addNote);
  const addDocumentRecord = useMutation(api.jobs.addDocumentRecord);
  const emailDraft = useQuery(
    api.emails.getDraft,
    details && emailType && canSendEmailType(me, emailType) ? { jobId: details.job._id, emailType } : "skip"
  );

  const paymentStatus = useMemo(() => {
    if (!details) return "Unpaid";
    if (details.job.remainingBalance <= 0) return "Paid";
    if (details.job.amountPaid > 0) return "Partial";
    return "Unpaid";
  }, [details]);

  if (details === undefined || me === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand" />
      </main>
    );
  }

  if (details === null) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft">
          <Badge tone="red">Not found</Badge>
          <h1 className="mt-4 text-xl font-semibold text-ink">Job order was not found.</h1>
          <Link className="mt-5 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700" href="/">
            Back to dashboard
          </Link>
        </section>
      </main>
    );
  }

  const { job } = details;
  const accountName = job.customer?.businessName ?? job.client?.clientName ?? "Unknown account";
  const accountPhone = job.customer?.phoneNumber ?? job.client?.phoneNumber ?? "Not set";
  const accountEmail = job.client?.email ?? job.customer?.email ?? "Not set";
  const accountType = job.customer?.businessType ?? job.client?.businessCategory ?? job.client?.clientType ?? "Not set";
  const completedWithBalance =
    job.status === "Completed With Balance" || (job.status === "Completed" && job.remainingBalance > 0);

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await recordPayment({
      jobId: job._id,
      amount: Number(data.get("amount") ?? 0),
      note: String(data.get("note") ?? "")
    });
    form.reset();
    setNotice("Payment recorded.");
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await addNote({
      jobId: job._id,
      audience: String(data.get("audience") ?? "internal") as "employee" | "manager" | "internal",
      body: String(data.get("body") ?? "")
    });
    form.reset();
    setNotice("Note added.");
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await addDocumentRecord({
      jobId: job._id,
      name: String(data.get("name") ?? ""),
      fileType: String(data.get("fileType") ?? ""),
      sizeLabel: String(data.get("sizeLabel") ?? ""),
      url: String(data.get("url") ?? "")
    });
    form.reset();
    setNotice("Document added.");
  }

  return (
    <main className="min-h-screen bg-panel">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-muted hover:bg-panel hover:text-ink"
              aria-label="Back to workspace"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex h-11 w-28 items-center justify-center overflow-hidden rounded-md border border-line bg-white px-2">
              <Image
                src="/center-business-logo.png"
                alt="Center Business Services logo"
                width={150}
                height={48}
                className="h-auto w-full object-contain"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase text-muted">Job details</p>
              <h1 className="truncate text-xl font-semibold text-ink">{job.jobType}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{jobOrderId(job)}</Badge>
            <Badge tone={statusTone(job.status)}>
              {job.status}
            </Badge>
            {completedWithBalance ? <Badge tone="amber">Completed With Balance</Badge> : null}
            <Badge tone={me?.role === "owner" ? "blue" : me?.role === "manager" ? "green" : "neutral"}>
              {roleLabel(me?.role)}
            </Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-6">
        {notice ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
            {notice}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ReceiptText} label="Invoice" value={invoiceNumber(job)} />
          <MetricCard icon={BriefcaseBusiness} label="Total fee" value={canViewBalances ? money(job.fee) : "Restricted"} />
          <MetricCard icon={CheckCircle2} label="Paid" value={canViewBalances ? money(job.amountPaid) : "Restricted"} />
          <MetricCard icon={Clock3} label="Balance" value={canViewBalances ? money(job.remainingBalance) : "Restricted"} tone={job.remainingBalance > 0 ? "red" : "green"} />
        </section>

        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <nav className="flex min-w-max gap-1 p-1">
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium",
                  activeTab === item.key ? "bg-ink text-white" : "text-muted hover:bg-panel hover:text-ink"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === "overview" ? (
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-lg border border-line bg-white p-5">
              <SectionTitle icon={UsersRound} title="Customer Information" />
              <InfoGrid
                items={[
                  ["Business name", accountName],
                  ["Phone number", accountPhone],
                  ["Email", accountEmail],
                  ["Business type", accountType],
                  ["Requested by", requesterLabel(job)],
                  ["Assigned team member", job.assignedEmployee?.name ?? job.assignedEmployee?.email ?? "Unassigned"]
                ]}
              />
            </section>
            <section className="rounded-lg border border-line bg-white p-5">
              <SectionTitle icon={BriefcaseBusiness} title="Job Information" />
              <InfoGrid
                items={[
                  ["Job Order ID", jobOrderId(job)],
                  ["Service", job.jobType],
                  ["Assigned employee", job.assignedEmployee?.name ?? job.assignedEmployee?.email ?? "Unassigned"],
                  ["Status", job.status],
                  ["Priority", job.priority],
                  ["Due date", dateShort(job.dueDate)],
                  ["Created date", dateShort(job.createdAt)],
                  ["Assigned date", dateShort(job.assignedAt ?? job.createdAt)],
                  ["Completed date", job.completedAt ? dateShort(job.completedAt) : "Not completed"],
                  ["Notes", job.notes || "No notes"]
                ]}
              />
            </section>
          </div>
        ) : null}

        {activeTab === "payments" ? (
          <PaymentsSection
            details={details}
            paymentStatus={paymentStatus}
            completedWithBalance={completedWithBalance}
            canViewBalances={canViewBalances}
            canRecordPayment={canRecordPayment}
            onSubmitPayment={submitPayment}
          />
        ) : null}

        {activeTab === "documents" ? (
          <DocumentsSection details={details} manageable={canAddDocument} onSubmitDocument={submitDocument} />
        ) : null}

        {activeTab === "communication" ? (
          <CommunicationSection details={details} me={me} manageable={canSendAnyEmail} onOpenEmail={setEmailType} />
        ) : null}

        {activeTab === "notes" ? (
          <NotesSection details={details} manageable={canAddDocument} canAddNote={canAddNote} onSubmitNote={submitNote} />
        ) : null}

        {activeTab === "timeline" ? <TimelineSection activities={details.activities} /> : null}

        {emailType ? (
          <Modal title={`Send ${emailTypeLabel(emailType)} email`} onClose={() => setEmailType(null)}>
            <EmailComposer
              draft={emailDraft}
              error={emailError}
              onSubmit={async (event) => {
                event.preventDefault();
                setEmailError(null);
                const form = event.currentTarget;
                const data = new FormData(form);
                try {
                  await sendEmail({
                    jobId: job._id,
                    emailType,
                    recipientEmail: String(data.get("recipientEmail") ?? ""),
                    subject: String(data.get("subject") ?? ""),
                    message: String(data.get("message") ?? ""),
                    saveTemplate: data.get("saveTemplate") === "on"
                  });
                  setNotice(`${emailTypeLabel(emailType)} email sent.`);
                  setEmailType(null);
                } catch (error) {
                  setEmailError(error instanceof Error ? error.message : "Email failed to send.");
                }
              }}
              onCancel={() => setEmailType(null)}
            />
          </Modal>
        ) : null}
      </div>
    </main>
  );
}

function PaymentsSection({
  details,
  paymentStatus,
  completedWithBalance,
  canViewBalances,
  canRecordPayment,
  onSubmitPayment
}: {
  details: JobDetailsDoc;
  paymentStatus: string;
  completedWithBalance: boolean;
  canViewBalances: boolean;
  canRecordPayment: boolean;
  onSubmitPayment: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={ReceiptText} title="Payment Section" />
        <div className="grid gap-3">
          <DocumentMetric label="Total fee" value={canViewBalances ? money(details.job.fee) : "Restricted"} />
          <DocumentMetric label="Amount paid" value={canViewBalances ? money(details.job.amountPaid) : "Restricted"} />
          <DocumentMetric label="Remaining balance" value={canViewBalances ? money(details.job.remainingBalance) : "Restricted"} tone={details.job.remainingBalance > 0 ? "red" : "green"} />
          <div className="flex flex-wrap gap-2">
            <Badge tone={paymentStatus === "Paid" ? "green" : paymentStatus === "Partial" ? "amber" : "red"}>
              {paymentStatus}
            </Badge>
            {completedWithBalance ? <Badge tone="amber">Completed With Balance</Badge> : null}
          </div>
        </div>
        {canRecordPayment ? (
          <form onSubmit={onSubmitPayment} className="mt-5 grid gap-3 border-t border-line pt-4">
            <Field label="Record payment">
              <Input name="amount" type="number" min="0" step="0.01" required />
            </Field>
            <Field label="Payment note">
              <Input name="note" placeholder="Cash, card, check, or memo" />
            </Field>
            <Button type="submit">Record payment</Button>
          </form>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={ReceiptText} title="Payment History" />
        {details.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Received by</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {details.payments.map((payment) => (
                  <tr key={payment._id}>
                    <td className="px-4 py-3 font-medium text-ink">RCPT-{payment._id.slice(-6).toUpperCase()}</td>
                    <td className="px-4 py-3 text-muted">{dateShort(payment.paidAt)}</td>
                    <td className="px-4 py-3 text-muted">{payment.receivedBy?.name ?? payment.receivedBy?.email ?? "Team"}</td>
                    <td className="px-4 py-3 text-muted">{payment.note || "No note"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{money(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payments recorded for this job" />
        )}
      </div>
    </section>
  );
}

function DocumentsSection({
  details,
  manageable,
  onSubmitDocument
}: {
  details: JobDetailsDoc;
  manageable: boolean;
  onSubmitDocument: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      {manageable ? (
        <form onSubmit={onSubmitDocument} className="grid gap-3 rounded-lg border border-line bg-white p-5">
          <SectionTitle icon={Upload} title="Add Document" />
          <Field label="Document name">
            <Input name="name" placeholder="Signed application PDF" required />
          </Field>
          <Field label="File type">
            <Input name="fileType" placeholder="PDF, image, spreadsheet" required />
          </Field>
          <Field label="Size">
            <Input name="sizeLabel" placeholder="1.2 MB" />
          </Field>
          <Field label="View or download URL">
            <Input name="url" placeholder="https://..." />
          </Field>
          <Button type="submit">Add document</Button>
        </form>
      ) : null}

      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={FileText} title="Uploaded Files and PDFs" />
        {details.documents.length > 0 ? (
          <div className="grid gap-2">
            {details.documents.map((document) => (
              <div key={document._id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{document.name}</p>
                  <p className="text-xs text-muted">
                    {document.fileType} {document.sizeLabel ? `- ${document.sizeLabel}` : ""} - {dateShort(document.uploadedAt)}
                  </p>
                </div>
                {document.url ? (
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-sm text-muted">No file URL</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No documents attached to this job" />
        )}
      </div>
    </section>
  );
}

function CommunicationSection({
  details,
  me,
  manageable,
  onOpenEmail
}: {
  details: JobDetailsDoc;
  me: Parameters<typeof userCan>[0];
  manageable: boolean;
  onOpenEmail: (emailType: EmailType) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={Mail} title="Email and Communication" />
        <div className="grid gap-2">
          <Button type="button" variant="secondary" disabled={!manageable || !canSendEmailType(me, "invoice")} onClick={() => onOpenEmail("invoice")}>
            Send invoice email
          </Button>
          <Button type="button" variant="secondary" disabled={!manageable || !canSendEmailType(me, "balance_reminder")} onClick={() => onOpenEmail("balance_reminder")}>
            Send balance reminder
          </Button>
          <Button type="button" variant="secondary" disabled={!manageable || !canSendEmailType(me, "job_completion")} onClick={() => onOpenEmail("job_completion")}>
            Send job completed email
          </Button>
          <Button type="button" variant="secondary" disabled={!manageable || !canSendEmailType(me, "missing_document")} onClick={() => onOpenEmail("missing_document")}>
            Request missing documents
          </Button>
          <Button type="button" variant="secondary" disabled={!manageable || !canSendEmailType(me, "payment_receipt")} onClick={() => onOpenEmail("payment_receipt")}>
            Send payment receipt
          </Button>
          <Button type="button" variant="secondary" disabled={!manageable || !canSendEmailType(me, "general")} onClick={() => onOpenEmail("general")}>
            Send general message
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={Mail} title="Email History Log" />
        {details.emails.length > 0 ? (
          <div className="grid gap-3">
            {details.emails.map((email) => (
              <article key={email._id} className="rounded-md border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{email.subject}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone="blue">{emailTypeLabel(email.emailType)}</Badge>
                    <Badge tone={email.deliveryStatus === "failed" ? "red" : email.deliveryStatus === "queued" ? "amber" : "green"}>
                      {email.deliveryStatus ?? "sent"}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted">{email.message}</p>
                <p className="mt-2 text-xs text-muted">
                  To {email.recipientEmail ?? "client"} - {dateShort(email.sentAt)} by {email.sentBy?.name ?? email.sentBy?.email ?? "Team"}
                  {email.errorMessage ? ` - ${email.errorMessage}` : ""}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No email history for this job" />
        )}
      </div>
    </section>
  );
}

function EmailComposer({
  draft,
  error,
  onSubmit,
  onCancel
}: {
  draft: EmailDraft | undefined;
  error: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  if (!draft) {
    return <div className="h-24 animate-pulse rounded-md border border-line bg-panel" />;
  }

  return (
    <form
      onSubmit={async (event) => {
        setPending(true);
        try {
          await onSubmit(event);
        } finally {
          setPending(false);
        }
      }}
      className="grid gap-4"
    >
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
      <Field label="To">
        <Input name="recipientEmail" type="email" defaultValue={draft.recipientEmail} required />
      </Field>
      <Field label="Subject">
        <Input name="subject" defaultValue={draft.subject} required />
      </Field>
      <Field label="Message">
        <Textarea name="message" defaultValue={draft.message} className="min-h-56" required />
      </Field>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input name="saveTemplate" type="checkbox" />
        Save this subject and message as the template for next time
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          Send email
        </Button>
      </div>
    </form>
  );
}

function NotesSection({
  details,
  manageable,
  canAddNote,
  onSubmitNote
}: {
  details: JobDetailsDoc;
  manageable: boolean;
  canAddNote: boolean;
  onSubmitNote: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      {canAddNote ? (
      <form onSubmit={onSubmitNote} className="grid gap-3 rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={NotebookTabs} title="Internal Notes" />
        <Field label="Note type">
          <Select name="audience" defaultValue="internal">
            <option value="internal">Internal</option>
            <option value="employee">Employee note</option>
            {manageable ? <option value="manager">Manager note</option> : null}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea name="body" required />
        </Field>
        <Button type="submit">Add note</Button>
      </form>
      ) : null}

      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={NotebookTabs} title="Employee and Manager Notes" />
        {details.notes.length > 0 ? (
          <div className="grid gap-3">
            {details.notes.map((note) => (
              <article key={note._id} className="rounded-md border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={note.audience === "manager" ? "amber" : note.audience === "employee" ? "blue" : "neutral"}>
                    {note.audience}
                  </Badge>
                  <span className="text-xs text-muted">{dateShort(note.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-ink">{note.body}</p>
                <p className="mt-2 text-xs text-muted">{note.createdBy?.name ?? note.createdBy?.email ?? "Team"}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No internal notes for this job" />
        )}
      </div>
    </section>
  );
}

function TimelineSection({ activities }: { activities: JobActivityDoc[] }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <SectionTitle icon={Clock3} title="Job Activity Timeline" />
      {activities.length > 0 ? (
        <div className="grid gap-3">
          {activities.map((activity) => (
            <article key={activity._id} className="grid gap-1 border-l-2 border-blue-200 pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={activityTone(activity.kind)}>{activity.kind}</Badge>
                <p className="text-sm font-semibold text-ink">{activity.title}</p>
              </div>
              {activity.detail ? <p className="text-sm text-muted">{activity.detail}</p> : null}
              <p className="text-xs text-muted">
                {dateShort(activity.createdAt)}
                {activity.createdBy ? ` by ${activity.createdBy.name ?? activity.createdBy.email}` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No activity recorded for this job" />
      )}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <p className={cn("mt-3 text-2xl font-semibold text-ink", tone === "green" && "text-success", tone === "red" && "text-danger")}>
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted" />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-line bg-panel p-3">
          <dt className="text-xs uppercase text-muted">{label}</dt>
          <dd className="mt-1 text-sm font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DocumentMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold text-ink", tone === "green" && "text-success", tone === "red" && "text-danger")}>
        {value}
      </p>
    </div>
  );
}

function activityTone(kind: JobActivityDoc["kind"]) {
  if (kind === "payment" || kind === "completed") return "green";
  if (kind === "email" || kind === "document") return "blue";
  if (kind === "status" || kind === "assigned") return "amber";
  return "neutral";
}

function statusTone(status: JobStatus): "neutral" | "blue" | "green" | "amber" | "red" {
  if (status === "Completed") return "green";
  if (status === "Completed With Balance" || status === "Waiting on Client" || status === "Waiting on Government") {
    return "amber";
  }
  if (status === "Overdue" || status === "Cancelled") return "red";
  if (status === "Assigned" || status === "In Progress") return "blue";
  return "neutral";
}

function emailTypeLabel(emailType: EmailType) {
  if (emailType === "invoice") return "Invoice";
  if (emailType === "balance_reminder" || emailType === "reminder") return "Balance reminder";
  if (emailType === "job_completion" || emailType === "completion") return "Job completion";
  if (emailType === "missing_document") return "Missing document request";
  if (emailType === "payment_receipt") return "Payment receipt";
  return "General message";
}

function canSendEmailType(user: Parameters<typeof userCan>[0], emailType: EmailType) {
  if (emailType === "invoice") return userCan(user, "emails.send_invoice");
  if (emailType === "missing_document") return userCan(user, "emails.request_documents");
  return userCan(user, "emails.send_client");
}
