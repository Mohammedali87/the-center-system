"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Clock3, DollarSign, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, jobDetailHref, jobOrderId, money, requesterLabel, roleLabel } from "@/lib/format";
import { Badge, EmptyState } from "./ui";

export function DashboardOverview() {
  const metrics = useQuery(api.dashboard.metrics, {});

  if (!metrics) {
    return <div className="h-40 animate-pulse rounded-lg border border-line bg-white" />;
  }

  const cards = [
    { label: "Total jobs", value: metrics.totalJobs, icon: BriefcaseBusiness },
    { label: "Pending jobs", value: metrics.pendingJobs, icon: Clock3 },
    { label: "Completed", value: metrics.completedJobs, icon: CheckCircle2 },
    { label: "Revenue", value: money(metrics.totalRevenue), icon: DollarSign },
    { label: "Outstanding", value: money(metrics.outstandingBalances), icon: AlertTriangle }
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{card.label}</p>
                <Icon className="h-4 w-4 text-muted" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Employee workload</h2>
            <UsersRound className="h-4 w-4 text-muted" />
          </div>
          {metrics.employeeWorkload.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No assigned work yet" />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {metrics.employeeWorkload.map((employee) => (
                <div key={employee.userId} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{employee.name}</p>
                      <Badge tone={employee.role === "manager" ? "green" : "neutral"}>
                        {roleLabel(employee.role)}
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{
                          width: `${Math.min(
                            100,
                            employee.totalJobs === 0
                              ? 0
                              : (employee.completedJobs / employee.totalJobs) * 100
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs sm:w-72">
                    <div className="rounded-md border border-line bg-panel p-2">
                      <p className="font-semibold text-ink">{employee.totalJobs}</p>
                      <p className="text-muted">Total</p>
                    </div>
                    <div className="rounded-md border border-line bg-panel p-2">
                      <p className="font-semibold text-ink">{employee.pendingJobs}</p>
                      <p className="text-muted">Open</p>
                    </div>
                    <div className="rounded-md border border-line bg-panel p-2">
                      <p className="font-semibold text-ink">{employee.completedJobs}</p>
                      <p className="text-muted">Done</p>
                    </div>
                    <div className="rounded-md border border-line bg-panel p-2">
                      <p className="font-semibold text-ink">{employee.highPriorityJobs}</p>
                      <p className="text-muted">High</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Alerts</h2>
            <AlertTriangle className="h-4 w-4 text-muted" />
          </div>
          {metrics.alerts.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No urgent due dates or unpaid invoices" />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {metrics.alerts.map((alert) => (
                <div key={`${alert.kind}-${alert.jobId}`} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{alert.title}</p>
                    <Badge tone={alert.severity === "high" ? "red" : "amber"}>
                      {alert.kind === "dueDate" ? "Due date" : "Invoice"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{alert.detail}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Recent jobs</h2>
          {metrics.highPriorityJobs > 0 ? <Badge tone="red">{metrics.highPriorityJobs} high priority</Badge> : null}
        </div>
        {metrics.recentJobs.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No jobs yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Job ID</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {metrics.recentJobs.map((job) => (
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
                    <td className="px-4 py-3 text-muted">{requesterLabel(job)}</td>
                    <td className="px-4 py-3 text-muted">{job.assignedEmployee?.name ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-muted">{dateShort(job.dueDate)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={statusTone(job.status)}
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">{money(job.remainingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function statusTone(status: string): "neutral" | "blue" | "green" | "amber" | "red" {
  if (status === "Completed") return "green";
  if (status === "Completed With Balance" || status === "Waiting on Client" || status === "Waiting on Government") {
    return "amber";
  }
  if (status === "Overdue" || status === "Cancelled") return "red";
  if (status === "Assigned" || status === "In Progress") return "blue";
  return "neutral";
}
