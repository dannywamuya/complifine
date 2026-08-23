"use client";

import { BookOpen, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Citation, SearchHit } from "../types.ts";

export function SourcesRail({
  hits,
  citations,
  loading,
  criterionHref,
  onClose,
}: {
  hits: SearchHit[];
  citations: Citation[];
  loading?: boolean;
  criterionHref?: (id: string) => string;
  onClose?: () => void;
}) {
  const criterionCitations = citations.filter((citation) => citation.criterionId);
  const documentCitations = citations.filter((citation) => !citation.criterionId);
  const citedIds = new Set(criterionCitations.map((citation) => citation.criterionId));
  const extraHits = hits.filter((hit) => !hit.criterion || !citedIds.has(hit.criterion));
  const empty = hits.length === 0 && citations.length === 0 && !loading;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden" aria-label="Sources">
      <div className="flex items-center gap-2 px-4 py-3">
        <BookOpen className="size-3.5 text-(--cf-fg-muted)" aria-hidden />
        <p className="text-[11px] font-medium tracking-[0.16em] text-(--cf-fg-muted) uppercase">Sources</p>
        {onClose ? (
          <button
            type="button"
            aria-label="Close sources"
            className="ml-auto rounded-lg p-1 text-(--cf-fg-muted) hover:bg-(--cf-bg-muted) hover:text-(--cf-fg)"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {loading && hits.length === 0 ? (
          <div className="space-y-2 px-1">
            <div className="h-16 animate-pulse rounded-xl bg-(--cf-bg-muted)" />
            <div className="h-16 animate-pulse rounded-xl bg-(--cf-bg-muted)" />
          </div>
        ) : null}
        {empty ? (
          <p className="px-1 text-sm text-(--cf-fg-muted)">
            Retrieved passages and cited criteria will appear here.
          </p>
        ) : null}

        {criterionCitations.length > 0 ? (
          <Group label="Cited criteria">
            {criterionCitations.map((citation) => {
              const href = citation.criterionId ? criterionHref?.(citation.criterionId) : undefined;
              const inner = (
                <>
                  <p className="font-mono text-[13px] font-medium">{citation.criterionId}</p>
                  {citation.raw !== citation.criterionId ? (
                    <p className="text-xs text-(--cf-fg-muted)">{citation.raw}</p>
                  ) : null}
                </>
              );
              return href ? (
                <a key={citation.raw} href={href} className="block rounded-xl px-3 py-2 text-sm hover:bg-(--cf-bg-muted)">
                  {inner}
                </a>
              ) : (
                <div key={citation.raw} className="rounded-xl px-3 py-2 text-sm">
                  {inner}
                </div>
              );
            })}
          </Group>
        ) : null}

        {documentCitations.length > 0 ? (
          <Group label="Documents">
            {documentCitations.map((citation) => (
              <p key={citation.raw} className="rounded-xl px-3 py-2 text-sm">
                {citation.raw}
              </p>
            ))}
          </Group>
        ) : null}

        {(extraHits.length > 0 || (hits.length > 0 && citations.length === 0)) ? (
          <Group label={citations.length > 0 ? "Also retrieved" : "Passages"}>
            {(citations.length > 0 ? extraHits : hits).map((hit, index) => (
              <SourceHit key={`${hit.criterion}-${index}`} hit={hit} criterionHref={criterionHref} />
            ))}
          </Group>
        ) : null}
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <p className="px-3 pb-1 text-[10px] font-medium tracking-[0.14em] text-(--cf-fg-subtle) uppercase">{label}</p>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function SourceHit({
  hit,
  criterionHref,
}: {
  hit: SearchHit;
  criterionHref?: (id: string) => string;
}) {
  const href = hit.criterion ? criterionHref?.(hit.criterion) : undefined;
  const body = (
    <>
      <p className="font-mono text-[13px] font-medium">{hit.criterion ?? hit.heading}</p>
      <p className="text-xs text-(--cf-fg-muted)">
        {[hit.level, hit.edition, hit.page ? `p.${hit.page}` : null].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-(--cf-fg-muted)">{hit.text}</p>
    </>
  );
  return href ? (
    <a href={href} className="block rounded-xl px-3 py-2 hover:bg-(--cf-bg-muted)">
      {body}
    </a>
  ) : (
    <div className="rounded-xl px-3 py-2">{body}</div>
  );
}
