import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import type { Citation, SearchHit } from "@/lib/chat";
import { EDITIONS } from "@/lib/editions";
import { cn } from "@/lib/utils";

export function SourcesPanel({
  hits,
  citations,
  loading,
  strategy,
  embedder,
  searchMs,
}: {
  hits: SearchHit[];
  citations: Citation[];
  loading?: boolean;
  strategy?: string;
  embedder?: string | null;
  searchMs?: number;
}) {
  const criterionCitations = citations.filter((citation) => citation.criterionId);
  const documentCitations = citations.filter((citation) => !citation.criterionId);
  const citedIds = new Set(criterionCitations.map((citation) => citation.criterionId));
  const extraHits = hits.filter((hit) => !hit.criterion || !citedIds.has(hit.criterion));
  const empty = hits.length === 0 && citations.length === 0 && !loading;

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden border-border lg:border-l">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="size-3.5 text-muted-foreground" />
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Retrieval
          </p>
        </div>
        {strategy ? (
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {strategy}
            {embedder ? ` · ${embedder}` : ""}
            {searchMs !== undefined ? ` · ${searchMs}ms` : ""}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {loading && hits.length === 0 ? (
          <div className="space-y-2 px-1">
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : null}
        {empty ? (
          <p className="px-1 text-sm text-muted-foreground">
            Hits, ranks and cited criteria land here after a query.
          </p>
        ) : null}

        {criterionCitations.length > 0 ? (
          <Group label="Cited">
            {criterionCitations.map((citation) => (
              <Link
                key={citation.raw}
                href={`/criteria/${encodeURIComponent(citation.criterionId!)}`}
                className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                <p className="font-mono text-[13px] font-medium">{citation.criterionId}</p>
              </Link>
            ))}
          </Group>
        ) : null}

        {documentCitations.length > 0 ? (
          <Group label="Documents">
            {documentCitations.map((citation) => (
              <p key={citation.raw} className="rounded-lg px-3 py-2 text-sm">
                {citation.raw}
              </p>
            ))}
          </Group>
        ) : null}

        {extraHits.length > 0 && citations.length > 0 ? (
          <Group label="Also retrieved">
            {extraHits.map((hit, index) => (
              <SourceHit key={`${hit.criterion}-${index}`} hit={hit} rank={index + 1} />
            ))}
          </Group>
        ) : null}

        {hits.length > 0 && citations.length === 0 ? (
          <Group label="Hits">
            {hits.map((hit, index) => (
              <SourceHit key={`${hit.criterion}-${index}`} hit={hit} rank={index + 1} />
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
      <p className="px-3 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SourceHit({ hit, rank }: { hit: SearchHit; rank: number }) {
  const edition = EDITIONS.find((item) => item.value === hit.edition)?.label ?? hit.edition;
  const title = hit.criterion ?? hit.heading ?? hit.document;
  const inner = (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 text-sm",
        hit.criterion && "transition-colors hover:bg-muted",
      )}
    >
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{rank}.</span>
        <span className={hit.criterion ? "font-mono font-medium" : "font-medium"}>{title}</span>
        {hit.level ? <LevelBadge level={hit.level} /> : null}
      </p>
      <p className="mt-1 flex flex-wrap gap-1">
        <Badge variant="outline">score {hit.score.toFixed(3)}</Badge>
        {hit.lexicalRank ? <Badge variant="secondary">lex #{hit.lexicalRank}</Badge> : null}
        {hit.semanticRank ? <Badge variant="secondary">sem #{hit.semanticRank}</Badge> : null}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {edition}
        {hit.page ? ` · p.${hit.page}` : ""}
      </p>
      <p className="mt-1 line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">
        {hit.text}
      </p>
    </div>
  );

  if (hit.criterion) {
    return (
      <Link href={`/criteria/${encodeURIComponent(hit.criterion)}`} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
