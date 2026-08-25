import Link from "next/link";
import { api } from "@/lib/api";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

export default async function AppCriterionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const data = await api<Detail>(`/requirements/${encodeURIComponent(decoded)}`);
  const first = data.requirements[0];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/app/criteria">Catalog</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{decoded}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {data.requirements.map((row) => (
        <article key={row.edition} className="space-y-5">
          <header className="space-y-2">
            <p className="text-lg text-muted-foreground">
              {row.editionName}
              {row.sectionNumber ? ` · ${row.sectionNumber} ${row.section ?? ""}` : ""}
              {row.page ? ` · p.${row.page}` : ""}
            </p>
            <h1 className="font-mono text-3xl font-medium tracking-tight">{row.criterion}</h1>
            <div className="flex flex-wrap gap-1.5">
              <LevelBadge level={row.level} />
              {row.naExempt ? (
                <Badge variant="secondary" className="rounded-full">
                  NA exempt
                </Badge>
              ) : null}
            </div>
          </header>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
            <h2 className="font-heading text-base font-medium tracking-tight">Principle</h2>
            <p className="mt-1 text-sm text-muted-foreground">What the standard states at the principle level.</p>
            <p className="mt-4 leading-relaxed">{row.principle}</p>
          </section>

          {row.criteria ? (
            <section className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_28px_rgb(0_0_0/0.04)]">
              <h2 className="font-heading text-base font-medium tracking-tight">Criteria</h2>
              <p className="mt-1 text-sm text-muted-foreground">The auditable wording.</p>
              <p className="mt-4 leading-relaxed">{row.criteria}</p>
            </section>
          ) : null}

          {row.document ? (
            <p className="text-sm text-muted-foreground">
              Source:{" "}
              {row.sourceUrl ? (
                <a
                  href={row.sourceUrl}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.document}
                </a>
              ) : (
                row.document
              )}
            </p>
          ) : null}
        </article>
      ))}

      {first ? (
        <Button asChild className="w-fit rounded-full">
          <Link href="/app">Ask about {first.criterion}</Link>
        </Button>
      ) : null}
    </div>
  );
}
