"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Edit3, Eye, KeyRound, Plus, ShieldOff, Trash2, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/format";
import { userCan } from "@/lib/permissions";
import type { AccessStatus, Role, UserDoc } from "@/lib/types";
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, Select, SortHeader } from "./ui";
import type { SortDirection } from "./ui";

const roles: Role[] = ["owner", "manager", "supervisor", "employee", "viewer"];
const accessStatuses: AccessStatus[] = ["active", "suspended", "removed"];
type TeamSortKey = "name" | "email" | "phone" | "title" | "role" | "access";

export function TeamPanel({ me }: { me: UserDoc | null }) {
  const users = useQuery(api.auth.listEmployees, { includeInactive: true });
  const createTeamUser = useAction(api.auth.createTeamUser);
  const resetUserPassword = useAction(api.auth.resetUserPassword);
  const updateTeamUser = useMutation(api.auth.updateTeamUser);
  const updateTeamAccess = useMutation(api.auth.updateTeamAccess);
  const [editing, setEditing] = useState<UserDoc | "new" | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sortKey, setSortKey] = useState<TeamSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const canAddUsers = userCan(me, "team.add");
  const canEditUsers = userCan(me, "team.edit");
  const canSuspendUsers = userCan(me, "team.suspend");
  const canDeleteUsers = userCan(me, "team.delete");
  const canChangeRoles = userCan(me, "team.change_roles");

  const sortedUsers = useMemo(() => {
    return [...(users ?? [])].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      return compareTeamUsers(a, b, sortKey) * direction;
    });
  }, [sortDirection, sortKey, users]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    const role = String(data.get("role") ?? "employee") as Role;
    const payload = {
      name: String(data.get("name") ?? ""),
      title: String(data.get("title") ?? roleLabel(role)),
      phone: String(data.get("phone") ?? ""),
      role
    };

    try {
      if (editing === "new") {
        await createTeamUser({
          ...payload,
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? "")
        });
      } else if (editing) {
        await updateTeamUser({
          userId: editing._id,
          ...payload,
          accessStatus: String(data.get("accessStatus") ?? "active") as AccessStatus
        });
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save team member.");
    } finally {
      setPending(false);
    }
  }

  async function changeAccess(user: UserDoc, accessStatus: AccessStatus) {
    const label = accessStatus === "active" ? "restore" : accessStatus;
    if (accessStatus !== "active" && !window.confirm(`${label} ${user.name ?? user.email}?`)) {
      return;
    }
    setError("");
    try {
      await updateTeamAccess({ userId: user._id, accessStatus });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update access.");
    }
  }

  async function resetPassword(user: UserDoc) {
    const temporaryPassword = window.prompt(`Enter a temporary password for ${user.name ?? user.email}.`);
    if (!temporaryPassword) return;
    setError("");
    try {
      await resetUserPassword({ userId: user._id, temporaryPassword });
      window.alert("Temporary password set. The user must change it on next login.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    }
  }

  function handleSort(column: string) {
    const nextKey = column as TeamSortKey;
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  }

  if (!users) {
    return <div className="h-40 animate-pulse rounded-lg border border-line bg-white" />;
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Team access</h2>
          <p className="text-sm text-muted">Owners can add users, change roles, suspend access, or remove access.</p>
        </div>
        {canAddUsers ? (
          <Button type="button" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}

      <section className="rounded-lg border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Name" column="name" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Email" column="email" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Phone" column="phone" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Title" column="title" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Role" column="role" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Access" column="access" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedUsers.map((user) => {
                const status = user.accessStatus ?? (user.isActive === false ? "suspended" : "active");
                return (
                  <tr key={user._id} className={status === "removed" ? "bg-panel/60" : ""}>
                    <td className="px-4 py-3 font-medium">
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={`/team/${user._id}`}>
                        {user.name ?? "Team member"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={`/team/${user._id}`}>
                        {user.email ?? "No email"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{user.phone ?? "Not set"}</td>
                    <td className="px-4 py-3 text-muted">{user.title ?? roleLabel(user.role)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={user.role === "owner" ? "blue" : user.role === "manager" ? "green" : "neutral"}>
                        {roleLabel(user.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status === "active" ? "green" : status === "suspended" ? "amber" : "red"}>
                        {accessLabel(status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/team/${user._id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:bg-panel hover:text-ink"
                          aria-label={`View ${user.name ?? user.email ?? "team member"}`}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {canEditUsers || canSuspendUsers || canDeleteUsers ? (
                          <>
                            {canEditUsers ? (
                              <>
                                <IconButton label="Edit user" onClick={() => setEditing(user)}>
                                  <Edit3 className="h-4 w-4" />
                                </IconButton>
                                <IconButton label="Reset password" onClick={() => void resetPassword(user)}>
                                  <KeyRound className="h-4 w-4" />
                                </IconButton>
                              </>
                            ) : null}
                            {canSuspendUsers ? (
                              status === "active" ? (
                                <IconButton label="Suspend access" onClick={() => void changeAccess(user, "suspended")}>
                                  <ShieldOff className="h-4 w-4" />
                                </IconButton>
                              ) : (
                                <IconButton label="Restore access" onClick={() => void changeAccess(user, "active")}>
                                  <UserCheck className="h-4 w-4" />
                                </IconButton>
                              )
                            ) : null}
                            {canDeleteUsers && status !== "removed" ? (
                              <IconButton label="Remove access" onClick={() => void changeAccess(user, "removed")}>
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sortedUsers.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No team members found" />
          </div>
        ) : null}
      </section>

      {editing ? (
        <Modal title={editing === "new" ? "Add team user" : "Edit team user"} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" defaultValue={editing === "new" ? "" : editing.name ?? ""} required />
              </Field>
              <Field label="Title">
                <Input
                  name="title"
                  defaultValue={editing === "new" ? "" : editing.title ?? roleLabel(editing.role)}
                  placeholder="Office Manager"
                />
              </Field>
              <Field label="Phone">
                <Input name="phone" defaultValue={editing === "new" ? "" : editing.phone ?? ""} placeholder="(615) 555-0123" />
              </Field>
            </div>
            {editing === "new" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  <Input name="email" type="email" required />
                </Field>
                <Field label="Temporary Password">
                  <Input
                    name="password"
                    type="password"
                    minLength={10}
                    placeholder="10+ characters, uppercase, lowercase, number"
                    required
                  />
                </Field>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {canChangeRoles ? (
                <Field label="Role">
                  <Select name="role" defaultValue={editing === "new" ? "employee" : editing.role ?? "employee"}>
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="role" value={editing === "new" ? "employee" : editing.role ?? "employee"} />
              )}
              {editing !== "new" ? (
                <Field label="Access">
                  <Select name="accessStatus" defaultValue={editing.accessStatus ?? (editing.isActive === false ? "suspended" : "active")}>
                    {accessStatuses.map((status) => (
                      <option key={status} value={status}>
                        {accessLabel(status)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function accessLabel(status: AccessStatus) {
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  return "Removed";
}

function compareTeamUsers(a: UserDoc, b: UserDoc, key: TeamSortKey) {
  if (key === "name") return textCompare(a.name ?? "", b.name ?? "");
  if (key === "email") return textCompare(a.email ?? "", b.email ?? "");
  if (key === "phone") return textCompare(a.phone ?? "", b.phone ?? "");
  if (key === "title") return textCompare(a.title ?? roleLabel(a.role), b.title ?? roleLabel(b.role));
  if (key === "role") return textCompare(roleLabel(a.role), roleLabel(b.role));
  return textCompare(
    accessLabel(a.accessStatus ?? (a.isActive === false ? "suspended" : "active")),
    accessLabel(b.accessStatus ?? (b.isActive === false ? "suspended" : "active"))
  );
}

function textCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
