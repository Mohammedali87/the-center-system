"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { BarChart3, Download, FileText, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, money } from "@/lib/format";
import { userCan } from "@/lib/permissions";
import type {
  BalanceFilter,
  CompletionFilter,
  EmployeePerformanceRow,
  Id,
  JobStatus,
  ReportDashboard,
  ReportJobRow,
  ReportPeriod,
  UserDoc
} from "@/lib/types";
import { Badge, Button, EmptyState, Field, Input, Select, SortHeader, cn } from "./ui";
import type { SortDirection } from "./ui";

const periods: Array<{ value: ReportPeriod; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" }
];

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

type EmployeeReportSortKey =
  | "employee"
  | "assigned"
  | "completed"
  | "pending"
  | "overdue"
  | "late"
  | "onTime"
  | "achievement"
  | "managerNotes";
type JobReportSortKey = "jobOrder" | "customer" | "jobType" | "assigned" | "dueDate" | "status" | "balance";

export function ReportsPanel({ me }: { me: UserDoc | null }) {
  const manageable = userCan(me, "reports.view");
  const canExportReports = userCan(me, "reports.export");
  const canViewEmployeePerformance = userCan(me, "reports.employee_performance");
  const canViewTeam = userCan(me, "team.view");
  const canViewClients = userCan(me, "clients.view");
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employeeId, setEmployeeId] = useState<"All" | Id>("All");
  const [jobType, setJobType] = useState("All");
  const [status, setStatus] = useState<"All" | JobStatus>("All");
  const [accountId, setAccountId] = useState("All");
  const [balanceDue, setBalanceDue] = useState<BalanceFilter>("all");
  const [completion, setCompletion] = useState<CompletionFilter>("all");

  const employees = useQuery(api.auth.listEmployees, manageable && canViewEmployeePerformance && canViewTeam ? { includeInactive: false } : "skip");
  const clients = useQuery(api.clients.list, manageable && canViewClients ? { archived: false } : "skip");
  const customers = useQuery(api.customers.list, manageable && canViewClients ? {} : "skip");
  const services = useQuery(api.services.list, manageable ? {} : "skip");

  const reportArgs = useMemo(() => {
    const clientId = accountId.startsWith("client:") ? accountId.replace("client:", "") : undefined;
    const customerId = accountId.startsWith("customer:") ? accountId.replace("customer:", "") : undefined;
    return {
      period,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      employeeId: employeeId === "All" ? undefined : employeeId,
      jobType: jobType === "All" ? undefined : jobType,
      status: status === "All" ? undefined : status,
      customerId,
      clientId,
      balanceDue,
      completion
    };
  }, [accountId, balanceDue, completion, employeeId, endDate, jobType, period, startDate, status]);

  const report = useQuery(api.reports.dashboard, manageable ? reportArgs : "skip");

  if (!manageable) {
    return (
      <section className="rounded-lg border border-line bg-white p-6">
        <Badge tone="amber">Restricted</Badge>
        <h2 className="mt-3 text-lg font-semibold text-ink">Reports are available to owners and managers.</h2>
        <p className="mt-2 text-sm text-muted">Your dashboard and notification bell still show your assigned job reminders.</p>
      </section>
    );
  }

  function resetFilters() {
    setStartDate("");
    setEndDate("");
    setEmployeeId("All");
    setJobType("All");
    setStatus("All");
    setAccountId("All");
    setBalanceDue("all");
    setCompletion("all");
  }

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Reporting Dashboard</h2>
          <p className="mt-1 text-sm text-muted">
            {report ? `${dateShort(report.periodStart)} to ${dateShort(report.periodEnd)}` : "Loading report period"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={!report || !canExportReports} onClick={() => report && exportReportCsv(report)}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button type="button" variant="secondary" disabled={!report || !canExportReports} onClick={() => window.print()}>
            <FileText className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {periods.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPeriod(item.value)}
              className={cn(
                "h-9 rounded-md px-3 text-sm font-medium transition",
                period === item.value ? "bg-ink text-white" : "border border-line bg-white text-muted hover:bg-panel hover:text-ink"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.currentTarget.value)} />
          </Field>
          <Field label="Employee">
            <Select value={employeeId} onChange={(event) => setEmployeeId(event.currentTarget.value as "All" | Id)}>
              <option value="All">All employees</option>
              {employees?.map((employee) => (
                <option key={employee._id} value={employee._id}>
                  {employee.name ?? employee.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service">
            <Select value={jobType} onChange={(event) => setJobType(event.currentTarget.value)}>
              <option value="All">All services</option>
              {services?.map((service) => (
                <option key={service._id} value={service.name}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.currentTarget.value as "All" | JobStatus)}>
              <option value="All">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Client or customer">
            <Select value={accountId} onChange={(event) => setAccountId(event.currentTarget.value)}>
              <option value="All">All accounts</option>
              {clients?.map((client) => (
                <option key={client._id} value={`client:${client._id}`}>
                  {client.clientName}
                </option>
              ))}
              {customers?.map((customer) => (
                <option key={customer._id} value={`customer:${customer._id}`}>
                  {customer.businessName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Balance">
            <Select value={balanceDue} onChange={(event) => setBalanceDue(event.currentTarget.value as BalanceFilter)}>
              <option value="all">All balances</option>
              <option value="withBalance">Balance due</option>
              <option value="paid">Paid in full</option>
            </Select>
          </Field>
          <Field label="Completion">
            <Select value={completion} onChange={(event) => setCompletion(event.currentTarget.value as CompletionFilter)}>
              <option value="all">All jobs</option>
              <option value="completed">Completed</option>
              <option value="notCompleted">Not completed</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="secondary" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset filters
          </Button>
        </div>
      </div>

      {!report ? (
        <div className="h-72 animate-pulse rounded-lg border border-line bg-white" />
      ) : (
        <>
          <MetricGrid report={report} />
          <EmployeePerformanceTable report={report} />
          <div className="grid gap-5 xl:grid-cols-2">
            <JobReportTable title="Jobs Not Completed By Due Date" jobs={report.lateJobs} empty="No overdue jobs in this report." />
            <JobReportTable title="Completed Jobs With Balance Due" jobs={report.balanceDueJobs} empty="No completed jobs with balance due." />
          </div>
        </>
      )}
    </section>
  );
}

function MetricGrid({ report }: { report: ReportDashboard }) {
  const cards: Array<{ label: string; value: string | number; tone?: "neutral" | "amber" | "red" }> = [
    { label: "Jobs created", value: report.totalJobsCreated },
    { label: "Jobs completed", value: report.totalJobsCompleted },
    { label: "In progress", value: report.jobsInProgress },
    { label: "Overdue", value: report.jobsOverdue, tone: report.jobsOverdue > 0 ? "red" : "neutral" },
    { label: "Revenue collected", value: money(report.totalRevenueCollected) },
    { label: "Remaining balance", value: money(report.totalRemainingBalance), tone: report.totalRemainingBalance > 0 ? "amber" : "neutral" },
    { label: "Completed with balance", value: report.completedJobsWithBalance, tone: report.completedJobsWithBalance > 0 ? "amber" : "neutral" },
    { label: "Missed due date", value: report.jobsNotCompletedByDueDate, tone: report.jobsNotCompletedByDueDate > 0 ? "red" : "neutral" }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{card.label}</p>
            <BarChart3 className="h-4 w-4 text-muted" />
          </div>
          <p
            className={cn(
              "mt-3 text-2xl font-semibold text-ink",
              card.tone === "red" && "text-danger",
              card.tone === "amber" && "text-warning"
            )}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmployeePerformanceTable({ report }: { report: ReportDashboard }) {
  const [sortKey, setSortKey] = useState<EmployeeReportSortKey>("employee");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedEmployees = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...report.employeePerformance].sort(
      (a, b) => compareEmployeePerformance(a, b, sortKey) * direction
    );
  }, [report.employeePerformance, sortDirection, sortKey]);

  function handleSort(column: string) {
    const nextKey = column as EmployeeReportSortKey;
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "employee" || nextKey === "managerNotes" ? "asc" : "desc");
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Employee Performance</h3>
        <Badge tone="blue">{report.employeePerformance.length} team members</Badge>
      </div>
      {report.employeePerformance.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No employee report data for this period" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Employee" column="employee" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Assigned" column="assigned" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Completed" column="completed" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Pending" column="pending" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Overdue" column="overdue" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Late" column="late" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="On time" column="onTime" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Achievement" column="achievement" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Manager notes" column="managerNotes" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedEmployees.map((employee) => (
                <tr key={employee.employeeId}>
                  <td className="px-4 py-3 font-semibold text-ink">{employee.employeeName}</td>
                  <td className="px-4 py-3 text-right text-muted">{employee.assignedJobs}</td>
                  <td className="px-4 py-3 text-right text-muted">{employee.completedJobs}</td>
                  <td className="px-4 py-3 text-right text-muted">{employee.pendingJobs}</td>
                  <td className="px-4 py-3 text-right">
                    <Badge tone={employee.overdueJobs > 0 ? "red" : "neutral"}>{employee.overdueJobs}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{employee.completedLateJobs}</td>
                  <td className="px-4 py-3 text-right text-muted">{employee.completedOnTimeJobs}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-36 items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.min(100, employee.achievementPercentage)}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold text-ink">
                        {employee.achievementPercentage}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{employee.managerNotes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function JobReportTable({ title, jobs, empty }: { title: string; jobs: ReportJobRow[]; empty: string }) {
  const [sortKey, setSortKey] = useState<JobReportSortKey>("dueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedJobs = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...jobs].sort((a, b) => compareReportJobs(a, b, sortKey) * direction);
  }, [jobs, sortDirection, sortKey]);

  function handleSort(column: string) {
    const nextKey = column as JobReportSortKey;
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "balance" ? "desc" : "asc");
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <Badge tone={jobs.length > 0 ? "amber" : "neutral"}>{jobs.length}</Badge>
      </div>
      {jobs.length === 0 ? (
        <div className="p-4">
          <EmptyState title={empty} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Job ID" column="jobOrder" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Customer" column="customer" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Service" column="jobType" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Assigned" column="assigned" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Due" column="dueDate" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Status" column="status" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Balance" column="balance" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedJobs.map((job) => (
                <tr key={job._id}>
                  <td className="px-4 py-3 font-semibold">
                    <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={job.link}>
                      {job.jobOrderId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink">{job.customerName}</td>
                  <td className="px-4 py-3 text-muted">{job.jobType}</td>
                  <td className="px-4 py-3 text-muted">{job.assignedEmployeeName}</td>
                  <td className="px-4 py-3 text-muted">{dateShort(job.dueDate)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(job.remainingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function compareEmployeePerformance(a: EmployeePerformanceRow, b: EmployeePerformanceRow, key: EmployeeReportSortKey) {
  if (key === "employee") return textCompare(a.employeeName, b.employeeName);
  if (key === "assigned") return a.assignedJobs - b.assignedJobs;
  if (key === "completed") return a.completedJobs - b.completedJobs;
  if (key === "pending") return a.pendingJobs - b.pendingJobs;
  if (key === "overdue") return a.overdueJobs - b.overdueJobs;
  if (key === "late") return a.completedLateJobs - b.completedLateJobs;
  if (key === "onTime") return a.completedOnTimeJobs - b.completedOnTimeJobs;
  if (key === "achievement") return a.achievementPercentage - b.achievementPercentage;
  return textCompare(a.managerNotes, b.managerNotes);
}

function compareReportJobs(a: ReportJobRow, b: ReportJobRow, key: JobReportSortKey) {
  if (key === "jobOrder") return textCompare(a.jobOrderId, b.jobOrderId);
  if (key === "customer") return textCompare(a.customerName, b.customerName);
  if (key === "jobType") return textCompare(a.jobType, b.jobType);
  if (key === "assigned") return textCompare(a.assignedEmployeeName, b.assignedEmployeeName);
  if (key === "dueDate") return dateValue(a.dueDate) - dateValue(b.dueDate);
  if (key === "status") return textCompare(a.status, b.status);
  return a.remainingBalance - b.remainingBalance;
}

function dateValue(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function textCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
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

function exportReportCsv(report: ReportDashboard) {
  const rows = [
    ["Report period", report.period, report.periodStart, report.periodEnd],
    ["Jobs created", report.totalJobsCreated],
    ["Jobs completed", report.totalJobsCompleted],
    ["In progress", report.jobsInProgress],
    ["Overdue", report.jobsOverdue],
    ["Revenue collected", report.totalRevenueCollected],
    ["Remaining balance", report.totalRemainingBalance],
    ["Completed with balance", report.completedJobsWithBalance],
    ["Missed due date", report.jobsNotCompletedByDueDate],
    [],
    ["Employee", "Assigned", "Completed", "Pending", "Overdue", "Late", "On time", "Achievement", "Manager notes"],
    ...report.employeePerformance.map((employee) => [
      employee.employeeName,
      employee.assignedJobs,
      employee.completedJobs,
      employee.pendingJobs,
      employee.overdueJobs,
      employee.completedLateJobs,
      employee.completedOnTimeJobs,
      `${employee.achievementPercentage}%`,
      employee.managerNotes
    ]),
    [],
    ["Late job ID", "Customer", "Service", "Assigned", "Due", "Status", "Balance"],
    ...report.lateJobs.map((job) => [
      job.jobOrderId,
      job.customerName,
      job.jobType,
      job.assignedEmployeeName,
      job.dueDate,
      job.status,
      job.remainingBalance
    ])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `center-business-report-${report.period}-${report.periodStart}-${report.periodEnd}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
