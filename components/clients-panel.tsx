"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, type ReactNode, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Archive,
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  Edit3,
  ListFilter,
  Mail,
  NotebookTabs,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Tag,
  Trash2,
  UsersRound
} from "lucide-react";
import { api } from "@/lib/api";
import { dateShort, emailTypeLabel, jobDetailHref, jobOrderId, money, requesterLabel } from "@/lib/format";
import { userCan, userCanAny } from "@/lib/permissions";
import type {
  ClientDoc,
  ClientType,
  EmailDraft,
  Id,
  JobEmailDoc,
  JobDoc,
  PaymentDoc,
  Priority,
  RecurrenceType,
  ServiceDoc,
  TagDoc,
  UserDoc
} from "@/lib/types";
import { Badge, Button, EmptyState, Field, Input, Modal, Select, SortHeader, Textarea, cn } from "./ui";
import type { SortDirection } from "./ui";

const priorities: Priority[] = ["Low", "Medium", "High"];
const recurrenceTypes: Array<{ value: RecurrenceType; label: string }> = [
  { value: "none", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" }
];

type ArchiveTab = "active" | "archived";
type JobTarget = { clientIds: Id[]; label: string };
type ClientTypeFilter = "All" | ClientType;
type BalanceFilter = "All" | "Outstanding" | "Paid";
type ClientSortKey = "clientName" | "clientType" | "contact" | "assignedTeamMember" | "balanceDue";
type DocumentTab = "invoice" | "receipts";
type JobFormRow = {
  id: string;
  jobType: string;
  fee: number;
  assignedEmployeeId: Id | "";
  dueDate: string;
  priority: Priority;
  requestedBy: string;
  clientContactPhone: string;
  amountPaid: number;
  notes: string;
  recurrenceType: RecurrenceType;
  nextDueDate: string;
  autoCreateNextJob: boolean;
};

export function ClientsPanel({ me }: { me: UserDoc | null }) {
  const canAddClient = userCan(me, "clients.add");
  const canEditClient = userCan(me, "clients.edit");
  const canArchiveClient = userCan(me, "clients.archive");
  const canAddJob = userCan(me, "jobs.add");
  const canAssignJob = userCanAny(me, ["jobs.assign", "jobs.reassign"]);
  const canSendEmail = userCan(me, "emails.send_client");
  const canManageTags = userCan(me, "settings.manage_tags");
  const canManageReminders = userCan(me, "settings.manage_notifications");
  const canViewPayments = userCan(me, "payments.view");
  const manageable = userCanAny(me, [
    "clients.add",
    "clients.edit",
    "clients.archive",
    "jobs.add",
    "jobs.assign",
    "jobs.reassign",
    "emails.send_client",
    "settings.manage_tags",
    "settings.manage_notifications",
    "payments.view"
  ]);
  const [tab, setTab] = useState<ArchiveTab>("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<Id>>(new Set());
  const [editing, setEditing] = useState<ClientDoc | "new" | null>(null);
  const [detailClientId, setDetailClientId] = useState<Id | null>(null);
  const [jobTarget, setJobTarget] = useState<JobTarget | null>(null);
  const [documentsClient, setDocumentsClient] = useState<ClientDoc | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [clientTypeFilter, setClientTypeFilter] = useState<ClientTypeFilter>("All");
  const [tagFilter, setTagFilter] = useState<"All" | Id>("All");
  const [teamFilter, setTeamFilter] = useState<"All" | Id>("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("All");
  const [sortKey, setSortKey] = useState<ClientSortKey>("clientName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [notice, setNotice] = useState<string | null>(null);

  const clients = useQuery(api.clients.list, {
    archived: tab === "archived"
  });
  const employees = useQuery(api.auth.listEmployees, canAssignJob || canAddJob || canEditClient ? { includeInactive: false } : "skip");
  const services = useQuery(api.services.list, canAddJob ? {} : "skip");
  const tags = useQuery(api.clients.listTags, {});

  const createClient = useMutation(api.clients.create);
  const updateClient = useMutation(api.clients.update);
  const archiveClient = useMutation(api.clients.archive);
  const bulkArchive = useMutation(api.clients.bulkArchive);
  const bulkAssignEmployee = useMutation(api.clients.bulkAssignEmployee);
  const bulkAssignTags = useMutation(api.clients.bulkAssignTags);
  const bulkCreateJobs = useMutation(api.clients.bulkCreateJobs);
  const bulkSendEmail = useMutation(api.clients.bulkSendEmail);
  const bulkCreateReminders = useMutation(api.clients.bulkCreateReminders);
  const upsertTag = useMutation(api.clients.upsertTag);
  const updateTag = useMutation(api.clients.updateTag);
  const removeTag = useMutation(api.clients.removeTag);

  const baseClients = useMemo(() => clients ?? [], [clients]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(baseClients.map((client) => client.businessCategory).filter((value): value is string => Boolean(value)))
      ).sort((a, b) => a.localeCompare(b)),
    [baseClients]
  );
  const visibleClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = baseClients.filter((client) => {
      if (clientTypeFilter !== "All" && client.clientType !== clientTypeFilter) return false;
      if (tagFilter !== "All" && !client.tags.some((tagItem) => tagItem._id === tagFilter)) return false;
      if (teamFilter !== "All" && client.assignedTeamMemberId !== teamFilter) return false;
      if (categoryFilter !== "All" && client.businessCategory !== categoryFilter) return false;
      if (balanceFilter === "Outstanding" && client.balanceDue <= 0) return false;
      if (balanceFilter === "Paid" && client.balanceDue > 0) return false;
      if (!query) return true;

      const haystack = [
        client.clientName,
        client.clientType,
        client.businessLegalName,
        client.dba,
        client.businessCategory,
        client.businessAddress,
        client.mailingAddress,
        client.email,
        client.phoneNumber,
        client.ownerContactPerson,
        client.taxId,
        client.assignedTeamMember?.name,
        client.assignedTeamMember?.email,
        client.notes,
        ...client.tags.map((tagItem) => tagItem.name)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    return filtered.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      return compareClients(a, b, sortKey) * direction;
    });
  }, [balanceFilter, baseClients, categoryFilter, clientTypeFilter, search, sortDirection, sortKey, tagFilter, teamFilter]);
  const visibleIds = useMemo(() => new Set(visibleClients.map((client) => client._id)), [visibleClients]);
  const selectedIds = useMemo(
    () => Array.from(selected).filter((clientId) => visibleIds.has(clientId)),
    [selected, visibleIds]
  );
  const selectedCount = selectedIds.length;
  const allVisibleSelected = visibleClients.length > 0 && selectedCount === visibleClients.length;
  const activeEmployees = useMemo(
    () =>
      (employees ?? []).filter(
        (employee) =>
          employee.isActive !== false &&
          employee.accessStatus !== "suspended" &&
          employee.accessStatus !== "removed"
      ),
    [employees]
  );

  function toggleClient(clientId: Id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }

  function selectVisibleClients() {
    setSelected(new Set(visibleClients.map((client) => client._id)));
  }

  function clearSelectionAndMenu() {
    setSelected(new Set());
    setBulkMenuOpen(false);
  }

  function handleSort(column: string) {
    const nextKey = column as ClientSortKey;
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "balanceDue" ? "desc" : "asc");
    }
    clearSelectionAndMenu();
  }

  function resetFilters() {
    setSearch("");
    setClientTypeFilter("All");
    setTagFilter("All");
    setTeamFilter("All");
    setCategoryFilter("All");
    setBalanceFilter("All");
    setSortKey("clientName");
    setSortDirection("asc");
    clearSelectionAndMenu();
  }

  async function submitClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = clientPayloadFromForm(data);
    const newTagName = String(data.get("newTagName") ?? "").trim();
    if (newTagName) {
      const newTagId = await upsertTag({
        name: newTagName,
        color: String(data.get("newTagColor") ?? "#2563eb")
      });
      payload.tagIds = [...new Set([...(payload.tagIds ?? []), newTagId])];
    }

    if (editing && editing !== "new") {
      await updateClient({ clientId: editing._id, ...payload });
      setNotice(`${payload.clientName} updated.`);
    } else {
      await createClient(payload);
      setNotice(`${payload.clientName} created.`);
    }
    setEditing(null);
  }

  async function archiveSelected(archived: boolean) {
    if (selectedIds.length === 0) return;
    await bulkArchive({ clientIds: selectedIds, archived });
    setNotice(`${selectedIds.length} ${archived ? "archived" : "restored"} client${selectedIds.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
  }

  const selectedLabel =
    selectedCount === 1
      ? visibleClients.find((client) => client._id === selectedIds[0])?.clientName ?? "1 client"
      : `${selectedCount} clients`;

  if (detailClientId) {
    return (
      <ClientDetailsPage
        clientId={detailClientId}
        manageable={manageable}
        onBack={() => setDetailClientId(null)}
      />
    );
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal text-ink">Clients</h2>
          <p className="mt-1 text-sm text-muted">
            {visibleClients.length} of {baseClients.length} {tab === "active" ? "active" : "archived"} accounts
          </p>
        </div>
        {manageable ? (
          <div className="flex flex-wrap items-center gap-2">
            {canManageTags ? (
            <Button type="button" variant="secondary" onClick={() => setTagManagerOpen(true)}>
              <Tag className="h-4 w-4" />
              Manage tags
            </Button>
            ) : null}
            {canAddClient ? (
            <Button type="button" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              New Client
            </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-line bg-white">
        <div className="grid gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 rounded-md bg-panel p-1">
            {(["active", "archived"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setTab(item);
                  clearSelectionAndMenu();
                }}
                className={cn(
                  "h-8 rounded px-3 text-sm font-medium transition",
                  tab === item ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                )}
              >
                {item === "active" ? "Active" : "Archived"}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search clients"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                clearSelectionAndMenu();
              }}
            />
          </div>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
            <label className="grid gap-1 text-xs font-medium uppercase text-muted">
              <span className="inline-flex items-center gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                Type
              </span>
              <Select
                className="h-9 text-sm normal-case"
                value={clientTypeFilter}
                onChange={(event) => {
                  setClientTypeFilter(event.currentTarget.value as ClientTypeFilter);
                  clearSelectionAndMenu();
                }}
              >
                <option value="All">All clients</option>
                <option value="Business">Business</option>
                <option value="Individual">Individual</option>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium uppercase text-muted">
              Tag
              <Select
                className="h-9 text-sm normal-case"
                value={tagFilter}
                onChange={(event) => {
                  setTagFilter(event.currentTarget.value as "All" | Id);
                  clearSelectionAndMenu();
                }}
              >
                <option value="All">All tags</option>
                {(tags ?? []).map((tagItem) => (
                  <option key={tagItem._id} value={tagItem._id}>
                    {tagItem.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium uppercase text-muted">
              Team
              <Select
                className="h-9 text-sm normal-case"
                value={teamFilter}
                onChange={(event) => {
                  setTeamFilter(event.currentTarget.value as "All" | Id);
                  clearSelectionAndMenu();
                }}
              >
                <option value="All">All team</option>
                {activeEmployees.map((employee) => (
                  <option key={employee._id} value={employee._id}>
                    {employee.name ?? employee.email}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium uppercase text-muted">
              Category
              <Select
                className="h-9 text-sm normal-case"
                value={categoryFilter}
                onChange={(event) => {
                  setCategoryFilter(event.currentTarget.value);
                  clearSelectionAndMenu();
                }}
              >
                <option value="All">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium uppercase text-muted">
              Balance
              <Select
                className="h-9 text-sm normal-case"
                value={balanceFilter}
                onChange={(event) => {
                  setBalanceFilter(event.currentTarget.value as BalanceFilter);
                  clearSelectionAndMenu();
                }}
              >
                <option value="All">All balances</option>
                <option value="Outstanding">Balance due</option>
                <option value="Paid">No balance</option>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-xs text-muted">
              {search ? <FilterPill label={`Search: ${search}`} /> : null}
              {clientTypeFilter !== "All" ? <FilterPill label={clientTypeFilter} /> : null}
              {tagFilter !== "All" ? <FilterPill label={`Tag: ${(tags ?? []).find((tagItem) => tagItem._id === tagFilter)?.name ?? "Selected"}`} /> : null}
              {teamFilter !== "All" ? <FilterPill label={`Team: ${activeEmployees.find((employee) => employee._id === teamFilter)?.name ?? "Selected"}`} /> : null}
              {categoryFilter !== "All" ? <FilterPill label={categoryFilter} /> : null}
              {balanceFilter !== "All" ? <FilterPill label={balanceFilter === "Outstanding" ? "Balance due" : "No balance"} /> : null}
            </div>
            <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        </div>

        {notice ? (
          <div className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">{notice}</div>
        ) : null}

        {manageable && selectedCount > 0 ? (
          <div className="flex flex-col gap-3 border-b border-line bg-slate-50 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink">{selectedCount} selected</span>
              <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700" onClick={selectVisibleClients}>
                Select all items
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canAddJob ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                onClick={() => setJobTarget({ clientIds: selectedIds, label: selectedLabel })}
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Add job
              </button>
              ) : null}
              {canAssignJob ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                onClick={() => setAssignOpen(true)}
              >
                <UsersRound className="h-4 w-4" />
                Manage team
              </button>
              ) : null}
              {canSendEmail ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                onClick={() => setEmailOpen(true)}
              >
                <Mail className="h-4 w-4" />
                Send email
              </button>
              ) : null}
              {canArchiveClient ? (
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
                onClick={() => void archiveSelected(tab === "active")}
              >
                <Archive className="h-4 w-4" />
                {tab === "active" ? "Archive clients" : "Restore clients"}
              </button>
              ) : null}
              <div className="relative">
                <Button type="button" variant="secondary" onClick={() => setBulkMenuOpen((open) => !open)}>
                  Bulk actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
                {bulkMenuOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-line bg-white p-1 shadow-soft">
                    {canManageTags ? <BulkMenuButton icon={<Tag className="h-4 w-4" />} label="Assign tags" onClick={() => setTagsOpen(true)} /> : null}
                    {canManageReminders ? <BulkMenuButton icon={<Bell className="h-4 w-4" />} label="Send reminders" onClick={() => setReminderOpen(true)} /> : null}
                    {canArchiveClient ? <BulkMenuButton icon={<Archive className="h-4 w-4" />} label={tab === "active" ? "Archive" : "Restore"} onClick={() => void archiveSelected(tab === "active")} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-white text-xs uppercase text-muted">
              <tr>
                <th className="w-12 px-4 py-3">
                  {manageable ? (
                    <input
                      aria-label="Select all clients"
                      type="checkbox"
                      className="h-4 w-4 rounded border-line"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        setSelected(event.currentTarget.checked ? new Set(visibleClients.map((client) => client._id)) : new Set());
                      }}
                    />
                  ) : null}
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Client" column="clientName" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Type" column="clientType" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Contact" column="contact" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortHeader label="Assigned team member" column="assignedTeamMember" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                </th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 text-right font-medium">
                  <SortHeader label="Balance due" column="balanceDue" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} align="right" />
                </th>
                {manageable ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleClients.map((client) => (
                <tr key={client._id} className="bg-white transition hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {manageable ? (
                      <input
                        aria-label={`Select ${client.clientName}`}
                        type="checkbox"
                        className="h-4 w-4 rounded border-line"
                        checked={selected.has(client._id)}
                        onChange={() => toggleClient(client._id)}
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`#client-${client._id}`}
                      className="text-left font-semibold text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline"
                      onClick={(event) => {
                        event.preventDefault();
                        setDetailClientId(client._id);
                      }}
                    >
                      {client.clientName}
                    </a>
                    <div className="mt-1 max-w-sm truncate text-xs text-muted">
                      {client.businessLegalName || client.dba || client.businessCategory || "No legal name on file"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={client.clientType === "Business" ? "blue" : "neutral"}>{client.clientType}</Badge>
                    <div className="mt-1 text-xs text-muted">{client.businessCategory ?? "Uncategorized"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div className="font-medium text-ink">{client.ownerContactPerson || "No contact"}</div>
                    <div className="mt-1">{client.email || "No email"}</div>
                    <div>{client.phoneNumber || "No phone"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{client.assignedTeamMember?.name ?? client.assignedTeamMember?.email ?? "Unassigned"}</td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {client.tags.length > 0 ? (
                        client.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag._id}
                            className="rounded-md border px-2 py-0.5 text-xs font-medium"
                            style={{ borderColor: `${tag.color}33`, backgroundColor: `${tag.color}12`, color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted">No tags</span>
                      )}
                      {client.tags.length > 3 ? <span className="text-xs text-muted">+{client.tags.length - 3}</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(client.balanceDue)}</td>
                  {manageable ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        {canAddJob ? (
                        <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700" onClick={() => setJobTarget({ clientIds: [client._id], label: client.clientName })}>
                          Add job
                        </button>
                        ) : null}
                        {canViewPayments ? (
                        <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700" onClick={() => setDocumentsClient(client)}>
                          Invoices
                        </button>
                        ) : null}
                        {canEditClient ? (
                        <button
                          type="button"
                          aria-label={`Edit ${client.clientName}`}
                          title={`Edit ${client.clientName}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          onClick={() => setEditing(client)}
                        >
                          <Edit3 className="inline h-4 w-4" />
                        </button>
                        ) : null}
                        {canArchiveClient ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          onClick={() => void archiveClient({ clientId: client._id, archived: tab === "active" })}
                        >
                          {tab === "active" ? "Archive" : "Restore"}
                        </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {clients === undefined ? (
          <div className="p-4">
            <EmptyState title="Loading clients..." />
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No clients found" />
          </div>
        ) : null}
      </div>

      {tagManagerOpen ? (
        <Modal title="Manage tags" onClose={() => setTagManagerOpen(false)}>
          <TagManagerForm
            tags={tags ?? []}
            onCreate={async (name, color) => {
              await upsertTag({ name, color });
              setNotice(`${name.trim()} tag created.`);
            }}
            onUpdate={async (tagId, name, color) => {
              await updateTag({ tagId, name, color });
              setNotice(`${name.trim()} tag updated.`);
            }}
            onRemove={async (tagId, name) => {
              await removeTag({ tagId });
              setNotice(`${name} tag removed.`);
            }}
          />
        </Modal>
      ) : null}

      {documentsClient ? (
        <Modal title="Client invoices and receipts" onClose={() => setDocumentsClient(null)}>
          <ClientDocuments client={documentsClient} manageable={manageable} />
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={editing === "new" ? "New Client" : "Edit Client"} onClose={() => setEditing(null)}>
          <ClientForm
            client={editing === "new" ? null : editing}
            employees={activeEmployees}
            tags={tags ?? []}
            onSubmit={submitClient}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      ) : null}

      {jobTarget ? (
        <Modal title="Add job order" onClose={() => setJobTarget(null)}>
          <JobOrderForm
            target={jobTarget}
            employees={activeEmployees}
            services={services ?? []}
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const recurrenceType = String(data.get("recurrenceType") ?? "none") as RecurrenceType;
              const result = await bulkCreateJobs({
                clientIds: jobTarget.clientIds,
                jobType: String(data.get("jobType") ?? ""),
                fee: Number(data.get("fee") ?? 0),
                assignedEmployeeId: String(data.get("assignedEmployeeId") ?? ""),
                dueDate: String(data.get("dueDate") ?? ""),
                priority: String(data.get("priority") ?? "Medium") as Priority,
                requestedBy: String(data.get("requestedBy") ?? ""),
                clientContactPhone: String(data.get("clientContactPhone") ?? ""),
                amountPaid: Number(data.get("amountPaid") ?? 0),
                notes: String(data.get("notes") ?? ""),
                recurrenceType,
                nextDueDate: recurrenceType === "none" ? null : String(data.get("nextDueDate") ?? ""),
                autoCreateNextJob: data.get("autoCreateNextJob") === "on"
              });
              setNotice(`${result.created} job order${result.created === 1 ? "" : "s"} created.`);
              setJobTarget(null);
              setSelected(new Set());
            }}
            onCancel={() => setJobTarget(null)}
          />
        </Modal>
      ) : null}

      {assignOpen ? (
        <Modal title="Manage team assignment" onClose={() => setAssignOpen(false)}>
          <AssignEmployeeForm
            selectedCount={selectedCount}
            employees={activeEmployees}
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const employeeId = String(data.get("assignedTeamMemberId") ?? "");
              const result = await bulkAssignEmployee({ clientIds: selectedIds, assignedTeamMemberId: employeeId });
              setNotice(`${result.updated} client${result.updated === 1 ? "" : "s"} assigned.`);
              setAssignOpen(false);
              setSelected(new Set());
            }}
            onCancel={() => setAssignOpen(false)}
          />
        </Modal>
      ) : null}

      {emailOpen ? (
        <Modal title="Send email" onClose={() => setEmailOpen(false)}>
          <MessageForm
            selectedCount={selectedCount}
            kind="email"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = await bulkSendEmail({
                clientIds: selectedIds,
                subject: String(data.get("subject") ?? ""),
                message: String(data.get("message") ?? "")
              });
              setNotice(`${result.queued} email${result.queued === 1 ? "" : "s"} queued.`);
              setEmailOpen(false);
            }}
            onCancel={() => setEmailOpen(false)}
          />
        </Modal>
      ) : null}

      {tagsOpen ? (
        <Modal title="Assign tags" onClose={() => setTagsOpen(false)}>
          <TagAssignmentForm
            selectedCount={selectedCount}
            tags={tags ?? []}
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const chosenTagIds = data.getAll("tagIds").map(String);
              const newTagName = String(data.get("newTagName") ?? "").trim();
              const newTagColor = String(data.get("newTagColor") ?? "#2563eb");
              if (newTagName) {
                const createdTagId = await upsertTag({ name: newTagName, color: newTagColor });
                chosenTagIds.push(createdTagId);
              }
              if (chosenTagIds.length > 0) {
                const result = await bulkAssignTags({ clientIds: selectedIds, tagIds: chosenTagIds });
                setNotice(`${result.updated} client${result.updated === 1 ? "" : "s"} tagged.`);
              }
              setTagsOpen(false);
              setSelected(new Set());
            }}
            onCancel={() => setTagsOpen(false)}
          />
        </Modal>
      ) : null}

      {reminderOpen ? (
        <Modal title="Send reminders" onClose={() => setReminderOpen(false)}>
          <ReminderForm
            selectedCount={selectedCount}
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = await bulkCreateReminders({
                clientIds: selectedIds,
                reminderDate: String(data.get("reminderDate") ?? ""),
                message: String(data.get("message") ?? "")
              });
              setNotice(`${result.created} reminder${result.created === 1 ? "" : "s"} queued.`);
              setReminderOpen(false);
            }}
            onCancel={() => setReminderOpen(false)}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function BulkMenuButton({
  icon,
  label,
  onClick
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-ink hover:bg-panel"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ClientDocuments({ client, manageable }: { client: ClientDoc; manageable: boolean }) {
  const [tab, setTab] = useState<DocumentTab>("invoice");
  const [recordOpen, setRecordOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentDoc | null>(null);
  const [documentDate] = useState(() => dateShort(Date.now()));
  const jobs = useQuery(api.jobs.list, { clientId: client._id });
  const payments = useQuery(api.payments.list, { clientId: client._id });
  const recordPayment = useMutation(api.payments.record);

  const clientJobs = jobs ?? [];
  const clientPayments = payments ?? [];
  const payableJobs = clientJobs.filter((job) => job.remainingBalance > 0);
  const invoiceNumber = `INV-${client._id.slice(-6).toUpperCase()}`;
  const invoiceTotal = clientJobs.reduce((sum, job) => sum + job.fee, 0);
  const invoicePaid = clientJobs.reduce((sum, job) => sum + job.amountPaid, 0);
  const invoiceBalance = clientJobs.reduce((sum, job) => sum + job.remainingBalance, 0);
  const totalReceipts = clientPayments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border border-line bg-panel p-1">
          <button
            type="button"
            className={cn(
              "h-9 rounded px-3 text-sm font-medium",
              tab === "invoice" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
            onClick={() => setTab("invoice")}
          >
            Invoice
          </button>
          <button
            type="button"
            className={cn(
              "h-9 rounded px-3 text-sm font-medium",
              tab === "receipts" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
            )}
            onClick={() => setTab("receipts")}
          >
            Receipts
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {manageable ? (
            <Button type="button" variant="secondary" onClick={() => setRecordOpen(true)} disabled={payableJobs.length === 0}>
              <ReceiptText className="h-4 w-4" />
              Record payment
            </Button>
          ) : null}
          <Button type="button" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {tab === "invoice" ? (
        <DocumentFrame>
          <DocumentHeader label="Invoice" number={invoiceNumber} issuedAt={documentDate} />
          <ClientDocumentAddress client={client} />

          <div className="grid gap-3 sm:grid-cols-3">
            <DocumentMetric label="Invoice total" value={money(invoiceTotal)} />
            <DocumentMetric label="Paid" value={money(invoicePaid)} />
            <DocumentMetric label="Balance due" value={money(invoiceBalance)} tone={invoiceBalance > 0 ? "red" : "green"} />
          </div>

          <div className="overflow-hidden rounded-md border border-line">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Job ID</th>
                  <th className="px-4 py-3 font-medium">Service</th>
                  <th className="px-4 py-3 font-medium">Requested by</th>
                  <th className="px-4 py-3 font-medium">Due date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Fee</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {clientJobs.map((job) => (
                  <tr key={job._id}>
                    <td className="px-4 py-3 font-medium">
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                        {jobOrderId(job)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                        {job.jobType}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{requesterLabel(job)}</td>
                    <td className="px-4 py-3 text-muted">{dateShort(job.dueDate)}</td>
                    <td className="px-4 py-3 text-muted">{job.status}</td>
                    <td className="px-4 py-3 text-right text-muted">{money(job.fee)}</td>
                    <td className="px-4 py-3 text-right text-muted">{money(job.amountPaid)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">{money(job.remainingBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {clientJobs.length === 0 ? <EmptyState title="No jobs to invoice for this client" /> : null}
        </DocumentFrame>
      ) : (
        <div className="grid gap-4">
          <DocumentFrame>
            <DocumentHeader label="Payment receipts" number={`RCPT-${client._id.slice(-6).toUpperCase()}`} issuedAt={documentDate} />
            <ClientDocumentAddress client={client} />
            <DocumentMetric label="Total payments received" value={money(totalReceipts)} tone="green" />

            <div className="overflow-hidden rounded-md border border-line">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-panel text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Receipt</th>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Received by</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {clientPayments.map((payment) => (
                    <tr key={payment._id}>
                      <td className="px-4 py-3 font-medium text-ink">RCPT-{payment._id.slice(-6).toUpperCase()}</td>
                      <td className="px-4 py-3 text-muted">{payment.job?.jobType ?? "Deleted job"}</td>
                      <td className="px-4 py-3 text-muted">{dateShort(payment.paidAt)}</td>
                      <td className="px-4 py-3 text-muted">{payment.receivedBy?.name ?? payment.receivedBy?.email ?? "Team"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">{money(payment.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          onClick={() => setSelectedReceipt(payment)}
                        >
                          View receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {clientPayments.length === 0 ? <EmptyState title="No receipts yet for this client" /> : null}
          </DocumentFrame>

          {selectedReceipt ? (
            <ReceiptPreview client={client} payment={selectedReceipt} onClose={() => setSelectedReceipt(null)} />
          ) : null}
        </div>
      )}

      {recordOpen ? (
        <Modal title="Record client payment" onClose={() => setRecordOpen(false)}>
          <RecordClientPaymentForm
            jobs={payableJobs}
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              await recordPayment({
                jobId: String(data.get("jobId") ?? ""),
                amount: Number(data.get("amount") ?? 0),
                note: String(data.get("note") ?? "")
              });
              setRecordOpen(false);
              setTab("receipts");
            }}
            onCancel={() => setRecordOpen(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}

function DocumentFrame({ children }: { children: ReactNode }) {
  return <section className="grid gap-5 rounded-lg border border-line bg-white p-5">{children}</section>;
}

function DocumentHeader({ label, number, issuedAt }: { label: string; number: string; issuedAt: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-32 items-center rounded-md border border-line bg-white px-2">
          <Image
            src="/center-business-logo.png"
            alt="Center Business Services logo"
            width={150}
            height={48}
            className="h-auto w-full object-contain"
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Center Business Services</p>
          <p className="text-sm text-muted">Bookkeeping and business services office</p>
        </div>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-xs uppercase text-muted">{label}</p>
        <p className="text-xl font-semibold text-ink">{number}</p>
        <p className="mt-1 text-sm text-muted">{issuedAt}</p>
      </div>
    </div>
  );
}

function ClientDocumentAddress({ client }: { client: ClientDoc }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-md border border-line bg-panel p-3">
        <p className="text-xs uppercase text-muted">Bill to</p>
        <p className="mt-1 text-sm font-semibold text-ink">{client.clientName}</p>
        <p className="text-sm text-muted">{client.businessLegalName ?? client.dba ?? client.businessCategory ?? ""}</p>
      </div>
      <div className="rounded-md border border-line bg-panel p-3">
        <p className="text-xs uppercase text-muted">Contact</p>
        <p className="mt-1 text-sm font-semibold text-ink">{client.ownerContactPerson || "No contact"}</p>
        <p className="text-sm text-muted">{client.email || client.phoneNumber || ""}</p>
      </div>
      <div className="rounded-md border border-line bg-panel p-3">
        <p className="text-xs uppercase text-muted">Address</p>
        <p className="mt-1 text-sm font-semibold text-ink">{client.businessAddress || client.mailingAddress || "No address"}</p>
        <p className="text-sm text-muted">{client.taxId ? `Tax ID: ${client.taxId}` : ""}</p>
      </div>
    </div>
  );
}

function DocumentMetric({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", tone === "green" && "text-success", tone === "red" && "text-danger", tone === "neutral" && "text-ink")}>
        {value}
      </p>
    </div>
  );
}

function ReceiptPreview({
  client,
  payment,
  onClose
}: {
  client: ClientDoc;
  payment: PaymentDoc;
  onClose: () => void;
}) {
  return (
    <DocumentFrame>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink">Receipt RCPT-{payment._id.slice(-6).toUpperCase()}</h3>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close preview
        </Button>
      </div>
      <DocumentHeader label="Receipt" number={`RCPT-${payment._id.slice(-6).toUpperCase()}`} issuedAt={dateShort(payment.paidAt)} />
      <ClientDocumentAddress client={client} />
      <div className="grid gap-3 sm:grid-cols-3">
        <DocumentMetric label="Amount paid" value={money(payment.amount)} tone="green" />
        <DocumentMetric label="Payment date" value={dateShort(payment.paidAt)} />
        <DocumentMetric label="Service" value={payment.job?.jobType ?? "Payment"} />
      </div>
      {payment.note ? (
        <div className="rounded-md border border-line bg-panel p-3">
          <p className="text-xs uppercase text-muted">Note</p>
          <p className="mt-1 text-sm text-ink">{payment.note}</p>
        </div>
      ) : null}
    </DocumentFrame>
  );
}

function RecordClientPaymentForm({
  jobs,
  onSubmit,
  onCancel
}: {
  jobs: JobDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {jobs.length > 0 ? (
        <Field label="Job">
          <Select name="jobId" defaultValue={jobs[0]?._id} required>
            {jobs.map((job) => (
              <option key={job._id} value={job._id}>
                {job.jobType} - {money(job.remainingBalance)} due
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <EmptyState title="This client has no unpaid jobs" />
      )}
      <Field label="Amount">
        <Input name="amount" type="number" min="0" step="0.01" defaultValue={jobs[0]?.remainingBalance ?? 0} required />
      </Field>
      <Field label="Receipt note">
        <Input name="note" defaultValue="Client payment" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={jobs.length === 0}>
          Record payment
        </Button>
      </div>
    </form>
  );
}

function FilterPill({ label }: { label: string }) {
  return <span className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-muted">{label}</span>;
}

function compareClients(a: ClientDoc, b: ClientDoc, key: ClientSortKey) {
  if (key === "clientName") return textCompare(a.clientName, b.clientName);
  if (key === "clientType") return textCompare(a.clientType, b.clientType);
  if (key === "contact") return textCompare(a.ownerContactPerson ?? "", b.ownerContactPerson ?? "");
  if (key === "assignedTeamMember") {
    return textCompare(
      a.assignedTeamMember?.name ?? a.assignedTeamMember?.email ?? "",
      b.assignedTeamMember?.name ?? b.assignedTeamMember?.email ?? ""
    );
  }
  return a.balanceDue - b.balanceDue;
}

function textCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function ClientDetailsPage({
  clientId,
  manageable,
  onBack
}: {
  clientId: Id;
  manageable: boolean;
  onBack: () => void;
}) {
  const client = useQuery(api.clients.get, { clientId });
  const jobs = useQuery(api.jobs.list, { clientId });
  const payments = useQuery(api.payments.list, { clientId });
  const emails = useQuery(api.emails.list, { clientId });
  const employees = useQuery(api.auth.listEmployees, manageable ? { includeInactive: false } : "skip");
  const services = useQuery(api.services.list, manageable ? {} : "skip");
  const tags = useQuery(api.clients.listTags, {});
  const updateClient = useMutation(api.clients.update);
  const upsertTag = useMutation(api.clients.upsertTag);
  const createJobsForClient = useMutation(api.clients.createJobsForClient);
  const sendEmail = useAction(api.emails.send);
  const [editing, setEditing] = useState(false);
  const [addingJobs, setAddingJobs] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const emailDraft = useQuery(api.emails.getDraft, emailOpen ? { clientId, emailType: "general" } : "skip");

  const clientJobs = jobs ?? [];
  const clientPayments = payments ?? [];
  const clientEmails = emails ?? [];
  const recurringJobs = clientJobs.filter((job) => job.recurrenceType && job.recurrenceType !== "none");
  const activeEmployees = useMemo(
    () =>
      (employees ?? []).filter(
        (employee) =>
          employee.isActive !== false &&
          employee.accessStatus !== "suspended" &&
          employee.accessStatus !== "removed"
      ),
    [employees]
  );

  if (client === undefined) {
    return <EmptyState title="Loading client details..." />;
  }

  if (!client) {
    return (
      <section className="grid gap-4">
        <Button type="button" variant="secondary" className="w-fit" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Button>
        <EmptyState title="Client not found" />
      </section>
    );
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const data = new FormData(event.currentTarget);
    const payload = clientPayloadFromForm(data);
    const newTagName = String(data.get("newTagName") ?? "").trim();
    if (newTagName) {
      const newTagId = await upsertTag({
        name: newTagName,
        color: String(data.get("newTagColor") ?? "#2563eb")
      });
      payload.tagIds = [...new Set([...(payload.tagIds ?? []), newTagId])];
    }
    await updateClient({ clientId: client._id, ...payload });
    setNotice(`${payload.clientName} updated.`);
    setEditing(false);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-ink">{client.clientName}</h2>
            <p className="mt-1 text-sm text-muted">Client details, job history, payments, and recurring services</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setDocumentsOpen(true)}>
            <ReceiptText className="h-4 w-4" />
            Invoices
          </Button>
          {manageable ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setEmailOpen(true)}>
                <Mail className="h-4 w-4" />
                Email client
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAddingJobs(true)}>
                <BriefcaseBusiness className="h-4 w-4" />
                Add jobs
              </Button>
              <Button type="button" onClick={() => setEditing((value) => !value)}>
                <Edit3 className="h-4 w-4" />
                {editing ? "Cancel edit" : "Edit Client"}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {notice ? <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-700">{notice}</div> : null}

      {editing ? (
        <section className="rounded-lg border border-line bg-white p-5">
          <ClientForm
            client={client}
            employees={activeEmployees}
            tags={tags ?? []}
            onSubmit={submitEdit}
            onCancel={() => setEditing(false)}
          />
        </section>
      ) : (
        <section className="grid gap-4 rounded-lg border border-line bg-white p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoBlock label="Client type" value={client.clientType} />
            <InfoBlock label="Business legal name" value={client.businessLegalName || "Not set"} />
            <InfoBlock label="DBA" value={client.dba || "Not set"} />
            <InfoBlock label="Category" value={client.businessCategory || "Not set"} />
            <InfoBlock label="Owner/contact person" value={client.ownerContactPerson || "Not set"} />
            <InfoBlock label="Assigned team member" value={client.assignedTeamMember?.name ?? client.assignedTeamMember?.email ?? "Unassigned"} />
            <InfoBlock label="Phone" value={client.phoneNumber || "Not set"} />
            <InfoBlock label="Email" value={client.email || "Not set"} />
            <InfoBlock label="Last email sent" value={client.lastEmailSentAt ? dateShort(client.lastEmailSentAt) : "Never"} />
            <InfoBlock label="EIN / SSN / ITIN" value={client.taxId || "Not set"} />
            <InfoBlock label="Business address" value={client.businessAddress || "Not set"} />
            <InfoBlock label="Mailing address" value={client.mailingAddress || "Not set"} />
            <InfoBlock label="Balance due" value={money(client.balanceDue)} strong />
          </div>
          <div className="grid gap-2">
            <p className="text-xs font-medium uppercase text-muted">Tags</p>
            <div className="flex flex-wrap gap-1">
              {client.tags.length > 0 ? (
                client.tags.map((tagItem) => (
                  <span
                    key={tagItem._id}
                    className="rounded-md border px-2 py-0.5 text-xs font-medium"
                    style={{ borderColor: `${tagItem.color}33`, backgroundColor: `${tagItem.color}12`, color: tagItem.color }}
                  >
                    {tagItem.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">No tags</span>
              )}
            </div>
          </div>
          <div className="rounded-md border border-line bg-panel p-3">
            <p className="text-xs font-medium uppercase text-muted">Notes</p>
            <p className="mt-1 text-sm text-ink">{client.notes || "No notes on file."}</p>
          </div>
        </section>
      )}

      <section className="grid gap-3 rounded-lg border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">Job orders</h3>
          <Badge tone="blue">{clientJobs.length} total</Badge>
        </div>
        <ClientJobsTable jobs={clientJobs} />
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">Payment history</h3>
          <Badge tone="green">{money(clientPayments.reduce((sum, payment) => sum + payment.amount, 0))}</Badge>
        </div>
        <PaymentHistoryTable payments={clientPayments} />
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">Email history</h3>
          <Badge tone={client.lastEmailSentAt ? "green" : "neutral"}>
            {client.lastEmailSentAt ? `Last sent ${dateShort(client.lastEmailSentAt)}` : "No email sent"}
          </Badge>
        </div>
        <EmailHistoryTable emails={clientEmails} />
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <NotebookTabs className="h-4 w-4 text-muted" />
          <h3 className="text-base font-semibold text-ink">Recurring services</h3>
        </div>
        {recurringJobs.length > 0 ? <ClientJobsTable jobs={recurringJobs} compact /> : <EmptyState title="No recurring services for this client" />}
      </section>

      {addingJobs ? (
        <Modal title="Add multiple job orders" onClose={() => setAddingJobs(false)}>
          <MultiJobOrderForm
            client={client}
            employees={activeEmployees}
            services={services ?? []}
            onSubmit={async (jobInputs) => {
              const result = await createJobsForClient({ clientId: client._id, jobs: jobInputs });
              setNotice(`${result.created} job order${result.created === 1 ? "" : "s"} added to ${client.clientName}.`);
              setAddingJobs(false);
            }}
            onCancel={() => setAddingJobs(false)}
          />
        </Modal>
      ) : null}

      {documentsOpen ? (
        <Modal title="Client invoices and receipts" onClose={() => setDocumentsOpen(false)}>
          <ClientDocuments client={client} manageable={manageable} />
        </Modal>
      ) : null}

      {emailOpen ? (
        <Modal title="Send client email" onClose={() => setEmailOpen(false)}>
          <ClientEmailForm
            draft={emailDraft}
            error={emailError}
            onSubmit={async (event) => {
              event.preventDefault();
              setEmailError(null);
              const form = event.currentTarget;
              const data = new FormData(form);
              try {
                await sendEmail({
                  clientId: client._id,
                  emailType: "general",
                  recipientEmail: String(data.get("recipientEmail") ?? ""),
                  subject: String(data.get("subject") ?? ""),
                  message: String(data.get("message") ?? ""),
                  saveTemplate: data.get("saveTemplate") === "on"
                });
                setNotice(`Email sent to ${client.clientName}.`);
                setEmailOpen(false);
              } catch (error) {
                setEmailError(error instanceof Error ? error.message : "Email failed to send.");
              }
            }}
            onCancel={() => setEmailOpen(false)}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function InfoBlock({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className={cn("mt-1 text-sm", strong ? "font-semibold text-ink" : "text-ink")}>{value}</p>
    </div>
  );
}

function ClientJobsTable({ jobs, compact = false }: { jobs: JobDoc[]; compact?: boolean }) {
  if (jobs.length === 0) {
    return <EmptyState title="No job orders for this client" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-panel text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Job ID</th>
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">Requested by</th>
            <th className="px-4 py-3 font-medium">Assigned</th>
            <th className="px-4 py-3 font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {!compact ? <th className="px-4 py-3 font-medium">Recurrence</th> : null}
            <th className="px-4 py-3 text-right font-medium">Fee</th>
            <th className="px-4 py-3 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {jobs.map((job) => (
            <tr key={job._id}>
              <td className="px-4 py-3 font-medium">
                <Link className="text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                  {jobOrderId(job)}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link className="font-medium text-blue-600 hover:text-blue-700 hover:underline" href={jobDetailHref(job)}>
                  {job.jobType}
                </Link>
                {job.notes ? <p className="mt-1 max-w-xs truncate text-xs text-muted">{job.notes}</p> : null}
              </td>
              <td className="px-4 py-3 text-muted">{requesterLabel(job)}</td>
              <td className="px-4 py-3 text-muted">{job.assignedEmployee?.name ?? job.assignedEmployee?.email ?? "Unassigned"}</td>
              <td className="px-4 py-3 text-muted">{dateShort(job.dueDate)}</td>
              <td className="px-4 py-3">
                <Badge tone={job.priority === "High" ? "red" : job.priority === "Medium" ? "amber" : "neutral"}>{job.priority}</Badge>
              </td>
              <td className="px-4 py-3 text-muted">{job.status}</td>
              {!compact ? (
                <td className="px-4 py-3 text-muted">
                  {job.recurrenceType && job.recurrenceType !== "none"
                    ? `${job.recurrenceType}${job.nextDueDate ? `, next ${dateShort(job.nextDueDate)}` : ""}`
                    : "One-time"}
                </td>
              ) : null}
              <td className="px-4 py-3 text-right text-muted">{money(job.fee)}</td>
              <td className="px-4 py-3 text-right font-semibold text-ink">{money(job.remainingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentHistoryTable({ payments }: { payments: PaymentDoc[] }) {
  if (payments.length === 0) {
    return <EmptyState title="No payments recorded for this client" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-panel text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Receipt</th>
            <th className="px-4 py-3 font-medium">Job</th>
            <th className="px-4 py-3 font-medium">Requested by</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Received by</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {payments.map((payment) => (
            <tr key={payment._id}>
              <td className="px-4 py-3 font-medium text-ink">RCPT-{payment._id.slice(-6).toUpperCase()}</td>
              <td className="px-4 py-3 text-muted">{payment.job?.jobType ?? "Deleted job"}</td>
              <td className="px-4 py-3 text-muted">{requesterLabel(payment.job)}</td>
              <td className="px-4 py-3 text-muted">{dateShort(payment.paidAt)}</td>
              <td className="px-4 py-3 text-muted">{payment.receivedBy?.name ?? payment.receivedBy?.email ?? "Team"}</td>
              <td className="px-4 py-3 text-right font-semibold text-ink">{money(payment.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmailHistoryTable({ emails }: { emails: JobEmailDoc[] }) {
  if (emails.length === 0) {
    return <EmptyState title="No emails have been sent to this client" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-panel text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Subject</th>
            <th className="px-4 py-3 font-medium">Recipient</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Sent</th>
            <th className="px-4 py-3 font-medium">Sent by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {emails.map((email) => (
            <tr key={email._id}>
              <td className="px-4 py-3 text-muted">{emailTypeLabel(email.emailType)}</td>
              <td className="px-4 py-3 font-medium text-ink">{email.subject}</td>
              <td className="px-4 py-3 text-muted">{email.recipientEmail ?? "Client"}</td>
              <td className="px-4 py-3">
                <Badge tone={email.deliveryStatus === "failed" ? "red" : email.deliveryStatus === "queued" ? "amber" : "green"}>
                  {email.deliveryStatus ?? "sent"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted">{dateShort(email.sentAt)}</td>
              <td className="px-4 py-3 text-muted">{email.sentBy?.name ?? email.sentBy?.email ?? "Team"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientEmailForm({
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
        <Textarea name="message" defaultValue={draft.message} className="min-h-48" required />
      </Field>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input name="saveTemplate" type="checkbox" />
        Save this as the general message template
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

function TagManagerForm({
  tags,
  onCreate,
  onUpdate,
  onRemove
}: {
  tags: TagDoc[];
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (tagId: Id, name: string, color: string) => Promise<void>;
  onRemove: (tagId: Id, name: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  return (
    <div className="grid gap-5">
      <form
        className="grid gap-3 rounded-md border border-line bg-panel p-3 sm:grid-cols-[1fr_7rem_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setPending(true);
          try {
            await onCreate(String(data.get("name") ?? ""), String(data.get("color") ?? "#2563eb"));
            event.currentTarget.reset();
          } finally {
            setPending(false);
          }
        }}
      >
        <Field label="New tag name">
          <Input name="name" placeholder="VIP client" required />
        </Field>
        <Field label="Color">
          <Input name="color" type="color" defaultValue="#2563eb" className="h-10 p-1" />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            <Plus className="h-4 w-4" />
            Add tag
          </Button>
        </div>
      </form>

      <div className="grid gap-2">
        {tags.length > 0 ? (
          tags.map((tagItem) => (
            <form
              key={tagItem._id}
              className="grid gap-3 rounded-md border border-line bg-white p-3 sm:grid-cols-[1fr_7rem_auto_auto]"
              onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setPending(true);
                try {
                  await onUpdate(tagItem._id, String(data.get("name") ?? ""), String(data.get("color") ?? "#2563eb"));
                } finally {
                  setPending(false);
                }
              }}
            >
              <Field label="Tag name">
                <Input name="name" defaultValue={tagItem.name} required />
              </Field>
              <Field label="Color">
                <Input name="color" type="color" defaultValue={tagItem.color} className="h-10 p-1" />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="secondary" disabled={pending}>
                  Save
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={async () => {
                    if (window.confirm(`Remove the ${tagItem.name} tag from all clients?`)) {
                      setPending(true);
                      try {
                        await onRemove(tagItem._id, tagItem.name);
                      } finally {
                        setPending(false);
                      }
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </form>
          ))
        ) : (
          <EmptyState title="No tags have been created yet" />
        )}
      </div>
    </div>
  );
}

function ClientForm({
  client,
  employees,
  tags,
  onSubmit,
  onCancel
}: {
  client: ClientDoc | null;
  employees: UserDoc[];
  tags: TagDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [clientType, setClientType] = useState<ClientType>(client?.clientType ?? "Business");
  const selectedTags = new Set(client?.tags.map((tagItem) => tagItem._id) ?? []);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client name">
          <Input name="clientName" defaultValue={client?.clientName ?? ""} required />
        </Field>
        <Field label="Client type">
          <Select
            name="clientType"
            value={clientType}
            onChange={(event) => setClientType(event.currentTarget.value as ClientType)}
          >
            <option value="Business">Business</option>
            <option value="Individual">Individual</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business legal name">
          <Input name="businessLegalName" defaultValue={client?.businessLegalName ?? ""} />
        </Field>
        <Field label="DBA">
          <Input name="dba" defaultValue={client?.dba ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business type/category">
          <Input name="businessCategory" defaultValue={client?.businessCategory ?? ""} />
        </Field>
        <Field label="Owner/contact person">
          <Input name="ownerContactPerson" defaultValue={client?.ownerContactPerson ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number">
          <Input name="phoneNumber" defaultValue={client?.phoneNumber ?? ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={client?.email ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business address">
          <Input name="businessAddress" defaultValue={client?.businessAddress ?? ""} />
        </Field>
        <Field label="Mailing address">
          <Input name="mailingAddress" defaultValue={client?.mailingAddress ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={clientType === "Business" ? "EIN" : "SSN/ITIN"}>
          <Input name="taxId" defaultValue={client?.taxId ?? ""} />
        </Field>
        <Field label="Balance due">
          <Input name="balanceDue" type="number" min="0" step="0.01" defaultValue={client?.balanceDue ?? 0} required />
        </Field>
        <Field label="Assigned team member">
          <Select name="assignedTeamMemberId" defaultValue={client?.assignedTeamMemberId ?? ""}>
            <option value="">Unassigned</option>
            {employees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {employee.name ?? employee.email}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-ink">Tags</span>
        <div className="flex flex-wrap gap-2">
          {tags.length > 0 ? (
            tags.map((tagItem) => (
              <label
                key={tagItem._id}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
              >
                <input name="tagIds" type="checkbox" value={tagItem._id} defaultChecked={selectedTags.has(tagItem._id)} />
                <span>{tagItem.name}</span>
              </label>
            ))
          ) : (
            <span className="text-sm text-muted">No tags yet</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 rounded-md border border-line bg-panel p-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Add new tag">
          <Input name="newTagName" placeholder="Monthly client" />
        </Field>
        <Field label="Color">
          <Input name="newTagColor" type="color" defaultValue="#2563eb" className="h-10 p-1" />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" defaultValue={client?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

function MultiJobOrderForm({
  client,
  employees,
  services,
  onSubmit,
  onCancel
}: {
  client: ClientDoc;
  employees: UserDoc[];
  services: ServiceDoc[];
  onSubmit: (
    jobs: Array<{
      jobType: string;
      fee: number;
      assignedEmployeeId: Id;
      dueDate: string;
      priority: Priority;
      requestedBy?: string;
      clientContactPhone?: string;
      amountPaid?: number;
      notes?: string;
      recurrenceType: RecurrenceType;
      nextDueDate?: string | null;
      autoCreateNextJob: boolean;
    }>
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<JobFormRow[]>(() => [
    createJobFormRow(services, employees, today),
    createJobFormRow(services, employees, today)
  ]);
  const [pending, setPending] = useState(false);

  function updateRow(rowId: string, patch: Partial<JobFormRow>) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await onSubmit(
            rows.map((row) => ({
              jobType: row.jobType,
              fee: Number(row.fee),
              assignedEmployeeId: String(row.assignedEmployeeId),
              dueDate: row.dueDate,
              priority: row.priority,
              requestedBy: row.requestedBy,
              clientContactPhone: row.clientContactPhone,
              amountPaid: Number(row.amountPaid),
              notes: row.notes,
              recurrenceType: row.recurrenceType,
              nextDueDate: row.recurrenceType === "none" ? null : row.nextDueDate || null,
              autoCreateNextJob: row.recurrenceType === "none" ? false : row.autoCreateNextJob
            }))
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        Creating {rows.length} job order{rows.length === 1 ? "" : "s"} for{" "}
        <span className="font-medium text-ink">{client.clientName}</span>
      </div>

      <div className="grid gap-3">
        {rows.map((row, index) => (
          <div key={row.id} className="grid gap-3 rounded-md border border-line bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Job order {index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <Field label="Service">
                <Select value={row.jobType} onChange={(event) => updateRow(row.id, { jobType: event.currentTarget.value })} required>
                  {services.map((service) => (
                    <option key={service._id} value={service.name}>
                      {service.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Requested by">
                <Input
                  value={row.requestedBy}
                  onChange={(event) => updateRow(row.id, { requestedBy: event.currentTarget.value })}
                  placeholder="Owner, accountant, store employee, or contact name"
                />
              </Field>
              <Field label="Requester phone">
                <Input
                  value={row.clientContactPhone}
                  onChange={(event) => updateRow(row.id, { clientContactPhone: event.currentTarget.value })}
                  placeholder="Client-side phone number"
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Fee">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.fee}
                  onChange={(event) => updateRow(row.id, { fee: Number(event.currentTarget.value) })}
                  required
                />
              </Field>
              <Field label="Paid in advance">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amountPaid}
                  onChange={(event) => updateRow(row.id, { amountPaid: Number(event.currentTarget.value) })}
                />
              </Field>
              <Field label="Due date">
                <Input type="date" value={row.dueDate} onChange={(event) => updateRow(row.id, { dueDate: event.currentTarget.value })} required />
              </Field>
              <Field label="Priority">
                <Select value={row.priority} onChange={(event) => updateRow(row.id, { priority: event.currentTarget.value as Priority })}>
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assigned employee">
                <Select value={row.assignedEmployeeId} onChange={(event) => updateRow(row.id, { assignedEmployeeId: event.currentTarget.value })} required>
                  {employees.map((employee) => (
                    <option key={employee._id} value={employee._id}>
                      {employee.name ?? employee.email}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Recurrence">
                <Select
                  value={row.recurrenceType}
                  onChange={(event) => updateRow(row.id, { recurrenceType: event.currentTarget.value as RecurrenceType })}
                >
                  {recurrenceTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Next due date">
                <Input
                  type="date"
                  value={row.nextDueDate}
                  disabled={row.recurrenceType === "none"}
                  onChange={(event) => updateRow(row.id, { nextDueDate: event.currentTarget.value })}
                />
              </Field>
              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={row.autoCreateNextJob}
                  disabled={row.recurrenceType === "none"}
                  onChange={(event) => updateRow(row.id, { autoCreateNextJob: event.currentTarget.checked })}
                />
                Auto-create next job
              </label>
            </div>
            <Field label="Notes">
              <Textarea value={row.notes} onChange={(event) => updateRow(row.id, { notes: event.currentTarget.value })} />
            </Field>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="secondary" onClick={() => setRows((current) => [...current, createJobFormRow(services, employees, today)])}>
          <Plus className="h-4 w-4" />
          Add another job
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || services.length === 0 || employees.length === 0}>
            Create jobs
          </Button>
        </div>
      </div>
    </form>
  );
}

function createJobFormRow(services: ServiceDoc[], employees: UserDoc[], today: string): JobFormRow {
  const service = services[0];
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    jobType: service?.name ?? "",
    fee: Number(service?.defaultFee ?? 0),
    assignedEmployeeId: employees[0]?._id ?? "",
    dueDate: today,
    priority: "Medium",
    requestedBy: "",
    clientContactPhone: "",
    amountPaid: 0,
    notes: "",
    recurrenceType: "none",
    nextDueDate: "",
    autoCreateNextJob: false
  };
}

function JobOrderForm({
  target,
  employees,
  services,
  onSubmit,
  onCancel
}: {
  target: JobTarget;
  employees: UserDoc[];
  services: ServiceDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>("none");
  const today = new Date().toISOString().slice(0, 10);
  const firstService = services[0];

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        Creating for <span className="font-medium text-ink">{target.label}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job type">
          <Select name="jobType" defaultValue={firstService?.name ?? ""} required>
            {services.map((service) => (
              <option key={service._id} value={service.name}>
                {service.name}
              </option>
            ))}
            {services.length === 0 ? <option value="">No services available</option> : null}
          </Select>
        </Field>
        <Field label="Assigned employee">
          <Select name="assignedEmployeeId" defaultValue={employees[0]?._id ?? ""} required>
            {employees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {employee.name ?? employee.email}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Fee">
          <Input name="fee" type="number" min="0" step="0.01" defaultValue={firstService?.defaultFee ?? 0} required />
        </Field>
        <Field label="Paid in advance">
          <Input name="amountPaid" type="number" min="0" step="0.01" defaultValue={0} />
        </Field>
        <Field label="Due date">
          <Input name="dueDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue="Medium" required>
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested by">
          <Input name="requestedBy" placeholder="Owner, accountant, store employee, or contact name" />
        </Field>
        <Field label="Requester phone">
          <Input name="clientContactPhone" placeholder="Client-side phone number" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Recurrence">
          <Select
            name="recurrenceType"
            value={recurrenceType}
            onChange={(event) => setRecurrenceType(event.currentTarget.value as RecurrenceType)}
          >
            {recurrenceTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next due date">
          <Input name="nextDueDate" type="date" disabled={recurrenceType === "none"} />
        </Field>
        <label className="flex items-center gap-2 pt-7 text-sm font-medium text-ink">
          <input name="autoCreateNextJob" type="checkbox" disabled={recurrenceType === "none"} defaultChecked />
          Auto-create next job
        </label>
      </div>

      <Field label="Notes">
        <Textarea name="notes" />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={employees.length === 0 || services.length === 0}>
          Create job
        </Button>
      </div>
    </form>
  );
}

function AssignEmployeeForm({
  selectedCount,
  employees,
  onSubmit,
  onCancel
}: {
  selectedCount: number;
  employees: UserDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        Assigning {selectedCount} client{selectedCount === 1 ? "" : "s"}
      </div>
      <Field label="Team member">
        <Select name="assignedTeamMemberId" defaultValue={employees[0]?._id ?? ""} required>
          {employees.map((employee) => (
            <option key={employee._id} value={employee._id}>
              {employee.name ?? employee.email}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={employees.length === 0}>
          Assign
        </Button>
      </div>
    </form>
  );
}

function MessageForm({
  selectedCount,
  kind,
  onSubmit,
  onCancel
}: {
  selectedCount: number;
  kind: "email";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        Sending {kind} to {selectedCount} client{selectedCount === 1 ? "" : "s"}
      </div>
      <Field label="Subject">
        <Input name="subject" defaultValue="Center Business Services update" required />
      </Field>
      <Field label="Message">
        <Textarea name="message" defaultValue="Hello, we are following up from Center Business Services." required />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Send</Button>
      </div>
    </form>
  );
}

function TagAssignmentForm({
  selectedCount,
  tags,
  onSubmit,
  onCancel
}: {
  selectedCount: number;
  tags: TagDoc[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        Tagging {selectedCount} client{selectedCount === 1 ? "" : "s"}
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium text-ink">Existing tags</span>
        <div className="flex flex-wrap gap-2">
          {tags.length > 0 ? (
            tags.map((tagItem) => (
              <label
                key={tagItem._id}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-2 py-1 text-sm text-ink"
              >
                <input name="tagIds" type="checkbox" value={tagItem._id} />
                <span>{tagItem.name}</span>
              </label>
            ))
          ) : (
            <span className="text-sm text-muted">No tags yet</span>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="New tag">
          <Input name="newTagName" placeholder="VIP" />
        </Field>
        <Field label="Color">
          <Input name="newTagColor" type="color" defaultValue="#2563eb" className="h-10 p-1" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Apply tags</Button>
      </div>
    </form>
  );
}

function ReminderForm({
  selectedCount,
  onSubmit,
  onCancel
}: {
  selectedCount: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="rounded-md border border-line bg-panel px-3 py-2 text-sm text-muted">
        Creating reminders for {selectedCount} client{selectedCount === 1 ? "" : "s"}
      </div>
      <Field label="Reminder date">
        <Input name="reminderDate" type="date" defaultValue={today} required />
      </Field>
      <Field label="Message">
        <Textarea name="message" defaultValue="Please send any missing documents when available." required />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Queue reminders</Button>
      </div>
    </form>
  );
}

function clientPayloadFromForm(data: FormData) {
  const assignedTeamMemberId = String(data.get("assignedTeamMemberId") ?? "");
  return {
    clientName: String(data.get("clientName") ?? ""),
    clientType: String(data.get("clientType") ?? "Business") as ClientType,
    businessLegalName: optionalString(data.get("businessLegalName")),
    dba: optionalString(data.get("dba")),
    businessCategory: optionalString(data.get("businessCategory")),
    businessAddress: optionalString(data.get("businessAddress")),
    mailingAddress: optionalString(data.get("mailingAddress")),
    phoneNumber: optionalString(data.get("phoneNumber")),
    email: optionalString(data.get("email")),
    ownerContactPerson: optionalString(data.get("ownerContactPerson")),
    taxId: optionalString(data.get("taxId")),
    assignedTeamMemberId: assignedTeamMemberId || null,
    balanceDue: Number(data.get("balanceDue") ?? 0),
    notes: optionalString(data.get("notes")),
    tagIds: data.getAll("tagIds").map(String)
  };
}

function optionalString(value: FormDataEntryValue | null) {
  const clean = String(value ?? "").trim();
  return clean ? clean : null;
}
