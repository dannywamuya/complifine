"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "../cn.ts";
import type { SelectOption } from "../types.ts";

export function MenuSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cn(
          "inline-flex h-8 max-w-48 min-w-0 items-center gap-1 rounded-full px-2.5 text-xs text-(--cf-fg-muted) outline-none select-none",
          "hover:bg-(--cf-bg-muted) hover:text-(--cf-fg)",
          "focus-visible:shadow-(--cf-focus) data-[state=open]:bg-(--cf-bg-muted) data-[state=open]:text-(--cf-fg)",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&>span]:min-w-0 [&>span]:truncate",
          className,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "cf-chat z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border border-(--cf-border) bg-(--cf-bg-elevated) text-(--cf-fg) shadow-(--cf-shadow)",
            "origin-(--radix-select-content-transform-origin) data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-default items-center rounded-lg py-1.5 pr-8 pl-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-[highlighted]:bg-(--cf-accent-soft) data-[highlighted]:text-(--cf-accent)"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex size-4 items-center justify-center text-(--cf-accent)">
                  <Check className="size-3.5" aria-hidden />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
