"use client";

import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { KeyRound, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Field, Input } from "./ui";

export function PasswordSettings({ forced = false }: { forced?: boolean }) {
  const changePassword = useAction(api.auth.changeOwnPassword);
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password !== String(data.get("confirmPassword") ?? "")) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }
    try {
      await changePassword({ password });
      setMessage("Password changed. Sign in again with your new password.");
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={forced ? "grid min-h-screen place-items-center px-4" : "max-w-xl"}>
      <div className="w-full rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-blue-50 text-blue-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-ink">{forced ? "Create a new password" : "Change password"}</h2>
            <p className="text-sm text-muted">
              {forced ? "Your temporary password must be replaced before using the workspace." : "Changing your password signs out existing sessions."}
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <Field label="New password">
            <Input name="password" type="password" minLength={10} required />
          </Field>
          <Field label="Confirm new password">
            <Input name="confirmPassword" type="password" minLength={10} required />
          </Field>
          <p className="text-xs text-muted">Use at least 10 characters with uppercase, lowercase, and a number.</p>
          {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
          {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-success">{message}</p> : null}
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Change password
          </Button>
        </form>
      </div>
    </section>
  );
}
