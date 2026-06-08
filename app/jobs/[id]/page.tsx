"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useParams } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { JobDetailPage } from "@/components/job-detail-page";

export default function JobRoutePage() {
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;

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
        <JobDetailPage routeId={routeId} />
      </Authenticated>
    </>
  );
}
