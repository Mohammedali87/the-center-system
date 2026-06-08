"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Edit3, Eye, EyeOff, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { userCan } from "@/lib/permissions";
import type { ServiceDoc, UserDoc } from "@/lib/types";
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, Select } from "./ui";

export function ServicesPanel({ me }: { me: UserDoc | null }) {
  const services = useQuery(api.services.list, { includeInactive: true });
  const createService = useMutation(api.services.create);
  const updateService = useMutation(api.services.update);
  const updateStatus = useMutation(api.services.updateStatus);
  const removeService = useMutation(api.services.remove);
  const seedDefaults = useMutation(api.services.seedDefaults);
  const [editing, setEditing] = useState<ServiceDoc | "new" | null>(null);
  const [error, setError] = useState("");
  const manageable = userCan(me, "settings.manage_services");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const feeValue = String(data.get("defaultFee") ?? "").trim();
    const defaultFee = feeValue === "" ? undefined : Number(feeValue);
    const name = String(data.get("name") ?? "");

    try {
      if (editing && editing !== "new") {
        await updateService({
          serviceId: editing._id,
          name,
          defaultFee,
          isActive: String(data.get("isActive") ?? "true") === "true"
        });
      } else {
        await createService({ name, defaultFee });
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save service.");
    }
  }

  async function loadDefaults() {
    setError("");
    try {
      await seedDefaults({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load default services.");
    }
  }

  if (!services) {
    return <div className="h-40 animate-pulse rounded-lg border border-line bg-white" />;
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Service catalog</h2>
          <p className="text-sm text-muted">Add custom job types and control what appears in job order forms.</p>
        </div>
        {manageable ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void loadDefaults()}>
              <RefreshCcw className="h-4 w-4" />
              Defaults
            </Button>
            <Button type="button" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              Add service
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}

      <section className="rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 text-right font-medium">Default fee</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {manageable ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {services.map((service) => (
                <tr key={service._id}>
                  <td className="px-4 py-3 font-medium text-ink">{service.name}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {service.defaultFee === undefined || service.defaultFee === null ? "No default" : money(service.defaultFee)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={service.isActive ? "green" : "neutral"}>{service.isActive ? "Active" : "Hidden"}</Badge>
                  </td>
                  {manageable ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <IconButton label="Edit service" onClick={() => setEditing(service)}>
                          <Edit3 className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label={service.isActive ? "Hide service" : "Show service"}
                          onClick={() => void updateStatus({ serviceId: service._id, isActive: !service.isActive })}
                        >
                          {service.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </IconButton>
                        <IconButton
                          label="Delete service"
                          onClick={() => {
                            if (window.confirm(`Delete ${service.name}? Existing jobs will keep their service text.`)) {
                              void removeService({ serviceId: service._id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {services.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No services yet" />
          </div>
        ) : null}
      </section>

      {editing ? (
        <Modal title={editing === "new" ? "Add service" : "Edit service"} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Service Name">
              <Input name="name" defaultValue={editing === "new" ? "" : editing.name} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default Fee">
                <Input
                  name="defaultFee"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editing === "new" ? "" : editing.defaultFee ?? ""}
                />
              </Field>
              {editing !== "new" ? (
                <Field label="Status">
                  <Select name="isActive" defaultValue={String(editing.isActive)}>
                    <option value="true">Active</option>
                    <option value="false">Hidden</option>
                  </Select>
                </Field>
              ) : null}
            </div>
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
