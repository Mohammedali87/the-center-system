"use client";

import { clsx } from "clsx";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";

export function cn(...values: Parameters<typeof clsx>) {
  return clsx(...values);
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-ink text-white hover:bg-black",
        variant === "secondary" && "border border-line bg-white text-ink hover:bg-panel",
        variant === "ghost" && "text-muted hover:bg-panel hover:text-ink",
        variant === "danger" && "bg-danger text-white hover:bg-red-700",
        className
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:bg-panel hover:text-ink",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm placeholder:text-slate-400",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm placeholder:text-slate-400",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  className
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5 text-sm font-medium text-ink", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-line bg-panel text-muted",
        tone === "blue" && "border-blue-200 bg-blue-50 text-blue-700",
        tone === "green" && "border-emerald-200 bg-emerald-50 text-success",
        tone === "amber" && "border-amber-200 bg-amber-50 text-warning",
        tone === "red" && "border-red-200 bg-red-50 text-danger"
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  title,
  children,
  onClose
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border border-line bg-white shadow-soft">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel px-4 py-10 text-center text-sm text-muted">
      {title}
    </div>
  );
}

export type SortDirection = "asc" | "desc";

export function SortHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
  align = "left"
}: {
  label: string;
  column: string;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (column: string) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === column;
  const Icon = active ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "inline-flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs font-semibold uppercase transition hover:text-ink",
        active ? "bg-blue-50 text-blue-700" : "text-muted",
        align === "right" ? "justify-end" : "justify-start"
      )}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
