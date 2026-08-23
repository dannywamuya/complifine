"use client";

import { WifiOff } from "lucide-react";

export function OfflineBanner({ show, message }: { show: boolean; message?: string | null }) {
  if (!show && !message) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-(--cf-border) bg-(--cf-danger-soft) px-4 py-2 text-sm text-(--cf-danger)"
    >
      {show ? <WifiOff className="size-3.5 shrink-0" aria-hidden /> : null}
      <span>{show ? "You are offline. Messages will send when the connection returns." : message}</span>
    </div>
  );
}
