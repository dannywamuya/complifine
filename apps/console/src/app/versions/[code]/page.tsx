import Link from "next/link";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { KbTrail } from "@/components/kb-trail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { documentFetchLabel, nextStep, STATUS_STORY } from "@/lib/kb";

export const dynamic = "force-dynamic";

interface VersionDetail {
  code: string;
  name: string;
  edition: string;
  status: string;
  allowedNext: string[];
  guidance?: { headline: string; detail: string };
  standard?: { name: string; code: string; publisher: string };
  levels: Record<string, number>;
  documents: Array<{
    slug: string;
    title: string;
    type: string;
    authority: string;
    authorityLevel?: number;
    status: string;
    pageCount: number | null;
    sourceUrl: string | null;
  }>;
}

interface GateReport {
  passed: boolean;
  blockingFailures: number;
  advisoryFailures: number;
}

interface ReviewsResponse {
  reviews: Array<{ decision: string; reviewer: string; createdAt: string }>;
}

export default async function VersionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [version, gates, reviews] = await Promise.all([
    api<VersionDetail>(`/versions/${code}`),
    api<GateReport>(`/versions/${code}/gates`).catch(() => null),
    api<ReviewsResponse>(`/versions/${code}/reviews`).catch(() => ({ reviews: [] })),
  ]);
  const lastReview = reviews.reviews[0];
  const story = version.guidance ?? STATUS_STORY[version.status];
  const step = nextStep(version.status, code);
  const standardName = version.standard?.name;
  const binding = version.documents.filter((document) => (document.authorityLevel ?? 9) <= 3);
  const guidanceDocs = version.documents.filter((document) => (document.authorityLevel ?? 9) > 3);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <KbTrail
          items={[
            { href: "/registry", label: "Catalog" },
            ...(standardName
              ? [{ href: `/registry?standard=${encodeURIComponent(version.standard!.code)}`, label: standardName }]
              : []),
            { label: version.name },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-medium">{version.name}</h1>
          <StatusBadge status={version.status} />
        </div>
        {story ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{story.headline}.</span> {story.detail}
          </p>
        ) : null}
      </div>

      {gates && !gates.passed ? (
        <Alert variant="destructive">
          <AlertTitle>{gates.blockingFailures} blocking gates failing</AlertTitle>
          <AlertDescription>
            This edition cannot be published until ingest is fixed and gates are re-run.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={step.href}>{step.label}</Link>
        </Button>
        {step.href !== `/criteria?version=${code}` ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/criteria?version=${code}`}>Browse criteria</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href={`/registry?edition=${encodeURIComponent(code)}`}>Catalog</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/gates?version=${code}`}>Gates</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/review?version=${code}`}>Review</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(version.levels).map(([level, count]) => (
          <Card key={level} size="sm">
            <CardHeader>
              <CardDescription>{level}</CardDescription>
              <CardTitle>{count}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card size="sm">
          <CardHeader>
            <CardDescription>Gates</CardDescription>
            <CardTitle className="text-base">
              {gates ? (gates.passed ? "Blocking passed" : `${gates.blockingFailures} blocking`) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {gates ? `${gates.advisoryFailures} advisory` : "Not run"}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Last review</CardDescription>
            <CardTitle className="text-base">
              {lastReview ? lastReview.decision : "None"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {lastReview
              ? `${lastReview.reviewer} · ${new Date(lastReview.createdAt).toLocaleDateString()}`
              : "Record a named decision before publish"}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sources</h2>
        <DocumentList title="Binding" documents={binding} />
        <DocumentList title="Guidance" documents={guidanceDocs} />
        {version.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources registered. Run Registry on Ingest.</p>
        ) : null}
      </section>
    </div>
  );
}

function DocumentList({
  title,
  documents,
}: {
  title: string;
  documents: VersionDetail["documents"];
}) {
  if (documents.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="divide-y divide-border rounded-xl ring-1 ring-foreground/10">
        {documents.map((document) => (
          <li key={document.slug} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm">
            {document.sourceUrl ? (
              <a href={document.sourceUrl} className="min-w-0 hover:underline" target="_blank" rel="noreferrer">
                {document.title}
              </a>
            ) : (
              <span className="min-w-0">{document.title}</span>
            )}
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{document.type}</span>
              <Badge variant="secondary">{documentFetchLabel(document.status)}</Badge>
              {document.pageCount ? <span>{document.pageCount} pp.</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
