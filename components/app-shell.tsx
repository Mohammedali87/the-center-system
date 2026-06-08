"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  BriefcaseBusiness,
  Building2,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  Wrench,
  UsersRound
} from "lucide-react";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/format";
import { userCan } from "@/lib/permissions";
import { Badge, Button, cn } from "./ui";
import { DashboardOverview } from "./dashboard-overview";
import { ClientsPanel } from "./clients-panel";
import { JobsPanel } from "./jobs-panel";
import { PaymentsPanel } from "./payments-panel";
import { ServicesPanel } from "./services-panel";
import { TeamPanel } from "./team-panel";
import { ReportsPanel } from "./reports-panel";
import { NotificationCenter } from "./notification-center";
import { PasswordSettings } from "./password-settings";

type Tab = "dashboard" | "clients" | "jobs" | "payments" | "reports" | "services" | "team" | "settings";

const nav = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "clients", label: "Clients", icon: Building2 },
  { key: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "reports", label: "Reports", icon: BarChart3 },
  { key: "services", label: "Services", icon: Wrench },
  { key: "team", label: "Team", icon: UsersRound },
  { key: "settings", label: "Settings", icon: Settings }
] as const;

const navPermissions: Record<Tab, Parameters<typeof userCan>[1] | null> = {
  dashboard: "jobs.view",
  clients: "clients.view",
  jobs: "jobs.view",
  payments: "payments.view",
  reports: "reports.view",
  services: "settings.manage_services",
  team: "team.view",
  settings: null
};

export function AppShell() {
  const me = useQuery(api.auth.getMe, {});
  const touchLastLogin = useMutation(api.auth.touchLastLogin);
  const { signOut } = useAuthActions();
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (me?._id) {
      void touchLastLogin({});
    }
  }, [me?._id, touchLastLogin]);

  const availableNav = useMemo(() => {
    return nav.filter((item) => navPermissions[item.key] === null || userCan(me, navPermissions[item.key]!));
  }, [me]);

  const activeTab = availableNav.some((item) => item.key === tab) ? tab : availableNav[0]?.key ?? "dashboard";

  if (me === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand" />
      </main>
    );
  }

  if (!me || me.isActive === false || me.accessStatus === "suspended" || me.accessStatus === "removed") {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft">
          <Badge tone="red">Access unavailable</Badge>
          <h1 className="mt-4 text-xl font-semibold text-ink">Your account cannot access this workspace.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ask an owner to restore your team access or sign in with another account.
          </p>
          <Button type="button" className="mt-5" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </section>
      </main>
    );
  }

  if (me.mustChangePassword) {
    return <PasswordSettings forced />;
  }

  if (availableNav.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft">
          <Badge tone="amber">No permissions</Badge>
          <h1 className="mt-4 text-xl font-semibold text-ink">Your account does not have any workspace pages enabled.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">Ask an admin to update your permissions.</p>
          <Button type="button" className="mt-5" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-line bg-white px-4 py-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-md border border-line bg-white px-2">
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
              <p className="truncate text-sm font-semibold text-ink">Center Business Services</p>
              <p className="truncate text-xs text-muted">Internal workspace</p>
            </div>
          </div>

          <nav className="mt-6 grid grid-cols-2 gap-1 lg:grid-cols-1">
            {availableNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setTab(item.key)}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition",
                    active ? "bg-ink text-white" : "text-muted hover:bg-panel hover:text-ink"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-line bg-white/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-muted">Business Services Office</p>
                <h1 className="text-xl font-semibold text-ink">
                  {nav.find((item) => item.key === activeTab)?.label ?? "Dashboard"}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <NotificationCenter />
                <Badge tone={me?.role === "owner" ? "blue" : me?.role === "manager" ? "green" : "neutral"}>
                  {roleLabel(me?.role)}
                </Badge>
                <span className="hidden max-w-[12rem] truncate text-sm text-muted sm:block">
                  {me?.name ?? me?.email}
                </span>
                <Button type="button" variant="secondary" onClick={() => void signOut()}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          <div className="px-4 py-5 md:px-6">
            {activeTab === "dashboard" ? <DashboardOverview /> : null}
            {activeTab === "clients" ? <ClientsPanel me={me} /> : null}
            {activeTab === "jobs" ? <JobsPanel me={me} /> : null}
            {activeTab === "payments" ? <PaymentsPanel me={me} /> : null}
            {activeTab === "reports" ? <ReportsPanel me={me} /> : null}
            {activeTab === "services" ? <ServicesPanel me={me} /> : null}
            {activeTab === "team" ? <TeamPanel me={me} /> : null}
            {activeTab === "settings" ? <PasswordSettings /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
