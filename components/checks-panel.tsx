"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  XCircle
} from "lucide-react";
import { api } from "@/lib/api";
import { dateShort } from "@/lib/format";
import type {
  CheckBatchPreview,
  CheckDateOption,
  CheckDoc,
  CheckStatus,
  CheckTemplateDoc,
  CheckTemplateLayout,
  ClientBankAccountDoc,
  ClientDoc,
  Id,
  UserDoc
} from "@/lib/types";
import { Badge, Button, EmptyState, Field, Input, Select, Textarea, cn } from "./ui";

type ChecksTab = "print" | "accounts" | "templates" | "register" | "batches" | "audit" | "reports";
type Outcome = "printed" | "spoiled" | "notPrinted";

const checksTabs: Array<{ key: ChecksTab; label: string; icon: typeof Printer }> = [
  { key: "print", label: "Print", icon: Printer },
  { key: "accounts", label: "Accounts", icon: Banknote },
  { key: "templates", label: "Templates", icon: SlidersHorizontal },
  { key: "register", label: "Register", icon: ClipboardList },
  { key: "batches", label: "Batches", icon: History },
  { key: "audit", label: "Audit", icon: ShieldCheck },
  { key: "reports", label: "Reports", icon: FileText }
];

const statusOptions: CheckStatus[] = ["reserved", "printed", "spoiled", "voided", "reprinted", "cancelled"];

const layoutFields: Array<{ key: keyof CheckTemplateLayout; label: string }> = [
  { key: "businessName", label: "Business name" },
  { key: "businessAddress", label: "Business address" },
  { key: "bankName", label: "Bank name" },
  { key: "checkNumber", label: "Check number" },
  { key: "date", label: "Date" },
  { key: "payeeLine", label: "Payee line" },
  { key: "amountBox", label: "Amount box" },
  { key: "amountWordsLine", label: "Amount words" },
  { key: "memoLine", label: "Memo line" },
  { key: "signatureLine", label: "Signature line" },
  { key: "micrLine", label: "MICR line" },
  { key: "logo", label: "Logo" }
];

export function ChecksPanel({ me }: { me: UserDoc | null }) {
  const clients = useQuery(api.clients.list, { archived: false, search: "" });
  const [tab, setTab] = useState<ChecksTab>("print");
  const [selectedClientId, setSelectedClientId] = useState<Id>("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<Id>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<Id>("");
  const [batchId, setBatchId] = useState<Id>("");
  const [startNumberInput, setStartNumberInput] = useState("");
  const [quantity, setQuantity] = useState(10);
  const [dateOption, setDateOption] = useState<CheckDateOption>("blank");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<number, { outcome: Outcome; reason: string }>>({});
  const [registerStatus, setRegisterStatus] = useState<CheckStatus | "all">("all");

  const effectiveClientId = selectedClientId || clients?.[0]?._id || "";
  const bankAccounts = useQuery(
    api.checks.listBankAccounts,
    effectiveClientId ? { clientId: effectiveClientId, includeInactive: true } : "skip"
  );
  const firstBankAccount = bankAccounts?.find((account) => account.status === "active") ?? bankAccounts?.[0] ?? null;
  const effectiveBankAccountId =
    bankAccounts?.some((account) => account._id === selectedBankAccountId) === true
      ? selectedBankAccountId
      : firstBankAccount?._id ?? "";
  const templates = useQuery(
    api.checks.listTemplates,
    effectiveBankAccountId ? { bankAccountId: effectiveBankAccountId, includeInactive: true } : "skip"
  );
  const firstTemplate = templates?.find((template) => template.isDefault) ?? templates?.[0] ?? null;
  const effectiveTemplateId =
    templates?.some((template) => template._id === selectedTemplateId) === true
      ? selectedTemplateId
      : firstTemplate?._id ?? "";
  const preview = useQuery(api.checks.getBatchPreview, batchId ? { batchId } : "skip");
  const register = useQuery(
    api.checks.listRegister,
    effectiveBankAccountId
      ? {
          bankAccountId: effectiveBankAccountId,
          status: registerStatus === "all" ? undefined : registerStatus
        }
      : "skip"
  );
  const batches = useQuery(
    api.checks.listBatches,
    effectiveBankAccountId ? { bankAccountId: effectiveBankAccountId } : "skip"
  );
  const auditLogs = useQuery(
    api.checks.listAuditLogs,
    effectiveBankAccountId ? { bankAccountId: effectiveBankAccountId } : "skip"
  );
  const gaps = useQuery(
    api.checks.sequenceGapReport,
    effectiveBankAccountId ? { bankAccountId: effectiveBankAccountId } : "skip"
  );

  const reserveBatch = useMutation(api.checks.reserveBlankCheckBatch);
  const confirmAllPrinted = useMutation(api.checks.confirmBatchAllPrinted);
  const resolveBatch = useMutation(api.checks.resolveBatchAfterPrint);
  const cancelBatch = useMutation(api.checks.cancelBatch);
  const createBankAccount = useMutation(api.checks.createBankAccount);
  const updateTemplate = useMutation(api.checks.updateTemplate);
  const reprintCheck = useMutation(api.checks.reprintCheck);
  const voidCheck = useMutation(api.checks.voidCheck);

  const selectedClient = useMemo(
    () => clients?.find((client) => client._id === effectiveClientId) ?? null,
    [clients, effectiveClientId]
  );
  const selectedBankAccount = useMemo(
    () => bankAccounts?.find((account) => account._id === effectiveBankAccountId) ?? null,
    [bankAccounts, effectiveBankAccountId]
  );
  const selectedTemplate = useMemo(
    () => templates?.find((template) => template._id === effectiveTemplateId) ?? null,
    [templates, effectiveTemplateId]
  );
  const canAdmin = me?.role === "owner";
  const canFinalize = me?.role === "owner" || me?.role === "manager";
  const canPrepare = me?.role !== "viewer";

  async function submitPrintBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!effectiveClientId || !effectiveBankAccountId || !effectiveTemplateId) return;
    setError("");
    setMessage("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const result = await reserveBatch({
        clientId: effectiveClientId,
        bankAccountId: effectiveBankAccountId,
        templateId: effectiveTemplateId,
        startingCheckNumber: startNumber,
        quantity,
        dateOption,
        checkDate: String(data.get("checkDate") ?? ""),
        paperStockType: String(data.get("paperStockType") ?? "Letter check stock"),
        memoText: String(data.get("memoText") ?? ""),
        signatureImageEnabled: data.get("signatureImageEnabled") === "on",
        alignmentOffsetX: numberFrom(data, "alignmentOffsetX"),
        alignmentOffsetY: numberFrom(data, "alignmentOffsetY"),
        gapReason: String(data.get("gapReason") ?? ""),
        overrideReason: String(data.get("overrideReason") ?? ""),
        notes: String(data.get("notes") ?? "")
      });
      setBatchId(result.batchId);
      setOutcomes({});
      setMessage("Batch reserved for preview.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reserve check batch.");
    } finally {
      setPending(false);
    }
  }

  async function submitBankAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClient) return;
    setError("");
    setMessage("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const id = await createBankAccount({
        clientId: selectedClient._id,
        bankName: String(data.get("bankName") ?? ""),
        accountNickname: String(data.get("accountNickname") ?? ""),
        printBusinessName: String(data.get("printBusinessName") ?? ""),
        printBusinessAddress: String(data.get("printBusinessAddress") ?? ""),
        startingCheckNumber: numberFrom(data, "startingCheckNumber"),
        routingNumber: String(data.get("routingNumber") ?? ""),
        accountNumber: String(data.get("accountNumber") ?? ""),
        micrEnabled: data.get("micrEnabled") === "on",
        signatureLineLabel: String(data.get("signatureLineLabel") ?? ""),
        logoUrl: String(data.get("logoUrl") ?? ""),
        signatureImageUrl: String(data.get("signatureImageUrl") ?? ""),
        signatureImageAuthorized: data.get("signatureImageAuthorized") === "on",
        notes: String(data.get("notes") ?? "")
      });
      setSelectedBankAccountId(id);
      setMessage("Bank account created with a standard check template.");
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create bank account.");
    } finally {
      setPending(false);
    }
  }

  async function submitTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTemplate) return;
    setError("");
    setMessage("");
    setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      await updateTemplate({
        templateId: selectedTemplate._id,
        clientId: selectedTemplate.clientId ?? null,
        bankAccountId: selectedTemplate.bankAccountId ?? null,
        name: String(data.get("name") ?? ""),
        paperSize: String(data.get("paperSize") ?? "Letter") as CheckTemplateDoc["paperSize"],
        customWidthIn: nullableNumberFrom(data, "customWidthIn"),
        customHeightIn: nullableNumberFrom(data, "customHeightIn"),
        checkPosition: String(data.get("checkPosition") ?? "top") as CheckTemplateDoc["checkPosition"],
        checksPerPage: numberFrom(data, "checksPerPage"),
        marginTop: numberFrom(data, "marginTop"),
        marginRight: numberFrom(data, "marginRight"),
        marginBottom: numberFrom(data, "marginBottom"),
        marginLeft: numberFrom(data, "marginLeft"),
        fontSize: numberFrom(data, "fontSize"),
        alignmentOffsetX: numberFrom(data, "alignmentOffsetX"),
        alignmentOffsetY: numberFrom(data, "alignmentOffsetY"),
        layout: readLayout(data, selectedTemplate.layout),
        isDefault: data.get("isDefault") === "on",
        isActive: data.get("isActive") === "on"
      });
      setMessage("Template saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save template.");
    } finally {
      setPending(false);
    }
  }

  async function markAllPrinted() {
    if (!batchId) return;
    setError("");
    setPending(true);
    try {
      const result = await confirmAllPrinted({ batchId });
      setMessage(`Printed batch recorded. Next check number is ${result.nextCheckNumber}.`);
      setBatchId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to confirm print batch.");
    } finally {
      setPending(false);
    }
  }

  async function submitOutcomes() {
    if (!batchId || !preview) return;
    setError("");
    setPending(true);
    try {
      const result = await resolveBatch({
        batchId,
        outcomes: preview.checks.map((check) => ({
          checkNumber: check.checkNumber,
          outcome: outcomes[check.checkNumber]?.outcome ?? "printed",
          reason: outcomes[check.checkNumber]?.reason ?? ""
        })),
        notes: "Mixed print outcome recorded from print confirmation."
      });
      setMessage(
        `Recorded ${result.printed} printed, ${result.spoiled} spoiled, ${result.notPrinted} not printed. Next check number is ${result.nextCheckNumber}.`
      );
      setBatchId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save print outcomes.");
    } finally {
      setPending(false);
    }
  }

  async function cancelReservedBatch() {
    if (!batchId) return;
    const reason = window.prompt("Reason for cancelling this print attempt");
    if (!reason) return;
    setError("");
    setPending(true);
    try {
      await cancelBatch({ batchId, reason });
      setMessage("Print attempt cancelled. Reserved check numbers are available again.");
      setBatchId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel batch.");
    } finally {
      setPending(false);
    }
  }

  async function reprint(checkId: Id) {
    const reason = window.prompt("Admin reprint reason");
    if (!reason) return;
    try {
      await reprintCheck({ checkId, reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reprint check.");
    }
  }

  async function voidExistingCheck(checkId: Id) {
    const reason = window.prompt("Void reason");
    if (!reason) return;
    try {
      await voidCheck({ checkId, reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to void check.");
    }
  }

  const startNumber = Number(startNumberInput || selectedBankAccount?.nextCheckNumber || 1);
  const firstNumber = startNumber;
  const lastNumber = startNumber + Math.max(1, quantity) - 1;
  const createsGap = selectedBankAccount ? startNumber > selectedBankAccount.nextCheckNumber : false;
  const overlapsSequence = selectedBankAccount ? startNumber < selectedBankAccount.nextCheckNumber : false;

  if (!clients) {
    return <div className="h-64 animate-pulse rounded-lg border border-line bg-white" />;
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Blank check printing</h2>
          <p className="text-sm text-muted">Business check stock, sequence control, register, and audit trail.</p>
        </div>
        <div className="grid min-w-[18rem] grid-cols-2 gap-2">
          <Select
            value={effectiveClientId}
            onChange={(event) => {
              setSelectedClientId(event.target.value);
              setSelectedBankAccountId("");
              setSelectedTemplateId("");
              setStartNumberInput("");
              setBatchId("");
              setOutcomes({});
            }}
          >
            {clients.map((client) => (
              <option key={client._id} value={client._id}>
                {client.clientName}
              </option>
            ))}
          </Select>
          <Select
            value={effectiveBankAccountId}
            onChange={(event) => {
              setSelectedBankAccountId(event.target.value);
              setSelectedTemplateId("");
              setStartNumberInput("");
              setBatchId("");
              setOutcomes({});
            }}
          >
            {(bankAccounts ?? []).map((account) => (
              <option key={account._id} value={account._id}>
                {account.accountNickname}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
        {checksTabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium",
                tab === item.key ? "bg-ink text-white" : "text-muted hover:bg-panel hover:text-ink"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-success">{message}</div> : null}

      {tab === "print" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(560px,1.2fr)]">
          <form onSubmit={submitPrintBatch} className="grid gap-4 rounded-lg border border-line bg-white p-4">
            <SummaryPanel client={selectedClient} bankAccount={selectedBankAccount} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Template">
                <Select value={effectiveTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} required>
                  {(templates ?? []).map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Paper/check stock">
                <Input name="paperStockType" defaultValue={selectedTemplate?.paperSize ?? "Letter"} required />
              </Field>
              <Field label="Starting check number">
                <Input
                  type="number"
                  min={1}
                  value={startNumberInput || String(selectedBankAccount?.nextCheckNumber ?? 1)}
                  onChange={(event) => setStartNumberInput(event.target.value)}
                  required
                />
              </Field>
              <Field label="Quantity">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  required
                />
              </Field>
              <Field label="Date option">
                <Select value={dateOption} onChange={(event) => setDateOption(event.target.value as CheckDateOption)}>
                  <option value="blank">Leave blank</option>
                  <option value="today">Use today</option>
                  <option value="custom">Custom date</option>
                </Select>
              </Field>
              <Field label="Custom date">
                <Input name="checkDate" type="date" disabled={dateOption !== "custom"} />
              </Field>
              <Field label="X alignment offset">
                <Input name="alignmentOffsetX" type="number" step="0.01" defaultValue={selectedTemplate?.alignmentOffsetX ?? 0} />
              </Field>
              <Field label="Y alignment offset">
                <Input name="alignmentOffsetY" type="number" step="0.01" defaultValue={selectedTemplate?.alignmentOffsetY ?? 0} />
              </Field>
            </div>
            <Field label="Optional memo">
              <Input name="memoText" placeholder="Blank unless entered" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input name="signatureImageEnabled" type="checkbox" disabled={!selectedBankAccount?.signatureImageAuthorized} />
              Print authorized signature image
            </label>
            {createsGap ? (
              <Field label="Gap reason">
                <Textarea name="gapReason" required placeholder={`Missing ${selectedBankAccount?.nextCheckNumber}-${startNumber - 1}`} />
              </Field>
            ) : null}
            {overlapsSequence ? (
              <Field label="Admin override reason">
                <Textarea name="overrideReason" required disabled={!canAdmin} />
              </Field>
            ) : null}
            <Field label="Notes">
              <Textarea name="notes" />
            </Field>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warning">
              Confirm that check stock is loaded correctly before printing.
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Badge tone={createsGap || overlapsSequence ? "amber" : "green"}>
                {firstNumber}-{lastNumber}
              </Badge>
              <Button type="submit" disabled={!canPrepare || pending || !effectiveBankAccountId || !effectiveTemplateId}>
                <Printer className="h-4 w-4" />
                Preview batch
              </Button>
            </div>
          </form>

          <PreviewPanel
            preview={preview}
            outcomes={outcomes}
            setOutcomes={setOutcomes}
            canFinalize={canFinalize}
            pending={pending}
            onPrint={() => window.print()}
            onAllPrinted={() => void markAllPrinted()}
            onSubmitOutcomes={() => void submitOutcomes()}
            onCancel={() => void cancelReservedBatch()}
          />
        </section>
      ) : null}

      {tab === "accounts" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(560px,1.2fr)]">
          <section className="rounded-lg border border-line bg-white p-4">
            <h3 className="text-sm font-semibold text-ink">Client/business</h3>
            {selectedClient ? (
              <div className="mt-3 grid gap-2 text-sm">
                <InfoRow label="Legal name" value={selectedClient.businessLegalName ?? selectedClient.clientName} />
                <InfoRow label="DBA" value={selectedClient.dba ?? "None"} />
                <InfoRow label="Business address" value={selectedClient.businessAddress ?? "Not set"} />
                <InfoRow label="Mailing address" value={selectedClient.mailingAddress ?? "Same or not set"} />
                <InfoRow label="Phone" value={selectedClient.phoneNumber ?? "Not set"} />
                <InfoRow label="Email" value={selectedClient.email ?? "Not set"} />
                <InfoRow label="Status" value={selectedClient.archived ? "Inactive" : "Active"} />
              </div>
            ) : (
              <EmptyState title="Select a client" />
            )}
          </section>

          <section className="grid gap-4">
            <section className="rounded-lg border border-line bg-white">
              <div className="border-b border-line px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">Bank accounts</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-panel text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Bank</th>
                      <th className="px-4 py-3 font-medium">Account</th>
                      <th className="px-4 py-3 font-medium">Next</th>
                      <th className="px-4 py-3 font-medium">Last printed</th>
                      <th className="px-4 py-3 font-medium">MICR</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {(bankAccounts ?? []).map((account) => (
                      <tr
                        key={account._id}
                        className={cn("cursor-pointer", account._id === effectiveBankAccountId && "bg-blue-50")}
                        onClick={() => {
                          setSelectedBankAccountId(account._id);
                          setSelectedTemplateId("");
                          setStartNumberInput("");
                          setBatchId("");
                          setOutcomes({});
                        }}
                      >
                        <td className="px-4 py-3 font-medium text-ink">{account.bankName}</td>
                        <td className="px-4 py-3 text-muted">{account.accountNickname}</td>
                        <td className="px-4 py-3 text-ink">{account.nextCheckNumber}</td>
                        <td className="px-4 py-3 text-muted">{account.lastPrintedCheckNumber ?? "None"}</td>
                        <td className="px-4 py-3">
                          <Badge tone={account.micrEnabled ? "green" : "neutral"}>{account.micrEnabled ? "Enabled" : "Off"}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={account.status === "active" ? "green" : "neutral"}>{account.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(bankAccounts ?? []).length === 0 ? <div className="p-4"><EmptyState title="No bank accounts for this client" /></div> : null}
            </section>

            {canAdmin ? (
              <form onSubmit={submitBankAccount} className="grid gap-4 rounded-lg border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">Add bank account</h3>
                  <Badge tone="blue">Admin</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Bank name">
                    <Input name="bankName" required />
                  </Field>
                  <Field label="Account nickname">
                    <Input name="accountNickname" placeholder="Operating Account" required />
                  </Field>
                  <Field label="Business name to print">
                    <Input name="printBusinessName" defaultValue={selectedClient?.businessLegalName ?? selectedClient?.clientName ?? ""} required />
                  </Field>
                  <Field label="Starting check number">
                    <Input name="startingCheckNumber" type="number" min={1} defaultValue={1001} required />
                  </Field>
                </div>
                <Field label="Business address to print">
                  <Textarea name="printBusinessAddress" defaultValue={selectedClient?.businessAddress ?? ""} required />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Routing number">
                    <Input name="routingNumber" inputMode="numeric" />
                  </Field>
                  <Field label="Account number">
                    <Input name="accountNumber" inputMode="numeric" />
                  </Field>
                  <Field label="Signature line label">
                    <Input name="signatureLineLabel" placeholder="Authorized Signature" />
                  </Field>
                  <Field label="Logo URL">
                    <Input name="logoUrl" />
                  </Field>
                  <Field label="Signature image URL">
                    <Input name="signatureImageUrl" />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-ink">
                  <label className="flex items-center gap-2">
                    <input name="micrEnabled" type="checkbox" />
                    MICR enabled
                  </label>
                  <label className="flex items-center gap-2">
                    <input name="signatureImageAuthorized" type="checkbox" />
                    Signature image authorized
                  </label>
                </div>
                <Field label="Notes">
                  <Textarea name="notes" />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit" disabled={pending || !selectedClient}>
                    <Plus className="h-4 w-4" />
                    Add account
                  </Button>
                </div>
              </form>
            ) : (
              <EmptyState title="Admin access is required to add or edit bank account sequence and MICR settings" />
            )}
          </section>
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
          <section className="rounded-lg border border-line bg-white">
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Saved templates</h3>
            </div>
            <div className="divide-y divide-line">
              {(templates ?? []).map((template) => (
                <button
                  key={template._id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template._id)}
                  className={cn(
                    "grid w-full gap-1 px-4 py-3 text-left text-sm hover:bg-panel",
                    effectiveTemplateId === template._id && "bg-blue-50"
                  )}
                >
                  <span className="font-medium text-ink">{template.name}</span>
                  <span className="text-muted">
                    {template.paperSize} / {template.checkPosition} / {template.checksPerPage} per page
                  </span>
                </button>
              ))}
            </div>
          </section>
          {selectedTemplate ? (
            <form key={selectedTemplate._id} onSubmit={submitTemplate} className="grid gap-4 rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Template alignment</h3>
                <div className="flex gap-2">
                  <Badge tone={selectedTemplate.isActive ? "green" : "neutral"}>{selectedTemplate.isActive ? "Active" : "Inactive"}</Badge>
                  {selectedTemplate.isDefault ? <Badge tone="blue">Default</Badge> : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name">
                  <Input name="name" defaultValue={selectedTemplate.name} required />
                </Field>
                <Field label="Paper size">
                  <Select name="paperSize" defaultValue={selectedTemplate.paperSize}>
                    <option value="Letter">Letter</option>
                    <option value="A4">A4</option>
                    <option value="Custom">Custom</option>
                  </Select>
                </Field>
                <Field label="Check position">
                  <Select name="checkPosition" defaultValue={selectedTemplate.checkPosition}>
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                    <option value="fullPage">Full page</option>
                  </Select>
                </Field>
                <Field label="Checks per page">
                  <Input name="checksPerPage" type="number" min={1} max={3} defaultValue={selectedTemplate.checksPerPage} />
                </Field>
                <Field label="Custom width">
                  <Input name="customWidthIn" type="number" step="0.01" defaultValue={selectedTemplate.customWidthIn ?? ""} />
                </Field>
                <Field label="Custom height">
                  <Input name="customHeightIn" type="number" step="0.01" defaultValue={selectedTemplate.customHeightIn ?? ""} />
                </Field>
                <Field label="Top margin">
                  <Input name="marginTop" type="number" step="0.01" defaultValue={selectedTemplate.marginTop} />
                </Field>
                <Field label="Right margin">
                  <Input name="marginRight" type="number" step="0.01" defaultValue={selectedTemplate.marginRight} />
                </Field>
                <Field label="Bottom margin">
                  <Input name="marginBottom" type="number" step="0.01" defaultValue={selectedTemplate.marginBottom} />
                </Field>
                <Field label="Left margin">
                  <Input name="marginLeft" type="number" step="0.01" defaultValue={selectedTemplate.marginLeft} />
                </Field>
                <Field label="Font size">
                  <Input name="fontSize" type="number" step="0.5" defaultValue={selectedTemplate.fontSize} />
                </Field>
                <Field label="Global X offset">
                  <Input name="alignmentOffsetX" type="number" step="0.01" defaultValue={selectedTemplate.alignmentOffsetX} />
                </Field>
                <Field label="Global Y offset">
                  <Input name="alignmentOffsetY" type="number" step="0.01" defaultValue={selectedTemplate.alignmentOffsetY} />
                </Field>
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-panel text-xs uppercase text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Element</th>
                      <th className="px-3 py-2 font-medium">X</th>
                      <th className="px-3 py-2 font-medium">Y</th>
                      <th className="px-3 py-2 font-medium">Width</th>
                      <th className="px-3 py-2 font-medium">Height</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {layoutFields.map((field) => {
                      const point = selectedTemplate.layout[field.key];
                      return (
                        <tr key={field.key}>
                          <td className="px-3 py-2 font-medium text-ink">{field.label}</td>
                          <td className="px-3 py-2">
                            <Input name={`${field.key}.x`} type="number" step="0.01" defaultValue={point.x} />
                          </td>
                          <td className="px-3 py-2">
                            <Input name={`${field.key}.y`} type="number" step="0.01" defaultValue={point.y} />
                          </td>
                          <td className="px-3 py-2">
                            <Input name={`${field.key}.width`} type="number" step="0.01" defaultValue={point.width ?? ""} />
                          </td>
                          <td className="px-3 py-2">
                            <Input name={`${field.key}.height`} type="number" step="0.01" defaultValue={point.height ?? ""} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-4 text-sm text-ink">
                  <label className="flex items-center gap-2">
                    <input name="isDefault" type="checkbox" defaultChecked={selectedTemplate.isDefault} />
                    Default
                  </label>
                  <label className="flex items-center gap-2">
                    <input name="isActive" type="checkbox" defaultChecked={selectedTemplate.isActive} />
                    Active
                  </label>
                </div>
                <Button type="submit" disabled={!canFinalize || pending}>
                  <Save className="h-4 w-4" />
                  Save template
                </Button>
              </div>
            </form>
          ) : (
            <EmptyState title="Select a bank account template" />
          )}
        </section>
      ) : null}

      {tab === "register" ? (
        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">Check register</h3>
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted" />
              <Select value={registerStatus} onChange={(event) => setRegisterStatus(event.target.value as CheckStatus | "all")}>
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <CheckRegisterTable rows={register ?? []} canAdmin={canAdmin} canFinalize={canFinalize} onReprint={reprint} onVoid={voidExistingCheck} />
        </section>
      ) : null}

      {tab === "batches" ? (
        <section className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">Batch history</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Range</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Printed/exported</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(batches ?? []).map((batch) => (
                  <tr key={batch._id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {batch.startingCheckNumber}-{batch.endingCheckNumber}
                    </td>
                    <td className="px-4 py-3 text-muted">{batch.quantity}</td>
                    <td className="px-4 py-3 text-muted">{batch.templateId.slice(-6).toUpperCase()}</td>
                    <td className="px-4 py-3">
                      <Badge tone={batch.status === "printed" ? "green" : batch.status === "cancelled" ? "red" : "amber"}>
                        {batchStatusLabel(batch.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{dateShort(batch.createdAt)}</td>
                    <td className="px-4 py-3 text-muted">{batch.printedAt ? dateShort(batch.printedAt) : "Not finalized"}</td>
                    <td className="px-4 py-3 text-muted">{batch.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(batches ?? []).length === 0 ? <div className="p-4"><EmptyState title="No check batches found" /></div> : null}
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">Audit log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-panel text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Range</th>
                  <th className="px-4 py-3 font-medium">Old value</th>
                  <th className="px-4 py-3 font-medium">New value</th>
                  <th className="px-4 py-3 font-medium">Reason/comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(auditLogs ?? []).map((log) => (
                  <tr key={log._id}>
                    <td className="px-4 py-3 text-muted">{dateShort(log.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{auditActionLabel(log.action)}</td>
                    <td className="px-4 py-3 text-muted">{rangeLabel(log.checkRangeStart, log.checkRangeEnd, log.checkNumber)}</td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-muted">{log.oldValue ?? ""}</td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-muted">{log.newValue ?? ""}</td>
                    <td className="px-4 py-3 text-muted">{log.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(auditLogs ?? []).length === 0 ? <div className="p-4"><EmptyState title="No audit entries found" /></div> : null}
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-line bg-white">
            <div className="border-b border-line px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">Sequence gap report</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-panel text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Missing check number</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(gaps ?? []).map((gap) => (
                    <tr key={gap._id}>
                      <td className="px-4 py-3 font-medium text-ink">{gap.missingCheckNumber}</td>
                      <td className="px-4 py-3 text-muted">{gap.reason ?? "No reason"}</td>
                      <td className="px-4 py-3 text-muted">{dateShort(gap.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(gaps ?? []).length === 0 ? <div className="p-4"><EmptyState title="No sequence gaps found" /></div> : null}
          </section>

          <section className="rounded-lg border border-line bg-white p-4">
            <h3 className="text-sm font-semibold text-ink">Bank account sequence</h3>
            {selectedBankAccount ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric label="Starting number" value={selectedBankAccount.startingCheckNumber} />
                <Metric label="Next available" value={selectedBankAccount.nextCheckNumber} />
                <Metric label="Last printed" value={selectedBankAccount.lastPrintedCheckNumber ?? "None"} />
                <Metric label="Printed/spoiled/voided rows" value={register?.length ?? 0} />
              </div>
            ) : (
              <EmptyState title="Select a bank account" />
            )}
          </section>
        </section>
      ) : null}
    </section>
  );
}

function SummaryPanel({ client, bankAccount }: { client: ClientDoc | null; bankAccount: ClientBankAccountDoc | null }) {
  return (
    <section className="rounded-md border border-line bg-panel p-3 text-sm">
      <div className="grid gap-2">
        <InfoRow label="Bank name" value={bankAccount?.bankName ?? "Select account"} />
        <InfoRow label="Business" value={bankAccount?.printBusinessName ?? client?.clientName ?? "Select client"} />
        <InfoRow label="Address" value={bankAccount?.printBusinessAddress ?? client?.businessAddress ?? "Not set"} />
        <InfoRow label="Last printed" value={bankAccount?.lastPrintedCheckNumber ?? "None"} />
        <InfoRow label="Next available" value={bankAccount?.nextCheckNumber ?? "None"} />
      </div>
    </section>
  );
}

function PreviewPanel({
  preview,
  outcomes,
  setOutcomes,
  canFinalize,
  pending,
  onPrint,
  onAllPrinted,
  onSubmitOutcomes,
  onCancel
}: {
  preview: CheckBatchPreview | undefined;
  outcomes: Record<number, { outcome: Outcome; reason: string }>;
  setOutcomes: (value: Record<number, { outcome: Outcome; reason: string }>) => void;
  canFinalize: boolean;
  pending: boolean;
  onPrint: () => void;
  onAllPrinted: () => void;
  onSubmitOutcomes: () => void;
  onCancel: () => void;
}) {
  if (!preview) {
    return (
      <section className="grid place-items-center rounded-lg border border-dashed border-line bg-white p-8">
        <div className="text-center">
          <Printer className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-sm font-medium text-ink">No batch preview</p>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <section className="rounded-lg border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1 text-sm">
            <h3 className="font-semibold text-ink">Print preview</h3>
            <span className="text-muted">
              {preview.batch.startingCheckNumber}-{preview.batch.endingCheckNumber} / {preview.batch.quantity} checks /{" "}
              {preview.client.clientName} / {preview.bankAccount.accountNickname}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={onPrint}>
              <Printer className="h-4 w-4" />
              Print / Save PDF
            </Button>
            <Button type="button" onClick={onAllPrinted} disabled={!canFinalize || pending}>
              <CheckCircle2 className="h-4 w-4" />
              All printed correctly
            </Button>
            <Button type="button" variant="danger" onClick={onCancel} disabled={pending}>
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Did all checks print correctly?
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Check number</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
                <th className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.checks.map((check) => {
                const row = outcomes[check.checkNumber] ?? { outcome: "printed", reason: "" };
                return (
                  <tr key={check._id}>
                    <td className="px-3 py-2 font-medium text-ink">{check.checkNumber}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={row.outcome}
                        onChange={(event) =>
                          setOutcomes({
                            ...outcomes,
                            [check.checkNumber]: { ...row, outcome: event.target.value as Outcome }
                          })
                        }
                      >
                        <option value="printed">Printed correctly</option>
                        <option value="spoiled">Spoiled / misprinted</option>
                        <option value="notPrinted">Not printed</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={row.reason}
                        onChange={(event) =>
                          setOutcomes({
                            ...outcomes,
                            [check.checkNumber]: { ...row, reason: event.target.value }
                          })
                        }
                        disabled={row.outcome !== "spoiled"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="secondary" onClick={onSubmitOutcomes} disabled={!canFinalize || pending}>
            Save mixed outcome
          </Button>
        </div>
      </section>

      <CheckDocumentPreview preview={preview} />
    </section>
  );
}

function CheckDocumentPreview({ preview }: { preview: CheckBatchPreview }) {
  const template = preview.template;
  if (!template) return <EmptyState title="Template not found" />;
  const page = pageSize(template);
  const batch = preview.batch;
  const offsetX = template.alignmentOffsetX + batch.alignmentOffsetX;
  const offsetY = template.alignmentOffsetY + batch.alignmentOffsetY;
  const displayDate = batch.dateOption === "blank" ? "" : batch.checkDate ?? "";

  return (
    <section className="check-print-root grid gap-4">
      {preview.checks.map((check) => (
        <div
          key={check._id}
          className="check-page relative overflow-hidden border border-line bg-white shadow-sm print:border-0 print:shadow-none"
          style={{ width: `${page.width}in`, height: `${page.height}in` }}
        >
          <div
            className="absolute border border-slate-300"
            style={{
              left: `${template.marginLeft}in`,
              top: `${template.marginTop}in`,
              width: `${page.width - template.marginLeft - template.marginRight}in`,
              height: `${template.checkPosition === "fullPage" ? page.height - template.marginTop - template.marginBottom : 3.5}in`,
              fontSize: `${template.fontSize}pt`
            }}
          >
            <CheckText point={template.layout.businessName} offsetX={offsetX} offsetY={offsetY} className="font-semibold">
              {preview.bankAccount.printBusinessName}
            </CheckText>
            <CheckText point={template.layout.businessAddress} offsetX={offsetX} offsetY={offsetY} className="whitespace-pre-line text-[0.85em]">
              {preview.bankAccount.printBusinessAddress}
            </CheckText>
            <CheckText point={template.layout.bankName} offsetX={offsetX} offsetY={offsetY} className="font-medium">
              {preview.bankAccount.bankName}
            </CheckText>
            <CheckText point={template.layout.checkNumber} offsetX={offsetX} offsetY={offsetY} className="text-right font-semibold">
              {check.checkNumber}
            </CheckText>
            <CheckText point={template.layout.date} offsetX={offsetX} offsetY={offsetY}>
              {displayDate}
            </CheckText>
            <CheckLine point={template.layout.payeeLine} offsetX={offsetX} offsetY={offsetY} label="Pay to the order of" />
            <CheckBox point={template.layout.amountBox} offsetX={offsetX} offsetY={offsetY} />
            <CheckLine point={template.layout.amountWordsLine} offsetX={offsetX} offsetY={offsetY} />
            <CheckLine point={template.layout.memoLine} offsetX={offsetX} offsetY={offsetY} label={batch.memoText ?? "Memo"} />
            <CheckLine point={template.layout.signatureLine} offsetX={offsetX} offsetY={offsetY} label={preview.bankAccount.signatureLineLabel ?? "Signature"} />
            {preview.bankAccount.micrEnabled ? (
              <CheckText point={template.layout.micrLine} offsetX={offsetX} offsetY={offsetY} className="text-center font-mono">
                {micrLine(preview.bankAccount, check.checkNumber)}
              </CheckText>
            ) : null}
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200" />
          </div>
        </div>
      ))}
    </section>
  );
}

function CheckText({
  point,
  offsetX,
  offsetY,
  className,
  children
}: {
  point: CheckTemplateLayout[keyof CheckTemplateLayout];
  offsetX: number;
  offsetY: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("absolute overflow-hidden text-ink", className)}
      style={{
        left: `${point.x + offsetX}in`,
        top: `${point.y + offsetY}in`,
        width: `${point.width ?? 1}in`,
        height: `${point.height ?? 0.25}in`
      }}
    >
      {children}
    </div>
  );
}

function CheckLine({
  point,
  offsetX,
  offsetY,
  label
}: {
  point: CheckTemplateLayout[keyof CheckTemplateLayout];
  offsetX: number;
  offsetY: number;
  label?: string;
}) {
  return (
    <div
      className="absolute border-b border-ink text-[0.72em] text-muted"
      style={{
        left: `${point.x + offsetX}in`,
        top: `${point.y + offsetY}in`,
        width: `${point.width ?? 2}in`,
        height: `${point.height ?? 0.2}in`
      }}
    >
      {label}
    </div>
  );
}

function CheckBox({
  point,
  offsetX,
  offsetY
}: {
  point: CheckTemplateLayout[keyof CheckTemplateLayout];
  offsetX: number;
  offsetY: number;
}) {
  return (
    <div
      className="absolute border border-ink"
      style={{
        left: `${point.x + offsetX}in`,
        top: `${point.y + offsetY}in`,
        width: `${point.width ?? 1.3}in`,
        height: `${point.height ?? 0.35}in`
      }}
    />
  );
}

function CheckRegisterTable({
  rows,
  canAdmin,
  canFinalize,
  onReprint,
  onVoid
}: {
  rows: CheckDoc[];
  canAdmin: boolean;
  canFinalize: boolean;
  onReprint: (checkId: Id) => void;
  onVoid: (checkId: Id) => void;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="bg-panel text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Client/business</th>
              <th className="px-4 py-3 font-medium">Bank account</th>
              <th className="px-4 py-3 font-medium">Check #</th>
              <th className="px-4 py-3 font-medium">Batch</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Print date</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Reprints</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row._id}>
                <td className="px-4 py-3 font-medium text-ink">{row.client?.clientName ?? row.clientId.slice(-6)}</td>
                <td className="px-4 py-3 text-muted">{row.bankAccount?.accountNickname ?? row.bankAccountId.slice(-6)}</td>
                <td className="px-4 py-3 font-semibold text-ink">{row.checkNumber}</td>
                <td className="px-4 py-3 text-muted">{row.batchId ? row.batchId.slice(-6).toUpperCase() : ""}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                </td>
                <td className="px-4 py-3 text-muted">{row.printDate ? dateShort(row.printDate) : ""}</td>
                <td className="px-4 py-3 text-muted">{row.spoiledVoidReason ?? ""}</td>
                <td className="px-4 py-3 text-muted">{row.reprintCount}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {canFinalize && row.status !== "reserved" && row.status !== "voided" ? (
                      <Button type="button" variant="secondary" onClick={() => onVoid(row._id)}>
                        Void
                      </Button>
                    ) : null}
                    {canAdmin && (row.status === "printed" || row.status === "reprinted") ? (
                      <Button type="button" variant="secondary" onClick={() => onReprint(row._id)}>
                        <RotateCcw className="h-4 w-4" />
                        Reprint
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="p-4"><EmptyState title="No checks found" /></div> : null}
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function numberFrom(data: FormData, key: string) {
  const value = Number(data.get(key));
  return Number.isFinite(value) ? value : 0;
}

function nullableNumberFrom(data: FormData, key: string) {
  const raw = String(data.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readLayout(data: FormData, fallback: CheckTemplateLayout): CheckTemplateLayout {
  const next = { ...fallback } as CheckTemplateLayout;
  for (const field of layoutFields) {
    const current = fallback[field.key];
    next[field.key] = {
      x: nullableNumberFrom(data, `${field.key}.x`) ?? current.x,
      y: nullableNumberFrom(data, `${field.key}.y`) ?? current.y,
      width: nullableNumberFrom(data, `${field.key}.width`) ?? current.width,
      height: nullableNumberFrom(data, `${field.key}.height`) ?? current.height
    };
  }
  return next;
}

function pageSize(template: CheckTemplateDoc) {
  if (template.paperSize === "A4") return { width: 8.27, height: 11.69 };
  if (template.paperSize === "Custom") {
    return { width: template.customWidthIn ?? 8.5, height: template.customHeightIn ?? 11 };
  }
  return { width: 8.5, height: 11 };
}

function micrLine(account: ClientBankAccountDoc, checkNumber: number) {
  if (!account.canViewSensitive) return "MICR hidden";
  const routing = account.routingNumberMasked ?? "";
  const accountNumber = account.accountNumberMasked ?? "";
  if (!routing || !accountNumber) return "";
  return `C${checkNumber}C A${routing}A ${accountNumber}C`;
}

function statusLabel(status: string) {
  if (status === "partiallyCompleted") return "Partially completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function batchStatusLabel(status: string) {
  return statusLabel(status);
}

function statusTone(status: string): "neutral" | "blue" | "green" | "amber" | "red" {
  if (status === "printed" || status === "reprinted") return "green";
  if (status === "reserved") return "blue";
  if (status === "spoiled") return "amber";
  if (status === "voided" || status === "cancelled") return "red";
  return "neutral";
}

function auditActionLabel(action: string) {
  return action.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function rangeLabel(start?: number | null, end?: number | null, checkNumber?: number | null) {
  if (checkNumber) return String(checkNumber);
  if (start && end) return start === end ? String(start) : `${start}-${end}`;
  return "";
}
