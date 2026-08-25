"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn.ts";

export type EmptyFeature = {
  title: string;
  body: string;
  icon: ReactNode;
};

export function EmptyState({
  greeting,
  title,
  body,
  features,
}: {
  greeting?: string;
  title: string;
  body: string;
  features?: EmptyFeature[];
}) {
  return (
    <div className="flex w-full flex-col gap-10 sm:gap-12">
      <div className="space-y-2">
        {greeting ? <p className="cf-empty-greeting text-sm text-(--cf-fg-muted)">{greeting}</p> : null}
        <h2 className="cf-empty-title font-heading text-3xl font-medium tracking-tight text-balance sm:text-[2.125rem]">
          {title}
        </h2>
        {body ? <p className="cf-empty-body max-w-lg text-base leading-relaxed text-(--cf-fg-muted)">{body}</p> : null}
      </div>
      {features && features.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {features.map((feature, index) => (
            <li key={feature.title} className={`cf-feature-card cf-feature-card-${(index % 4) + 1}`}>
              <span className="mb-3 inline-flex size-8 items-center justify-center rounded-lg bg-(--cf-bg-elevated)/80 text-(--cf-accent-text) shadow-sm">
                {feature.icon}
              </span>
              <p className="font-heading text-sm font-medium tracking-tight">{feature.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-(--cf-fg-muted)">{feature.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SuggestionPills({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (value: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [fadeRight, setFadeRight] = useState(false);
  const [fadeLeft, setFadeLeft] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const node: HTMLDivElement = scroller;

    function update() {
      setFadeLeft(node.scrollLeft > 8);
      setFadeRight(node.scrollWidth - node.scrollLeft - node.clientWidth > 8);
    }

    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [suggestions]);

  if (suggestions.length === 0) return null;

  return (
    <div className="cf-empty-suggestions relative mb-3">
      <div ref={scrollerRef} className="cf-suggestion-scroller">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="shrink-0 rounded-full border border-(--cf-border) bg-(--cf-bg-elevated) px-3.5 py-2 text-sm whitespace-nowrap text-(--cf-fg) shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition-colors hover:border-[color-mix(in_srgb,var(--cf-accent)_35%,var(--cf-border))] hover:bg-[color-mix(in_srgb,var(--cf-accent)_6%,var(--cf-bg-elevated))]"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <div
        className={cn("cf-suggestion-fade cf-suggestion-fade-left", fadeLeft ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
      <div
        className={cn("cf-suggestion-fade cf-suggestion-fade-right", fadeRight ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
    </div>
  );
}
