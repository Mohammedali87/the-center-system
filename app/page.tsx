"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AppShell } from "@/components/app-shell";
import { AuthPanel } from "@/components/auth-panel";

export default function Home() {
  return (
    <>
      <AuthLoading>
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-brand" />
        </main>
      </AuthLoading>
      <Unauthenticated>
        <AuthPanel />
      </Unauthenticated>
      <Authenticated>
        <AppShell />
      </Authenticated>
    </>
  );
}
