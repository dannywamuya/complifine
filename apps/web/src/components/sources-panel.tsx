import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { LevelBadge } from "@/components/level-badge";
import type { Citation, SearchHit } from "@/lib/chat";
import { EDITIONS } from "@/lib/editions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SourcesPanel({
  hits,
  citations,
  loading,
}: {
  hits: SearchHit[];
  citations: Citation[];
  loading?: boolean;
}) {
  const criterionCitations = citations.filter((citation) => citation.criterionId);
  const documentCitations = citations.filter((citation) => !citation.criterionId);
  const citedIds = new Set(criterionCitations.map((citation) => citation.criterionId));
  const extraHits = hits.filter(
    (hit) => !hit.criterion || !citedIds.has(hit.criterion),
  );

  const empty = hits.length === 0 && citations.length === 0 && !loading;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden border-border lg:border-l">
      <div className="flex items-center gap-2 px-4 py-3">
        <BookOpen className="size-3.5 text-muted-foreground" />
        <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Sources
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {loading && hits.length === 0 ? (
          <div className="space-y-2 px-1">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : null}
        {empty ? (
          <p className="px-1 text-sm text-muted-foreground">
            Retrieved passages and cited criteria will appear here.
          </p>
        ) : null}

        {criterionCitations.length > 0 ? (
          <Group label="Cited criteria">
            {criterionCitations.map((citation) => (
              <Link
                key={citation.raw}
                href={`/app/criteria/${encodeURIComponent(citation.criterionId!)}`}
                className="block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-card"
              >
                <p className="font-mono text-[13px] font-medium">{citation.criterionId}</p>
                {citation.raw !== citation.criterionId ? (
                  <p className="text-xs text-muted-foreground">{citation.raw}</p>
                ) : null}
              </Link>
            ))}
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

        {extraHits.length > 0 && citations.length > 0 ? (
          <Group label="Also retrieved">
            {extraHits.map((hit, index) => (
              <SourceHit key={`${hit.criterion}-${index}`} hit={hit} />
            ))}
          </Group>
        ) : null}

        {hits.length > 0 && citations.length === 0 ? (
          <Group label="From the documents">
            {hits.map((hit, index) => (
              <SourceHit key={`${hit.criterion}-${index}`} hit={hit} />
            ))}
          </Group>
        ) : null}
      </div>
    </aside>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <p className="px-3 pb-1 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SourceHit({ hit }: { hit: SearchHit }) {
  const edition = EDITIONS.find((item) => item.value === hit.edition)?.label ?? hit.edition;
  const title = hit.criterion ?? hit.heading ?? hit.document;
  const inner = (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5 text-sm",
        hit.criterion && "transition-colors hover:bg-card",
      )}
    >
      <p className="flex flex-wrap items-center gap-1.5">
        <span className={hit.criterion ? "font-mono font-medium" : "font-medium"}>{title}</span>
        {hit.level ? <LevelBadge level={hit.level} /> : null}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {edition}
        {hit.page ? ` · p.${hit.page}` : ""}
      </p>
      <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
        {hit.text}
      </p>
    </div>
  );

  if (hit.criterion) {
    return (
      <Link href={`/app/criteria/${encodeURIComponent(hit.criterion)}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
