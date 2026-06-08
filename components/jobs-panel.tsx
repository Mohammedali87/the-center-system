"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Edit3, Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, invoiceNumber, jobDetailHref, jobOrderId, money, requesterLabel } from "@/lib/format";
import { userCan, userCanAny } from "@/lib/permissions";
import type { CustomerDoc, Id, JobDoc, JobStatus, Priority, ServiceDoc, UserDoc } from "@/lib/types";
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, Select, SortHeader, Textarea } from "./ui";
import type { SortDirection } from "./ui";

const statuses: JobStatus[] = [
  "New",
  "Assigned",
  "In Progress",
  "Waiting on Client",
  "Waiting on Government",
  "Completed",
  "Completed With Balance",
  "Overdue",
  "Cancelled"
];
const priorities: Priority[] = ["Low", "Medium", "High"];
type JobSortKey = "jobOrder" | "customer" | "jobType" | "assigned" | "status" | "priority" | "dueDate" | "balance";

export function JobsPanel({ me }: { me: UserDoc | null }) {
  const canAddJob = userCan(me, "jobs.add");
  const canEditJob = userCan(me, "jobs.edit");
  const canAssignJob = userCanAny(me, ["jobs.assign", "jobs.reassign"]);
  const canCompleteJob = userCan(me, "jobs.complete");
  const canDeleteJob = userCan(me, "jobs.delete");
  const canViewInvoices = userCan(me, "payments.send_invoices");
  const canFilterEmployees = userCan(me, "team.view");
  const manageable = userCanAny(me, ["jobs.add", "jobs.edit", "jobs.delete", "payments.send_invoices"]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"All" | JobStatus>("All");
  const [priority, setPriority] = useState<"All" | Priority>("All");
  const [employeeId, setEmployeeId] = useState<"All" | Id>("All");
  const [editing, setEditing] = useState<JobDoc | "new" | null>(null);
  const [invoiceJob, setInvoiceJob] = useState<JobDoc | null>(null);
  const [sortKey, setSortKey] = useState<JobSortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const queryArgs = useMemo(
    () => ({
      search: search || undefined,
      status: status === "All" ? undefined : status,
      priority: priority === "All" ? undefined : priority,
      employeeId: employeeId === "All" ? undefined : employeeId
    }),
    [employeeId, priority, search, status]
  );

  const jobs = useQuery(api.jobs.list, queryArgs);
  const customers = useQuery(api.customers.list, canAddJob || canEditJob ? {} : "skip");
  const employees = useQuery(api.auth.listEmployees, canAssignJob || canFilterEmployees ? {} : "skip");
  const services = useQuery(api.services.list, canAddJob || canEditJob ? {} : "skip");
  const createJob = useMutation(api.jobs.create);
  const updateJob = useMutation(api.jobs.update);
  const updateStatus = useMutation(api.jobs.updateStatus);
  const removeJob = useMutation(api.jobs.remove);

  const sortedJobs = useMemo(() => {
    return [...(jobs ?? [])].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      return compareJobs(a, b, sortKey) * direction;
    });
  }, [jobs, sortDirection, sortKey]);

  function handleSort(column: string) {
    const nextKey = column as JobSortKey;
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const base = {
      customerId: String(data.get("customerId") ?? ""),
      jobType: String(data.get("jobType") ?? ""),
      fee: Number(data.get("fee") ?? 0),
      assignedEmployeeId: String(data.get("assignedEmployeeId") ?? ""),
      status: String(data.get("status") ?? "New") as JobStatus,
      dueDate: String(data.get("deadline") ?? "").slice(0, 10),
      deadlineAt: new Date(String(data.get("deadline") ?? "")).getTime(),
      priority: String(data.get("priority") ?? "Medium") as Priority,
      requestedBy: String(data.get("requestedBy") ?? ""),
      clientContactPhone: String(data.get("clientContactPhone") ?? ""),
      notes: String(data.get("notes") ?? "")
    };

    if (editing && editing !== "new") {
      await updateJob({ jobId: editing._id, ...base });
    } else {
      await createJob({ ...base, amountPaid: Number(data.get("amountPaid") ?? 0) });
    }
    setEditing(null);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Search jobs"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
        <Select
          className="w-52"
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value as "All" | JobStatus)}
        >
          <option value="All">All status</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select
          className="w-40"
          value={priority}
          onChange={(event) => setPriority(event.currentTarget.value as "All" | Priority)}
        >
          <option value="All">All priority</option>
          {priorities.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        {canFilterEmployees ? (
          <Select className="w-48" value={employeeId} onChange={(event) => setEmployeeId(event.currentTarget.value)}>
            <option value="All">All employees</option>
            {employees?.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {employee.name ?? employee.email}
              </option>
            ))}
          </Select>
        ) : null}
        {canAddJob ? (
          <Button type="button" onClick={() => setEditing("new")} className="ml-auto">
            <Plus className="h-4 w-4" />
            New job
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Job ID" column="jobOrder" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Account" column="customer" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Service" column="jobType" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Requested by</th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Assigned" column="assigned" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Due" column="dueDate" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Priority" column="priority" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Status" column="status" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Balance" column="balance" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                {manageable ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedJobs.map((job) => (
                <tr key={job._id}>
                  <td className="px-4 py-3 font-medium">
                    <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                      {jobOrderId(job)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link className="text-ink hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                      {job.customer?.businessName ?? job.client?.clientName ?? "Unknown"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                      {job.jobType}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                      {invoiceNumber(job)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{requesterLabel(job)}</td>
                  <td className="px-4 py-3 text-muted">{job.assignedEmployee?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted">{dateShort(job.dueDate)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={job.priority === "High" ? "red" : job.priority === "Medium" ? "amber" : "neutral"}>
                      {job.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canEditJob || canCompleteJob ? (
                    <Select
                      className="h-8 min-w-[13rem]"
                      value={job.status}
                      onChange={(event) =>
                        void updateStatus({ jobId: job._id, status: event.currentTarget.value as JobStatus })
                      }
                    >
                      {statusOptionsForJob(job.status, canEditJob).map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </Select>
                    ) : (
                      <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{money(job.amountPaid)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{money(job.remainingBalance)}</td>
                  {manageable ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canEditJob ? (
                        <IconButton
                          label={job.clientId ? "Edit client jobs from Clients" : "Edit job"}
                          disabled={Boolean(job.clientId)}
                          onClick={() => setEditing(job)}
                        >
                          <Edit3 className="h-4 w-4" />
                        </IconButton>
                        ) : null}
                        {canViewInvoices ? (
                        <IconButton label="View invoice" onClick={() => setInvoiceJob(job)}>
                          <ReceiptText className="h-4 w-4" />
                        </IconButton>
                        ) : null}
                        {canDeleteJob ? (
                        <IconButton
                          label="Delete job"
                          onClick={() => {
                            if (window.confirm(`Delete ${job.jobType}?`)) {
                              void removeJob({ jobId: job._id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs?.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No jobs found" />
          </div>
        ) : null}
      </div>

      {editing ? (
        <Modal title={editing === "new" ? "Create job" : "Edit job"} onClose={() => setEditing(null)}>
          <JobForm
            job={editing === "new" ? null : editing}
            customers={customers ?? []}
            employees={employees ?? []}
            services={services ?? []}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      ) : null}

      {invoiceJob ? (
        <Modal title="Job invoice" onClose={() => setInvoiceJob(null)}>
          <InvoicePreview job={invoiceJob} onClose={() => setInvoiceJob(null)} />
        </Modal>
      ) : null}
    </section>
  );
}

function compareJobs(a: JobDoc, b: JobDoc, key: JobSortKey) {
  if (key === "jobOrder") return textCompare(jobOrderId(a), jobOrderId(b));
  if (key === "customer") {
    return textCompare(a.customer?.businessName ?? a.client?.clientName ?? "", b.customer?.businessName ?? b.client?.clientName ?? "");
  }
  if (key === "jobType") return textCompare(a.jobType, b.jobType);
  if (key === "assigned") return textCompare(a.assignedEmployee?.name ?? a.assignedEmployee?.email ?? "", b.assignedEmployee?.name ?? b.assignedEmployee?.email ?? "");
  if (key === "status") return textCompare(a.status, b.status);
  if (key === "priority") return priorityValue(a.priority) - priorityValue(b.priority);
  if (key === "dueDate") return textCompare(a.dueDate, b.dueDate);
  return a.remainingBalance - b.remainingBalance;
}

function priorityValue(priority: Priority) {
  if (priority === "High") return 3;
  if (priority === "Medium") return 2;
  return 1;
}

function statusOptionsForJob(currentStatus: JobStatus, canEditJob: boolean) {
  if (canEditJob) return statuses;
  const completionStatuses = statuses.filter((status) => status === "Completed" || status === "Completed With Balance");
  return [currentStatus, ...completionStatuses.filter((status) => status !== currentStatus)];
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

function textCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function localDateTime(timestamp: number) {
  const offset = new Date(timestamp).getTimezoneOffset() * 60000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function InvoicePreview({ job, onClose }: { job: JobDoc; onClose: () => void }) {
  const number = invoiceNumber(job);
  const remaining = Math.max(0, job.fee - job.amountPaid);
  const paymentStatus = remaining === 0 ? "Paid" : job.amountPaid > 0 ? "Partial" : "Unpaid";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-sm font-semibold text-ink">Center Business Services</p>
          <p className="mt-1 text-sm text-muted">Bookkeeping and business services office</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase text-muted">Invoice</p>
          <p className="text-xl font-semibold text-ink">{number}</p>
          <Badge tone={paymentStatus === "Paid" ? "green" : paymentStatus === "Partial" ? "amber" : "red"}>
            {paymentStatus}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-panel p-3">
          <p className="text-xs uppercase text-muted">Bill to</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {job.customer?.businessName ?? job.client?.clientName ?? "Unknown account"}
          </p>
          <p className="text-sm text-muted">{job.customer?.phoneNumber ?? job.client?.phoneNumber ?? ""}</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-3">
          <p className="text-xs uppercase text-muted">Due date</p>
          <p className="mt-1 text-sm font-semibold text-ink">{dateShort(job.dueDate)}</p>
          <p className="text-sm text-muted">{job.priority} priority</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-3">
          <p className="text-xs uppercase text-muted">Assigned</p>
          <p className="mt-1 text-sm font-semibold text-ink">{job.assignedEmployee?.name ?? "Team"}</p>
          <p className="text-sm text-muted">{job.status}</p>
        </div>
      </div>

      <div className="rounded-md border border-line bg-panel p-3">
        <p className="text-xs uppercase text-muted">Requested by</p>
        <p className="mt-1 text-sm font-semibold text-ink">{requesterLabel(job)}</p>
      </div>

      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 text-right font-medium">Fee</th>
              <th className="px-4 py-3 text-right font-medium">Paid</th>
              <th className="px-4 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-3 font-medium text-ink">{job.jobType}</td>
              <td className="px-4 py-3 text-right text-muted">{money(job.fee)}</td>
              <td className="px-4 py-3 text-right text-muted">{money(job.amountPaid)}</td>
              <td className="px-4 py-3 text-right font-semibold text-ink">{money(remaining)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {job.notes ? (
        <div className="rounded-md border border-line bg-panel p-3">
          <p className="text-xs uppercase text-muted">Notes</p>
          <p className="mt-1 text-sm text-ink">{job.notes}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <ReceiptText className="h-4 w-4" />
          Print
        </Button>
      </div>
    </div>
  );
}

function JobForm({
  job,
  customers,
  employees,
  services,
  onSubmit,
  onCancel
}: {
  job: JobDoc | null;
  customers: CustomerDoc[];
  employees: UserDoc[];
  services: ServiceDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <Select name="customerId" defaultValue={job?.customerId ?? customers[0]?._id} required>
            {customers.map((customer) => (
              <option key={customer._id} value={customer._id}>
                {customer.businessName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service">
          <Select name="jobType" defaultValue={job?.jobType ?? services[0]?.name ?? ""} required>
            {services.map((service) => (
              <option key={service._id} value={service.name}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fee">
          <Input name="fee" type="number" min="0" step="0.01" defaultValue={job?.fee ?? 0} required />
        </Field>
        {!job ? (
          <Field label="Paid in Advance">
            <Input name="amountPaid" type="number" min="0" step="0.01" defaultValue={0} required />
          </Field>
        ) : null}
        <Field label="Deadline">
          <Input
            name="deadline"
            type="datetime-local"
            defaultValue={job?.deadlineAt ? localDateTime(job.deadlineAt) : `${job?.dueDate ?? today}T17:00`}
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Assigned Employee">
          <Select name="assignedEmployeeId" defaultValue={job?.assignedEmployeeId ?? employees[0]?._id} required>
            {employees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {employee.name ?? employee.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={job?.status ?? "New"} required>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue={job?.priority ?? "Medium"} required>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" defaultValue={job?.notes ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested by">
          <Input name="requestedBy" defaultValue={job?.requestedBy ?? ""} placeholder="Owner, accountant, store employee, or contact name" />
        </Field>
        <Field label="Requester phone">
          <Input name="clientContactPhone" defaultValue={job?.clientContactPhone ?? ""} placeholder="Client-side phone number" />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={customers.length === 0 || employees.length === 0 || services.length === 0}>
          Save
        </Button>
      </div>
    </form>
  );
}
