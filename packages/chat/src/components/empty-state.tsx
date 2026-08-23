"use client";

import { Sparkles } from "lucide-react";

export function EmptyState({
  title,
  body,
  suggestions,
  onPick,
}: {
  title: string;
  body: string;
  suggestions: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full flex-col justify-center gap-8 py-16">
      <div className="space-y-3">
        <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-(--cf-accent) text-(--cf-accent-fg) shadow-sm">
          <Sparkles className="size-4" aria-hidden />
        </div>
        <h2 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl">{title}</h2>
        <p className="max-w-lg text-base leading-relaxed text-(--cf-fg-muted)">{body}</p>
      </div>
      {suggestions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPick(suggestion)}
              className="rounded-2xl border border-(--cf-border) bg-(--cf-bg-elevated) px-4 py-3 text-left text-sm leading-snug text-(--cf-fg) shadow-sm transition-colors hover:border-[color-mix(in_oklch,var(--cf-accent)_35%,var(--cf-border))]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
