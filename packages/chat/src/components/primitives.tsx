"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.ts";

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-(--cf-fg-muted) transition-colors hover:bg-(--cf-bg-muted) hover:text-(--cf-fg) disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[oklch(0.2_0.02_60/0.45)] p-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-confirm-title"
        aria-describedby="cf-confirm-body"
        className="w-full max-w-sm rounded-2xl border border-(--cf-border) bg-(--cf-bg-elevated) p-5 shadow-(--cf-shadow)"
      >
        <h2 id="cf-confirm-title" className="font-heading text-base font-medium tracking-tight">
          {title}
        </h2>
        <p id="cf-confirm-body" className="mt-2 text-sm text-(--cf-fg-muted)">
          {body}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-medium hover:bg-(--cf-bg-muted)"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-(--cf-danger) px-3 py-2 text-sm font-medium text-white"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-(--cf-bg-muted) px-2.5 py-1 text-[11px] font-medium text-(--cf-fg-muted)",
        className,
      )}
    >
      {children}
    </span>
  );
}
