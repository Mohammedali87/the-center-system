"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  LockKeyhole,
  NotebookTabs,
  ShieldCheck,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, money, roleLabel } from "@/lib/format";
import { permissionGroups, permissionPresets } from "@/lib/permissions";
import type {
  AccessStatus,
  EmployeeActivityRow,
  EmployeeAssignedJobRow,
  EmployeeDetailDoc,
  EmployeeNoteType,
  JobStatus,
  NotificationDoc,
  PermissionAuditLogDoc,
  PermissionKey,
  Role
} from "@/lib/types";
import { Badge, Button, EmptyState, Field, Input, Select, Textarea, cn } from "./ui";

type DetailTab = "overview" | "jobs" | "reports" | "activity" | "notes" | "access";

const tabs: Array<{ key: DetailTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "jobs", label: "Assigned Jobs" },
  { key: "reports", label: "Reports" },
  { key: "activity", label: "Activity" },
  { key: "notes", label: "Notes" },
  { key: "access", label: "Permissions" }
];

const roles: Role[] = ["owner", "manager", "supervisor", "employee", "viewer"];
const accessStatuses: AccessStatus[] = ["active", "suspended", "removed"];
const noteTypes: EmployeeNoteType[] = ["performance", "training", "follow_up"];

export function EmployeeDetailPage({ employeeId }: { employeeId: string }) {
  const details = useQuery(api.employees.getDetail, { employeeId });
  const updateTeamUser = useMutation(api.auth.updateTeamUser);
  const addManagerNote = useMutation(api.employees.addManagerNote);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = details?.profile.accessStatus ?? (details?.profile.isActive === false ? "suspended" : "active");
  const employeeName = details?.profile.name ?? details?.profile.email ?? "Team member";

  const noteRows = useMemo(() => details?.notes ?? [], [details?.notes]);

  if (details === undefined) {
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
          <h1 className="mt-4 text-xl font-semibold text-ink">Employee profile was not found.</h1>
          <Link className="mt-5 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700" href="/">
            Back to workspace
          </Link>
        </section>
      </main>
    );
  }

  const detail = details;

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const data = new FormData(event.currentTarget);
    try {
      await updateTeamUser({
        userId: detail.profile._id,
        name: String(data.get("name") ?? ""),
        title: String(data.get("title") ?? ""),
        phone: String(data.get("phone") ?? ""),
        role: String(data.get("role") ?? "employee") as Role,
        accessStatus: String(data.get("accessStatus") ?? "active") as AccessStatus
      });
      setNotice("Employee access updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update employee access.");
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await addManagerNote({
        employeeId: detail.profile._id,
        noteType: String(data.get("noteType") ?? "performance") as EmployeeNoteType,
        body: String(data.get("body") ?? "")
      });
      form.reset();
      setNotice("Manager note added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add note.");
    }
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
              <p className="text-xs font-medium uppercase text-muted">Employee profile</p>
              <h1 className="truncate text-xl font-semibold text-ink">{employeeName}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={roleTone(details.profile.role)}>{roleLabel(details.profile.role)}</Badge>
            <Badge tone={status === "active" ? "green" : status === "suspended" ? "amber" : "red"}>
              {accessLabel(status)}
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
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BriefcaseBusiness} label="Assigned jobs" value={details.summary.totalAssignedJobs} />
          <MetricCard icon={ClipboardList} label="Pending jobs" value={details.summary.pendingJobs} />
          <MetricCard icon={Bell} label="Overdue jobs" value={details.summary.overdueJobs} tone={details.summary.overdueJobs > 0 ? "red" : "neutral"} />
          <MetricCard icon={BarChart3} label="Achievement" value={`${details.summary.achievementPercentage}%`} />
        </section>

        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <nav className="flex min-w-max gap-1 p-1">
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm font-medium",
                  tab === item.key ? "bg-ink text-white" : "text-muted hover:bg-panel hover:text-ink"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {tab === "overview" ? <OverviewTab details={details} status={status} /> : null}
        {tab === "jobs" ? <AssignedJobsTable jobs={details.jobs} /> : null}
        {tab === "reports" ? <ReportsTab details={details} /> : null}
        {tab === "activity" ? <ActivityTab details={details} /> : null}
        {tab === "notes" ? (
          <NotesTab details={details} notes={noteRows} onSubmitNote={submitNote} />
        ) : null}
        {tab === "access" ? <AccessTab details={details} status={status} onSubmitAccess={submitAccess} /> : null}
      </div>
    </main>
  );
}

function OverviewTab({ details, status }: { details: EmployeeDetailDoc; status: AccessStatus }) {
  const profile = details.profile;
  return (
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={UserRound} title="Employee Profile" />
        <InfoGrid
          items={[
            ["Full name", profile.name ?? "Not set"],
            ["Email", profile.email ?? "Not set"],
            ["Phone number", profile.phone ?? "Not set"],
            ["Title", profile.title ?? roleLabel(profile.role)],
            ["Role", roleLabel(profile.role)],
            ["Access status", accessLabel(status)],
            ["Date added", profile._creationTime ? dateShort(profile._creationTime) : "Not tracked"],
            ["Last login", profile.lastLoginAt ? dateShort(profile.lastLoginAt) : "Not tracked"]
          ]}
        />
      </section>

      <section className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={BarChart3} title="Employee Performance Summary" />
        <div className="grid gap-3 sm:grid-cols-3">
          <DocumentMetric label="Completed jobs" value={String(details.summary.completedJobs)} />
          <DocumentMetric label="In progress" value={String(details.summary.inProgressJobs)} />
          <DocumentMetric label="Completed with balance" value={String(details.summary.completedWithBalance)} tone={details.summary.completedWithBalance > 0 ? "amber" : undefined} />
          <DocumentMetric label="On time" value={String(details.summary.completedOnTime)} />
          <DocumentMetric label="Completed late" value={String(details.summary.completedLate)} tone={details.summary.completedLate > 0 ? "red" : undefined} />
          <DocumentMetric label="Achievement" value={`${details.summary.achievementPercentage}%`} />
        </div>
        <div className="mt-4 rounded-md border border-line bg-panel p-3">
          <p className="text-xs uppercase text-muted">Permissions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {details.permissions.map((permission) => (
              <Badge key={permission} tone="neutral">
                {permissionLabel(permission)}
              </Badge>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AssignedJobsTable({ jobs }: { jobs: EmployeeAssignedJobRow[] }) {
  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Assigned Job Orders</h2>
        <Badge tone="blue">{jobs.length} jobs</Badge>
      </div>
      {jobs.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No assigned jobs for this employee" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Job Order ID</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Job type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Due date</th>
                <th className="px-4 py-3 font-medium">Completed date</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((job) => (
                <tr key={job._id}>
                  <td className="px-4 py-3 font-semibold">
                    <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={job.link}>
                      {job.jobOrderId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{job.customerName}</td>
                  <td className="px-4 py-3 text-muted">{job.jobType}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={job.priority === "High" ? "red" : job.priority === "Medium" ? "amber" : "neutral"}>
                      {job.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{dateShort(job.dueDate)}</td>
                  <td className="px-4 py-3 text-muted">{job.completedAt ? dateShort(job.completedAt) : "Not completed"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(job.remainingBalance)}</td>
                  <td className="max-w-[18rem] truncate px-4 py-3 text-muted">{job.notes || "No notes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportsTab({ details }: { details: EmployeeDetailDoc }) {
  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Employee Reports</h2>
        <Badge tone="blue">Employee only</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Date range</th>
              <th className="px-4 py-3 text-right font-medium">Assigned</th>
              <th className="px-4 py-3 text-right font-medium">Completed</th>
              <th className="px-4 py-3 text-right font-medium">Not completed</th>
              <th className="px-4 py-3 text-right font-medium">Overdue</th>
              <th className="px-4 py-3 text-right font-medium">Avg completion</th>
              <th className="px-4 py-3 text-right font-medium">Balance due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {details.reports.map((report) => (
              <tr key={report.period}>
                <td className="px-4 py-3 font-semibold text-ink">{periodLabel(report.period)}</td>
                <td className="px-4 py-3 text-muted">
                  {dateShort(report.periodStart)} to {dateShort(report.periodEnd)}
                </td>
                <td className="px-4 py-3 text-right text-muted">{report.jobsAssignedDuringPeriod}</td>
                <td className="px-4 py-3 text-right text-muted">{report.jobsCompletedDuringPeriod}</td>
                <td className="px-4 py-3 text-right text-muted">{report.jobsNotCompleted}</td>
                <td className="px-4 py-3 text-right">
                  <Badge tone={report.jobsOverdue > 0 ? "red" : "neutral"}>{report.jobsOverdue}</Badge>
                </td>
                <td className="px-4 py-3 text-right text-muted">{report.averageCompletionTimeDays} days</td>
                <td className="px-4 py-3 text-right font-semibold text-ink">{money(report.balanceDueFromCompletedJobs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActivityTab({ details }: { details: EmployeeDetailDoc }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={ClipboardList} title="Activity Timeline" />
        {details.activity.length === 0 ? (
          <EmptyState title="No employee activity found" />
        ) : (
          <div className="grid gap-3">
            {details.activity.map((activity) => (
              <TimelineRow key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </section>
      <section className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={Bell} title="Reminder History" />
        {details.reminders.length === 0 ? (
          <EmptyState title="No reminders for this employee" />
        ) : (
          <div className="grid gap-3">
            {details.reminders.slice(0, 80).map((reminder) => (
              <ReminderRow key={reminder._id} reminder={reminder} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NotesTab({
  details,
  notes,
  onSubmitNote
}: {
  details: EmployeeDetailDoc;
  notes: EmployeeDetailDoc["notes"];
  onSubmitNote: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      {details.canAddManagerNotes ? (
        <form onSubmit={onSubmitNote} className="grid gap-3 rounded-lg border border-line bg-white p-5">
          <SectionTitle icon={NotebookTabs} title="Add Manager Note" />
          <Field label="Note type">
            <Select name="noteType" defaultValue="performance">
              {noteTypes.map((noteType) => (
                <option key={noteType} value={noteType}>
                  {noteTypeLabel(noteType)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Private note">
            <Textarea name="body" required />
          </Field>
          <Button type="submit">Add note</Button>
        </form>
      ) : null}
      <div className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={NotebookTabs} title="Manager Notes" />
        {notes.length === 0 ? (
          <EmptyState title="No manager notes for this employee" />
        ) : (
          <div className="grid gap-3">
            {notes.map((note) => (
              <article key={note._id} className="rounded-md border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone={note.noteType === "training" ? "blue" : note.noteType === "follow_up" ? "amber" : "neutral"}>
                    {noteTypeLabel(note.noteType)}
                  </Badge>
                  <span className="text-xs text-muted">{dateShort(note.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-ink">{note.body}</p>
                <p className="mt-2 text-xs text-muted">{note.createdBy?.name ?? note.createdBy?.email ?? "Manager"}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AccessTab({
  details,
  status,
  onSubmitAccess
}: {
  details: EmployeeDetailDoc;
  status: AccessStatus;
  onSubmitAccess: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const profile = details.profile;
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={LockKeyhole} title="Access Control" />
        {details.canEditAccess ? (
          <form onSubmit={onSubmitAccess} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" defaultValue={profile.name ?? ""} required />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={profile.phone ?? ""} />
              </Field>
              <Field label="Title">
                <Input name="title" defaultValue={profile.title ?? roleLabel(profile.role)} />
              </Field>
              {details.canChangeRoles ? (
                <Field label="Role">
                  <Select name="role" defaultValue={profile.role ?? "employee"}>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="role" value={profile.role ?? "employee"} />
              )}
              <Field label="Access status">
                <Select name="accessStatus" defaultValue={status}>
                  {accessStatuses.map((accessStatus) => (
                    <option key={accessStatus} value={accessStatus}>
                      {accessLabel(accessStatus)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit">Save access changes</Button>
          </form>
        ) : (
          <div className="rounded-md border border-line bg-panel p-4 text-sm text-muted">
            Only the owner can edit roles and access status.
          </div>
        )}
      </section>
      <section className="rounded-lg border border-line bg-white p-5">
        <SectionTitle icon={ShieldCheck} title="Permissions" />
        <PermissionControls key={`${details.profile._id}:${details.permissions.join("|")}`} details={details} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DocumentMetric label="Date added" value={profile._creationTime ? dateShort(profile._creationTime) : "Not tracked" } />
          <DocumentMetric label="Last login" value={profile.lastLoginAt ? dateShort(profile.lastLoginAt) : "Not tracked"} />
        </div>
      </section>
    </div>
  );
}

function PermissionControls({ details }: { details: EmployeeDetailDoc }) {
  const updatePermissions = useMutation(api.permissions.updateUserPermissions);
  const applyPreset = useMutation(api.permissions.applyPreset);
  const auditLogs = useQuery(
    api.permissions.listAuditLogs,
    details.canChangePermissions ? { targetUserId: details.profile._id } : "skip"
  );
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set(details.permissions));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggle(permissionKey: PermissionKey) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permissionKey)) {
        next.delete(permissionKey);
      } else {
        next.add(permissionKey);
      }
      return next;
    });
  }

  async function savePermissions() {
    setSaving(true);
    setMessage(null);
    try {
      const confirmedOwnerChange =
        details.profile.role === "owner"
          ? window.confirm("Confirm permission changes for an Admin/Owner account.")
          : true;
      if (!confirmedOwnerChange) return;
      await updatePermissions({
        userId: details.profile._id,
        permissions: Array.from(selected),
        reason,
        confirmedOwnerChange
      });
      setReason("");
      setMessage("Permissions updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update permissions.");
    } finally {
      setSaving(false);
    }
  }

  async function applyPresetToUser(presetKey: string) {
    setSaving(true);
    setMessage(null);
    try {
      const confirmedOwnerChange =
        details.profile.role === "owner"
          ? window.confirm("Confirm preset changes for an Admin/Owner account.")
          : true;
      if (!confirmedOwnerChange) return;
      const result = await applyPreset({
        userId: details.profile._id,
        presetKey,
        reason: reason || `Applied ${presetKey} preset`,
        confirmedOwnerChange
      });
      setSelected(new Set(result.permissions));
      setReason("");
      setMessage("Preset applied.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to apply preset.");
    } finally {
      setSaving(false);
    }
  }

  if (!details.canChangePermissions) {
    return (
      <div className="grid gap-4">
        {permissionGroups.map((group) => {
          const granted = group.permissions.filter((permission) => details.permissions.includes(permission.key));
          if (granted.length === 0) return null;
          return (
            <div key={group.category} className="rounded-md border border-line bg-panel p-3">
              <p className="text-xs font-semibold uppercase text-muted">{group.category}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {granted.map((permission) => (
                  <Badge key={permission.key} tone="neutral">
                    {permission.label}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const rows = (auditLogs ?? []) as PermissionAuditLogDoc[];

  return (
    <div className="grid gap-4">
      {details.profile.role === "owner" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warning">
          Admin/Owner accounts always keep full effective access. Changes to another owner require confirmation.
        </div>
      ) : null}

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase text-muted">Permission presets</p>
        <div className="flex flex-wrap gap-2">
          {permissionPresets.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => void applyPresetToUser(preset.key)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <Field label="Reason / notes for audit log">
        <Input value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="Optional reason" />
      </Field>

      <div className="grid gap-3">
        {permissionGroups.map((group) => (
          <section key={group.category} className="rounded-md border border-line bg-panel p-3">
            <p className="text-xs font-semibold uppercase text-muted">{group.category}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {group.permissions.map((permission) => (
                <label key={permission.key} className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line"
                    checked={selected.has(permission.key)}
                    onChange={() => toggle(permission.key)}
                  />
                  {permission.label}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">{selected.size} permissions selected</span>
        <Button type="button" disabled={saving} onClick={() => void savePermissions()}>
          Save permissions
        </Button>
      </div>
      {message ? <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">{message}</div> : null}

      <div className="rounded-md border border-line bg-white">
        <div className="border-b border-line px-3 py-2">
          <p className="text-xs font-semibold uppercase text-muted">Permission audit log</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-3">
            <EmptyState title="No permission changes recorded" />
          </div>
        ) : (
          <div className="max-h-72 overflow-auto divide-y divide-line">
            {rows.slice(0, 60).map((row) => (
              <article key={row._id} className="grid gap-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{permissionLabel(row.permissionKey)}</span>
                  <span className="text-xs text-muted">{dateShort(row.createdAt)}</span>
                </div>
                <p className="text-muted">
                  {row.actor?.name ?? row.actor?.email ?? "Admin"} changed access from {row.oldValue ?? "not set"} to{" "}
                  {row.newValue ?? "not set"}.
                </p>
                {row.reason ? <p className="text-xs text-muted">Reason: {row.reason}</p> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function permissionLabel(permissionKey?: string | null) {
  for (const group of permissionGroups) {
    const permission = group.permissions.find((item) => item.key === permissionKey);
    if (permission) return permission.label;
  }
  return permissionKey ?? "Permission";
}

function TimelineRow({ activity }: { activity: EmployeeActivityRow }) {
  const body = (
    <article className="grid gap-1 border-l-2 border-blue-200 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={activityTone(activity.type)}>{activityLabel(activity.type)}</Badge>
        <p className="text-sm font-semibold text-ink">{activity.title}</p>
      </div>
      {activity.detail ? <p className="text-sm text-muted">{activity.detail}</p> : null}
      <p className="text-xs text-muted">
        {dateShort(activity.createdAt)}
        {activity.jobOrderId ? ` - ${activity.jobOrderId}` : ""}
      </p>
    </article>
  );
  return activity.link ? <Link href={activity.link}>{body}</Link> : body;
}

function ReminderRow({ reminder }: { reminder: NotificationDoc }) {
  return (
    <article className="rounded-md border border-line bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{reminder.title}</p>
        <Badge tone={reminder.priority === "high" ? "red" : reminder.priority === "medium" ? "amber" : "neutral"}>
          {reminder.priority}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted">{reminder.message}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{dateShort(reminder.createdAt)}</span>
        <span>{reminder.isRead ? "Read" : "Unread"}</span>
      </div>
    </article>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "neutral"
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "neutral" | "red";
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <p className={cn("mt-3 text-2xl font-semibold text-ink", tone === "red" && "text-danger")}>{value}</p>
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
  tone?: "amber" | "red";
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold text-ink", tone === "amber" && "text-warning", tone === "red" && "text-danger")}>
        {value}
      </p>
    </div>
  );
}

function statusTone(status: JobStatus): "neutral" | "blue" | "green" | "amber" | "red" {
  if (status === "Completed") return "green";
  if (status === "Completed With Balance" || status === "Waiting on Client" || status === "Waiting on Government") return "amber";
  if (status === "Overdue" || status === "Cancelled") return "red";
  if (status === "Assigned" || status === "In Progress") return "blue";
  return "neutral";
}

function roleTone(role?: Role): "neutral" | "blue" | "green" {
  if (role === "owner") return "blue";
  if (role === "manager") return "green";
  return "neutral";
}

function accessLabel(status: AccessStatus) {
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  return "Removed";
}

function periodLabel(period: string) {
  if (period === "daily") return "Daily";
  if (period === "weekly") return "Weekly";
  if (period === "monthly") return "Monthly";
  if (period === "quarterly") return "Quarterly";
  return "Annual";
}

function noteTypeLabel(noteType: EmployeeNoteType) {
  if (noteType === "training") return "Training note";
  if (noteType === "follow_up") return "Follow-up note";
  return "Performance note";
}

function activityTone(type: EmployeeActivityRow["type"]): "neutral" | "blue" | "green" | "amber" | "red" {
  if (type === "completed" || type === "payment") return "green";
  if (type === "email" || type === "assigned") return "blue";
  if (type === "reminder" || type === "manager_note") return "amber";
  return "neutral";
}

function activityLabel(type: EmployeeActivityRow["type"]) {
  if (type === "assigned") return "Assigned";
  if (type === "completed") return "Completed";
  if (type === "payment") return "Payment";
  if (type === "email") return "Email";
  if (type === "reminder") return "Reminder";
  if (type === "manager_note") return "Manager note";
  return "Status";
}
