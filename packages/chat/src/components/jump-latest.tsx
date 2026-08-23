"use client";

import { ArrowDown } from "lucide-react";

export function JumpLatest({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-(--cf-border) bg-(--cf-bg-elevated) px-3 py-1.5 text-xs font-medium shadow-(--cf-shadow)"
    >
      <ArrowDown className="size-3.5" aria-hidden />
      Jump to latest
    </button>
  );
}
