"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ChatTheme } from "../types.ts";
import { cn } from "../cn.ts";

const OPTIONS: Array<{ id: ChatTheme; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({
  value,
  onChange,
}: {
  value: ChatTheme;
  onChange: (theme: ChatTheme) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Color theme"
      className="flex rounded-xl bg-(--cf-bg-muted) p-0.5"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.id)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
              selected
                ? "bg-(--cf-bg-elevated) text-(--cf-fg) shadow-sm"
                : "text-(--cf-fg-subtle) hover:text-(--cf-fg)",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
