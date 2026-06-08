"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useParams } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { EmployeeDetailPage } from "@/components/employee-detail-page";

export default function EmployeeRoutePage() {
  const params = useParams<{ employeeId: string }>();
  const employeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;

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
        <EmployeeDetailPage employeeId={employeeId} />
      </Authenticated>
    </>
  );
}
