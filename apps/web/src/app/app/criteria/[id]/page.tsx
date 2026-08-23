import Link from "next/link";
import { api } from "@/lib/api";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/app/criteria">Criteria</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">{decoded}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {data.requirements.map((row) => (
        <article key={row.edition} className="space-y-4">
          <div className="space-y-2">
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Principle</CardTitle>
              <CardDescription>What the standard states at the principle level.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed">{row.principle}</p>
            </CardContent>
          </Card>

          {row.criteria ? (
            <Card>
              <CardHeader>
                <CardTitle>Criteria</CardTitle>
                <CardDescription>The auditable wording.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="leading-relaxed">{row.criteria}</p>
              </CardContent>
            </Card>
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

      {first ? (
        <Button asChild>
          <Link href="/app/ask">Ask about {first.criterion}</Link>
        </Button>
      ) : null}
    </div>
  );
}
