"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  CheckCircle2,
  Cloud,
  DatabaseZap,
  FileCheck2,
  Gauge,
  History,
  KeyRound,
  LockKeyhole,
  Play,
  RefreshCcw,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  WifiOff,
  Workflow,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";

type Mode = "standalone" | "network" | "cloud";
type Stream = "migration" | "ledger" | "payroll" | "security";

type Stage = {
  label: string;
  detail: string;
  icon: LucideIcon;
};

type WorkItem = {
  client: string;
  stream: Stream;
  status: "ready" | "review" | "blocked";
  volume: string;
  signal: string;
  confidence: number;
  owner: string;
};

const stages: Stage[] = [
  { label: "Verify package", detail: "Signature, hash, origin, version", icon: ShieldCheck },
  { label: "Map data", detail: "Clients, ledgers, payroll, exports", icon: DatabaseZap },
  { label: "Run conversion", detail: "Schema, references, balances", icon: Workflow },
  { label: "AI review", detail: "Outliers, duplicate vendors, stale rates", icon: Bot },
  { label: "Secure sync", detail: "MFA, audit trail, device policy", icon: LockKeyhole },
  { label: "Go-live", detail: "Cutover queue and rollback point", icon: CheckCircle2 }
];

const workItems: WorkItem[] = [
  {
    client: "Center Demo Books",
    stream: "ledger",
    status: "ready",
    volume: "4,821 rows",
    signal: "Balances match",
    confidence: 98,
    owner: "Ops"
  },
  {
    client: "Northline Payroll",
    stream: "payroll",
    status: "review",
    volume: "126 checks",
    signal: "Withholding table changed",
    confidence: 84,
    owner: "Payroll"
  },
  {
    client: "Oak Ledger Co.",
    stream: "migration",
    status: "ready",
    volume: "18 services",
    signal: "Service catalog mapped",
    confidence: 96,
    owner: "Manager"
  },
  {
    client: "Pine Ridge Files",
    stream: "security",
    status: "blocked",
    volume: "3 devices",
    signal: "Legacy workstation missing MFA",
    confidence: 71,
    owner: "Admin"
  },
  {
    client: "Bluewater Exports",
    stream: "ledger",
    status: "review",
    volume: "9 exports",
    signal: "Duplicate vendor aliases",
    confidence: 79,
    owner: "AI"
  }
];

const modeCopy: Record<Mode, { label: string; metric: string; badge: string }> = {
  standalone: { label: "Standalone", metric: "1 workstation", badge: "Local-first" },
  network: { label: "Network", metric: "1 server, 8 seats", badge: "Office pilot" },
  cloud: { label: "Cloud pilot", metric: "Realtime sync", badge: "Modern stack" }
};

const streamLabels: Record<Stream, string> = {
  migration: "Migration",
  ledger: "Ledger",
  payroll: "Payroll",
  security: "Security"
};

function statusClasses(status: WorkItem["status"]) {
  if (status === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "review") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function Toggle({
  icon: Icon,
  label,
  checked,
  onChange
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition",
        checked ? "border-blue-200 bg-blue-50 text-ink" : "border-line bg-white text-muted hover:bg-panel"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", checked ? "text-brand" : "text-muted")} />
        <span className="truncate text-sm font-medium">{label}</span>
      </span>
      <span
        className={cn(
          "flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition",
          checked ? "justify-end border-blue-300 bg-brand" : "justify-start border-line bg-slate-100"
        )}
      >
        <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
      </span>
    </button>
  );
}

export default function SimulatorPage() {
  const [mode, setMode] = useState<Mode>("network");
  const [stream, setStream] = useState<Stream>("migration");
  const [stageIndex, setStageIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [aiReview, setAiReview] = useState(true);
  const [cloudSync, setCloudSync] = useState(true);
  const [zeroTrust, setZeroTrust] = useState(true);
  const [apiBridge, setApiBridge] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [threshold, setThreshold] = useState(82);

  useEffect(() => {
    if (!running) return undefined;

    const timer = window.setInterval(() => {
      setStageIndex((current) => {
        if (current >= stages.length - 1) {
          setRunning(false);
          return current;
        }
        return current + 1;
      });
    }, 950);

    return () => window.clearInterval(timer);
  }, [running]);

  const filteredItems = useMemo(() => workItems.filter((item) => item.stream === stream), [stream]);

  const readiness = useMemo(() => {
    const techLift = [aiReview, cloudSync, zeroTrust, apiBridge].filter(Boolean).length * 4;
    const offlineLift = offlineMode ? 3 : 0;
    const modeLift = mode === "cloud" ? 7 : mode === "network" ? 4 : 1;
    const stageLift = stageIndex * 5;
    return Math.min(99, 58 + techLift + offlineLift + modeLift + stageLift);
  }, [aiReview, apiBridge, cloudSync, mode, offlineMode, stageIndex, zeroTrust]);

  const flaggedCount = useMemo(
    () => workItems.filter((item) => item.status !== "ready" || item.confidence < threshold).length,
    [threshold]
  );

  const activeStage = stages[stageIndex];
  const progress = Math.round(((stageIndex + 1) / stages.length) * 100);
  const ActiveIcon = activeStage.icon;

  return (
    <main className="min-h-screen bg-[#f5f7fa] text-ink">
      <div className="grid min-h-screen xl:grid-cols-[280px_1fr]">
        <aside className="border-b border-line bg-white px-4 py-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink text-white">
              <ServerCog className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">CAS Modernization</h1>
              <p className="truncate text-xs text-muted">Simulation console</p>
            </div>
          </div>

          <div className="mt-6 grid gap-2">
            {(Object.keys(streamLabels) as Stream[]).map((key) => {
              const selected = key === stream;
              const count = workItems.filter((item) => item.stream === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStream(key)}
                  className={cn(
                    "flex h-10 items-center justify-between gap-3 rounded-md px-3 text-sm font-medium transition",
                    selected ? "bg-ink text-white" : "text-muted hover:bg-panel hover:text-ink"
                  )}
                >
                  <span className="truncate">{streamLabels[key]}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-xs",
                      selected ? "bg-white/15 text-white" : "bg-panel text-muted"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-lg border border-line bg-panel p-3">
            <p className="text-xs font-medium uppercase text-muted">Package Signal</p>
            <dl className="mt-3 grid gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Signature</dt>
                <dd className="font-medium text-success">Valid</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Version</dt>
                <dd className="font-medium">24.7.0.0</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Source</dt>
                <dd className="font-medium">CCH SFS</dd>
              </div>
            </dl>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-line bg-white/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted">Modern stack pilot</p>
                <h2 className="truncate text-xl font-semibold">Operational Simulator</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-line bg-panel p-1">
                  {(Object.keys(modeCopy) as Mode[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMode(key)}
                      className={cn(
                        "h-8 rounded-md px-3 text-xs font-medium transition",
                        mode === key ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
                      )}
                    >
                      {modeCopy[key].label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Reset simulation"
                  title="Reset simulation"
                  onClick={() => {
                    setStageIndex(0);
                    setRunning(false);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:bg-panel hover:text-ink"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRunning(true)}
                  disabled={running || stageIndex === stages.length - 1}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-ink px-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Run
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 px-4 py-5 md:px-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="grid gap-4">
              <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand">
                      <ActiveIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase text-muted">{modeCopy[mode].badge}</p>
                      <h3 className="truncate text-lg font-semibold">{activeStage.label}</h3>
                      <p className="truncate text-sm text-muted">{activeStage.detail}</p>
                    </div>
                  </div>
                  <div className="grid min-w-44 gap-1 text-right">
                    <span className="text-2xl font-semibold">{readiness}%</span>
                    <span className="text-xs font-medium text-muted">Readiness</span>
                  </div>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
                </div>

                <div className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {stages.map((stage, index) => {
                    const Icon = stage.icon;
                    const complete = index < stageIndex;
                    const active = index === stageIndex;
                    return (
                      <button
                        key={stage.label}
                        type="button"
                        onClick={() => {
                          setStageIndex(index);
                          setRunning(false);
                        }}
                        className={cn(
                          "grid min-h-28 gap-2 rounded-lg border px-3 py-3 text-left transition",
                          active && "border-blue-200 bg-blue-50",
                          complete && "border-emerald-200 bg-emerald-50",
                          !active && !complete && "border-line bg-panel hover:bg-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            active && "text-brand",
                            complete && "text-success",
                            !active && !complete && "text-muted"
                          )}
                        />
                        <span className="text-sm font-semibold leading-5">{stage.label}</span>
                        <span className="text-xs leading-5 text-muted">{stage.detail}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <section className="rounded-lg border border-line bg-white shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                      <h3 className="text-base font-semibold">{streamLabels[stream]} Queue</h3>
                      <p className="text-xs text-muted">{modeCopy[mode].metric}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-warning">
                      <TriangleAlert className="h-3.5 w-3.5" />
                      {flaggedCount} flagged
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                      <thead className="bg-panel text-xs uppercase text-muted">
                        <tr>
                          <th className="px-4 py-3 font-medium">Client</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Volume</th>
                          <th className="px-4 py-3 font-medium">Signal</th>
                          <th className="px-4 py-3 font-medium">Owner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item) => (
                          <tr key={item.client} className="border-t border-line">
                            <td className="px-4 py-3 font-medium">{item.client}</td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                                  statusClasses(item.status)
                                )}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted">{item.volume}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {item.confidence >= threshold ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                ) : (
                                  <XCircle className="h-4 w-4 shrink-0 text-danger" />
                                )}
                                <span>{item.signal}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted">{item.owner}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">AI Review</h3>
                      <p className="text-xs text-muted">Confidence threshold</p>
                    </div>
                    <span className="text-xl font-semibold">{threshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="70"
                    max="99"
                    value={threshold}
                    onChange={(event) => setThreshold(Number(event.target.value))}
                    className="mt-5 w-full accent-blue-600"
                  />
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-line bg-panel px-2 py-3">
                      <p className="text-xl font-semibold">{workItems.length}</p>
                      <p className="text-xs text-muted">Items</p>
                    </div>
                    <div className="rounded-lg border border-line bg-panel px-2 py-3">
                      <p className="text-xl font-semibold">{flaggedCount}</p>
                      <p className="text-xs text-muted">Flags</p>
                    </div>
                    <div className="rounded-lg border border-line bg-panel px-2 py-3">
                      <p className="text-xl font-semibold">{progress}%</p>
                      <p className="text-xs text-muted">Run</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <History className="h-4 w-4 shrink-0 text-muted" />
                        Rollback point
                      </span>
                      <span className="font-medium">Ready</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 truncate">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-muted" />
                        Export bridge
                      </span>
                      <span className={cn("font-medium", apiBridge ? "text-success" : "text-warning")}>
                        {apiBridge ? "Live" : "Paused"}
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            </section>

            <aside className="grid content-start gap-4">
              <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Tech Stack</h3>
                    <p className="text-xs text-muted">Modernization switches</p>
                  </div>
                  <SlidersHorizontal className="h-5 w-5 text-muted" />
                </div>
                <div className="mt-4 grid gap-2">
                  <Toggle icon={Bot} label="AI anomaly review" checked={aiReview} onChange={setAiReview} />
                  <Toggle icon={Cloud} label="Cloud sync layer" checked={cloudSync} onChange={setCloudSync} />
                  <Toggle icon={KeyRound} label="Zero-trust access" checked={zeroTrust} onChange={setZeroTrust} />
                  <Toggle icon={ArrowDownToLine} label="API export bridge" checked={apiBridge} onChange={setApiBridge} />
                  <Toggle icon={WifiOff} label="Offline fallback" checked={offlineMode} onChange={setOfflineMode} />
                </div>
              </section>

              <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">Topology</h3>
                  <Gauge className="h-5 w-5 text-muted" />
                </div>
                <div className="mt-4 grid gap-3">
                  {[
                    { label: "Legacy package", value: "CASPatch 24.7", icon: ServerCog },
                    { label: "Conversion bus", value: "Schema mapper", icon: Workflow },
                    { label: "Realtime store", value: cloudSync ? "Cloud enabled" : "Local queue", icon: DatabaseZap },
                    { label: "Review layer", value: aiReview ? "AI assisted" : "Manual", icon: Activity }
                  ].map((node) => {
                    const Icon = node.icon;
                    return (
                      <div key={node.label} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-brand">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{node.label}</p>
                          <p className="truncate text-xs text-muted">{node.value}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
