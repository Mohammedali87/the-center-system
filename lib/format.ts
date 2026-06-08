export function money(value: number | undefined | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value ?? 0));
}

export function dateShort(value: string | number | undefined) {
  if (!value) return "Unscheduled";
  const date = typeof value === "number" ? new Date(value) : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

export function roleLabel(role?: string) {
  if (role === "owner") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "supervisor") return "Star / Supervisor";
  if (role === "viewer") return "Viewer";
  return "Staff";
}

export function canManage(role?: string) {
  return role === "owner" || role === "manager" || role === "supervisor";
}

export function requesterLabel(job?: { requestedBy?: string | null; clientContactPhone?: string | null } | null) {
  const name = job?.requestedBy?.trim();
  const phone = job?.clientContactPhone?.trim();
  if (name && phone) return `${name} - ${phone}`;
  return name || phone || "Not set";
}

export function jobOrderId(job?: { _id?: string; jobOrderId?: string } | string | null) {
  if (!job) return "JO-UNKNOWN";
  if (typeof job !== "string" && job.jobOrderId) return job.jobOrderId;
  const id = typeof job === "string" ? job : job._id;
  return id ? `JO-${id.slice(-6).toUpperCase()}` : "JO-UNKNOWN";
}

export function jobDetailHref(job: { _id?: string; jobOrderId?: string } | string) {
  return `/jobs/${jobOrderId(job)}`;
}

export function invoiceNumber(job: { _id?: string; jobOrderId?: string } | string) {
  const id = typeof job === "string" ? job : job._id ?? job.jobOrderId ?? "";
  return `CBS-${id.slice(-6).toUpperCase()}`;
}

export function emailTypeLabel(emailType?: string) {
  if (emailType === "invoice") return "Invoice";
  if (emailType === "balance_reminder" || emailType === "reminder") return "Balance reminder";
  if (emailType === "job_completion" || emailType === "completion") return "Job completion";
  if (emailType === "missing_document") return "Missing document request";
  if (emailType === "payment_receipt") return "Payment receipt";
  return "General message";
}
