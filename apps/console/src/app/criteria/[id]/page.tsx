import { api } from "@/lib/api";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

export default async function CriterionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const data = await api<Detail>(`/requirements/${encodeURIComponent(decoded)}`);

  return (
    <div className="space-y-10">
      {data.requirements.map((row) => (
        <article key={row.edition} className="max-w-3xl space-y-3">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            {row.editionName}
            {row.sectionNumber ? ` · ${row.sectionNumber}` : ""}
            {row.page ? ` · p.${row.page}` : ""}
          </p>
          <h1 className="font-mono text-2xl font-medium">{row.criterion}</h1>
          <div className="flex gap-1.5">
            <LevelBadge level={row.level} />
            {row.naExempt ? <Badge variant="secondary">NA exempt</Badge> : null}
          </div>
          <p className="leading-relaxed">{row.principle}</p>
          {row.criteria ? (
            <>
              <Separator />
              <p className="leading-relaxed">{row.criteria}</p>
            </>
          ) : null}
        </article>
      ))}
    </div>
  );
}
