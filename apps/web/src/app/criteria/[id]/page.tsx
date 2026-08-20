import { api } from "@/lib/api";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

interface Detail {
  requirements: Array<{
    criterion: string;
    level: string;
    principle: string;
    criteria: string | null;
    page: number | null;
    naExempt: boolean;
    edition: string;
    editionName: string;
    section: string | null;
    sectionNumber: string | null;
    document: string | null;
    sourceUrl: string | null;
  }>;
}

export default async function CriterionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const data = await api<Detail>(`/requirements/${encodeURIComponent(decoded)}`);

  return (
    <PageShell className="space-y-10">
      {data.requirements.map((row) => (
        <article key={row.edition} className="max-w-2xl space-y-4">
          <p className="text-sm text-muted-foreground">
            {row.editionName}
            {row.sectionNumber ? ` · ${row.sectionNumber} ${row.section ?? ""}` : ""}
            {row.page ? ` · p.${row.page}` : ""}
          </p>
          <h1 className="font-mono text-2xl font-medium tracking-tight">{row.criterion}</h1>
          <div className="flex flex-wrap gap-1.5">
            <LevelBadge level={row.level} />
            {row.naExempt ? <Badge variant="secondary">NA exempt</Badge> : null}
          </div>
          <div>
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">Principle</h2>
            <p className="leading-relaxed">{row.principle}</p>
          </div>
          {row.criteria ? (
            <div>
              <h2 className="mb-1 text-sm font-medium text-muted-foreground">Criteria</h2>
              <p className="leading-relaxed">{row.criteria}</p>
            </div>
          ) : null}
          {row.document ? (
            <>
              <Separator />
              <p className="text-sm text-muted-foreground">
                Source:{" "}
                {row.sourceUrl ? (
                  <a href={row.sourceUrl} className="underline underline-offset-4" target="_blank" rel="noreferrer">
                    {row.document}
                  </a>
                ) : (
                  row.document
                )}
              </p>
            </>
          ) : null}
        </article>
      ))}
    </PageShell>
  );
}
