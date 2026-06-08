"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, invoiceNumber, jobDetailHref, jobOrderId, money } from "@/lib/format";
import { userCan } from "@/lib/permissions";
import type { JobDoc, PaymentDoc, UserDoc } from "@/lib/types";
import { Button, EmptyState, Field, IconButton, Input, Modal, Select, SortHeader } from "./ui";
import type { SortDirection } from "./ui";

type PaymentSortKey = "client" | "jobOrder" | "amount" | "paymentDate" | "balance";

export function PaymentsPanel({ me }: { me: UserDoc | null }) {
  const canAddPayment = userCan(me, "payments.add");
  const canEditPayment = userCan(me, "payments.edit");
  const canDeletePayment = userCan(me, "payments.delete");
  const payments = useQuery(api.payments.list, {});
  const jobs = useQuery(api.jobs.list, {});
  const recordPayment = useMutation(api.payments.record);
  const updatePayment = useMutation(api.payments.update);
  const removePayment = useMutation(api.payments.remove);
  const [editing, setEditing] = useState<PaymentDoc | "new" | null>(null);
  const [sortKey, setSortKey] = useState<PaymentSortKey>("paymentDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedPayments = useMemo(() => {
    return [...(payments ?? [])].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      return comparePayments(a, b, sortKey) * direction;
    });
  }, [payments, sortDirection, sortKey]);

  function handleSort(column: string) {
    const nextKey = column as PaymentSortKey;
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "paymentDate" || nextKey === "amount" || nextKey === "balance" ? "desc" : "asc");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount") ?? 0);
    const note = String(data.get("note") ?? "");

    if (editing && editing !== "new") {
      await updatePayment({ paymentId: editing._id, amount, note });
    } else {
      await recordPayment({
        jobId: String(data.get("jobId") ?? ""),
        amount,
        note
      });
    }
    setEditing(null);
  }

  return (
    <section className="grid gap-4">
      <div className="flex justify-end">
        {canAddPayment ? (
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Record payment
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Job Order" column="jobOrder" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Client" column="client" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Received By</th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Payment Date" column="paymentDate" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Amount" column="amount" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Balance" column="balance" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                {canEditPayment || canDeletePayment ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedPayments.map((payment) => (
                <tr key={payment._id}>
                  <td className="px-4 py-3 font-medium">
                    {payment.job ? (
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(payment.job)}>
                        {jobOrderId(payment.job)}
                      </Link>
                    ) : (
                      "Deleted"
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {payment.job ? (
                      <Link className="text-ink hover:text-blue-700 hover:underline" href={jobDetailHref(payment.job)}>
                        {payment.customer?.businessName ?? payment.client?.clientName ?? "Unknown"}
                      </Link>
                    ) : (
                      (payment.customer?.businessName ?? payment.client?.clientName ?? "Unknown")
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payment.job ? (
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(payment.job)}>
                        {payment.job.jobType}
                      </Link>
                    ) : (
                      "Deleted job"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {payment.job ? (
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(payment.job)}>
                        {invoiceNumber(payment.job)}
                      </Link>
                    ) : (
                      "Unavailable"
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{payment.receivedBy?.name ?? "Team"}</td>
                  <td className="px-4 py-3 text-muted">{dateShort(payment.paidAt)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{money(payment.amount)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{money(paymentBalance(payment))}</td>
                  {canEditPayment || canDeletePayment ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canEditPayment ? (
                        <IconButton label="Edit payment" onClick={() => setEditing(payment)}>
                          <Edit3 className="h-4 w-4" />
                        </IconButton>
                        ) : null}
                        {canDeletePayment ? (
                        <IconButton
                          label="Delete payment"
                          onClick={() => {
                            if (window.confirm("Delete this payment?")) {
                              void removePayment({ paymentId: payment._id });
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
        {payments?.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No payments found" />
          </div>
        ) : null}
      </div>

      {editing ? (
        <Modal title={editing === "new" ? "Record payment" : "Edit payment"} onClose={() => setEditing(null)}>
          <PaymentForm
            payment={editing === "new" ? null : editing}
            jobs={jobs ?? []}
            onSubmit={submit}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function comparePayments(a: PaymentDoc, b: PaymentDoc, key: PaymentSortKey) {
  if (key === "client") {
    return textCompare(accountName(a), accountName(b));
  }
  if (key === "jobOrder") return textCompare(a.job ? jobOrderId(a.job) : "", b.job ? jobOrderId(b.job) : "");
  if (key === "amount") return a.amount - b.amount;
  if (key === "paymentDate") return a.paidAt - b.paidAt;
  return paymentBalance(a) - paymentBalance(b);
}

function accountName(payment: PaymentDoc) {
  return payment.customer?.businessName ?? payment.client?.clientName ?? "Unknown";
}

function paymentBalance(payment: PaymentDoc) {
  return Math.max(0, Number(payment.job?.fee ?? 0) - Number(payment.job?.amountPaid ?? 0));
}

function textCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function PaymentForm({
  payment,
  jobs,
  onSubmit,
  onCancel
}: {
  payment: PaymentDoc | null;
  jobs: JobDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {!payment ? (
        <Field label="Job">
          <Select name="jobId" defaultValue={jobs.find((job) => job.remainingBalance > 0)?._id ?? jobs[0]?._id} required>
            {jobs.map((job) => (
              <option key={job._id} value={job._id}>
                {job.customer?.businessName ?? job.client?.clientName ?? "Unknown"} - {job.jobType} ({money(job.remainingBalance)} due)
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Amount">
        <Input name="amount" type="number" min="0" step="0.01" defaultValue={payment?.amount ?? 0} required />
      </Field>
      <Field label="Note">
        <Input name="note" defaultValue={payment?.note ?? ""} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!payment && jobs.length === 0}>
          Save
        </Button>
      </div>
    </form>
  );
}
