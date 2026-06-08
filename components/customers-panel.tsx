"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { userCan, userCanAny } from "@/lib/permissions";
import type { CustomerDoc, UserDoc } from "@/lib/types";
import { Button, EmptyState, Field, IconButton, Input, Modal } from "./ui";

export function CustomersPanel({ me }: { me: UserDoc | null }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerDoc | "new" | null>(null);
  const customers = useQuery(api.customers.list, { search: search || undefined });
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const removeCustomer = useMutation(api.customers.remove);
  const canAddCustomer = userCan(me, "clients.add");
  const canEditCustomer = userCan(me, "clients.edit");
  const canDeleteCustomer = userCan(me, "clients.archive");
  const manageable = userCanAny(me, ["clients.edit", "clients.archive"]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      businessName: String(data.get("businessName") ?? ""),
      phoneNumber: String(data.get("phoneNumber") ?? ""),
      email: String(data.get("email") ?? ""),
      businessType: String(data.get("businessType") ?? ""),
      balance: Number(data.get("balance") ?? 0)
    };

    if (editing && editing !== "new") {
      await updateCustomer({ customerId: editing._id, ...payload });
    } else {
      await createCustomer(payload);
    }
    setEditing(null);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[16rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Search customers"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </div>
        {canAddCustomer ? (
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add customer
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Last Email</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
                {manageable ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {customers?.map((customer) => (
                <tr key={customer._id}>
                  <td className="px-4 py-3 font-medium text-ink">{customer.businessName}</td>
                  <td className="px-4 py-3 text-muted">{customer.phoneNumber}</td>
                  <td className="px-4 py-3 text-muted">{customer.email || "Not set"}</td>
                  <td className="px-4 py-3 text-muted">{customer.businessType}</td>
                  <td className="px-4 py-3 text-muted">
                    {customer.lastEmailSentAt ? new Date(customer.lastEmailSentAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{money(customer.balance)}</td>
                  {manageable ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canEditCustomer ? (
                        <IconButton label="Edit customer" onClick={() => setEditing(customer)}>
                          <Edit3 className="h-4 w-4" />
                        </IconButton>
                        ) : null}
                        {canDeleteCustomer ? (
                        <IconButton
                          label="Delete customer"
                          onClick={() => {
                            if (window.confirm(`Delete ${customer.businessName}?`)) {
                              void removeCustomer({ customerId: customer._id });
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
        {customers?.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No customers found" />
          </div>
        ) : null}
      </div>

      {editing ? (
        <Modal title={editing === "new" ? "Add customer" : "Edit customer"} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Business Name">
              <Input name="businessName" defaultValue={editing === "new" ? "" : editing.businessName} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone Number">
                <Input name="phoneNumber" defaultValue={editing === "new" ? "" : editing.phoneNumber} required />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" defaultValue={editing === "new" ? "" : editing.email ?? ""} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business Type">
                <Input name="businessType" defaultValue={editing === "new" ? "" : editing.businessType} required />
              </Field>
            </div>
            <Field label="Starting Balance">
              <Input
                name="balance"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing === "new" ? 0 : editing.openingBalance}
                required
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
