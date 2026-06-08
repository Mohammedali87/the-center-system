"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AuthPanel } from "@/components/auth-panel";
import { ChecksAppShell } from "@/components/checks-app-shell";

export default function ChecksPage() {
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
        <ChecksAppShell />
      </Authenticated>
    </>
  );
}
