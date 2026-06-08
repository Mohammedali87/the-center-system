"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowLeft, LogOut, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { roleLabel } from "@/lib/format";
import { Badge, Button } from "./ui";
import { ChecksPanel } from "./checks-panel";

export function ChecksAppShell() {
  const me = useQuery(api.auth.getMe, {});
  const { signOut } = useAuthActions();

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
          <h1 className="mt-4 text-xl font-semibold text-ink">Your account cannot access check printing.</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Ask an admin to restore your access or sign in with another account.
          </p>
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
      <header className="sticky top-0 z-20 border-b border-line bg-white/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
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
              <p className="flex items-center gap-2 text-xs font-medium uppercase text-muted">
                <Printer className="h-3.5 w-3.5" />
                Separate check printing system
              </p>
              <h1 className="truncate text-xl font-semibold text-ink">Blank Check Printing</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={me.role === "owner" ? "blue" : me.role === "manager" ? "green" : "neutral"}>
              {roleLabel(me.role)}
            </Badge>
            <span className="hidden max-w-[12rem] truncate text-sm text-muted sm:block">{me.name ?? me.email}</span>
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink transition hover:bg-panel"
            >
              <ArrowLeft className="h-4 w-4" />
              Job Orders
            </Link>
            <Button type="button" variant="secondary" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 md:px-6">
        <ChecksPanel me={me} />
      </div>
    </main>
  );
}
