import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { StatusBadge } from "@/components/status-badge";
import { KbInsightButton } from "@/components/kb-insight-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

interface KnowledgeHealth {
  generatedAt: string;
  running: { command: string; pid: number } | null;
  ai: { credentials: boolean; vectors: number };
  summary: {
    editions: number;
    published: number;
    inPipeline: number;
    blocked: number;
    awaitingDecision: number;
    failedJobs: number;
  };
  editions: Array<{
    code: string;
    name: string;
    status: string;
    standardCode: string;
    standardName: string;
    criteria: number;
    documents: number;
    fetched: number;
    blockingFailures: number;
    lastJob: { id: string; stage: string; status: string; error: string | null } | null;
    guidance: { headline: string; detail: string };
    href: string;
    actionLabel: string;
  }>;
  nextActions: Array<{
    code: string;
    name: string;
    status: string;
    headline: string;
    detail: string;
    href: string;
    actionLabel: string;
  }>;
  blockingGates: Array<{
    versionCode: string;
    gate: string;
    description: string;
    expected: string | null;
    actual: string | null;
  }>;
  failedJobs: Array<{
    id: string;
    stage: string;
    versionCode: string | null;
    error: string | null;
    startedAt: string | null;
  }>;
  briefing: { headline: string; paragraphs: string[] };
}

export default async function OverviewPage() {
  const scope = await certScopeFromCookie();
  let health: KnowledgeHealth | null = null;
  let error: string | null = null;

  try {
    health = await api<KnowledgeHealth>("/kb/health");
  } catch (err) {
    const message = (err as Error).message;
    if (message !== "Sign in required") error = message;
  }

  const editions = (health?.editions ?? []).filter(
    (edition) => scope.length === 0 || scope.includes(edition.standardCode),
  );
  const editionCodes = new Set(editions.map((edition) => edition.code));
  const nextActions = (health?.nextActions ?? []).filter((item) => editionCodes.has(item.code));
  const blockingGates = (health?.blockingGates ?? []).filter((item) => editionCodes.has(item.versionCode));
  const failedJobs = (health?.failedJobs ?? []).filter(
    (job) => !job.versionCode || editionCodes.has(job.versionCode),
  );
  const published = editions.filter((row) => row.status === "published").length;
  const inPipeline = editions.filter((row) =>
    ["draft", "ingesting", "extracted", "validation"].includes(row.status),
  ).length;
  const blocked = editions.filter((row) => row.blockingFailures > 0).length;
  const awaiting = editions.filter((row) => row.status === "review" || row.status === "approved").length;

  return (
    <div className="space-y-8">
      <div id="tour-overview" className="w-fit max-w-3xl space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Knowledge base
        </p>
        <h1 className="font-heading text-2xl font-medium">Dashboard</h1>
        {health ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{health.briefing.headline}</p>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load health</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {health?.running ? (
        <Alert>
          <AlertTitle>Pipeline running</AlertTitle>
          <AlertDescription className="font-mono text-xs">{health.running.command}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Published"
          value={published}
          hint="Visible to producers and the agent"
          href="/registry"
        />
        <StatCard
          label="In pipeline"
          value={inPipeline}
          hint="Registered, ingesting, or awaiting gates"
          href="/ingest"
        />
        <StatCard
          label="Blocked"
          value={blocked}
          hint="Blocking quality gates failing"
          href="/gates"
          warn={blocked > 0}
        />
        <StatCard
          label="Needs a decision"
          value={awaiting}
          hint="Review or publish — human only"
          href="/review"
        />
      </div>

      {health ? (
        <Card>
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-base">{health.briefing.headline}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {health.briefing.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              {health.ai.vectors.toLocaleString()} embedding vectors
              {health.ai.credentials ? " · API key present" : " · no API key (AI briefing disabled)"}
            </p>
            <KbInsightButton disabled={!health.ai.credentials} />
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-medium">Next actions</h2>
            <p className="text-sm text-muted-foreground">
              Publishing stays a named human decision. These are the honest next steps.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/registry">Catalog</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/ingest">New standard</Link>
            </Button>
          </div>
        </div>
        {nextActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting in this filter. Live editions are in the catalog.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {nextActions.map((item) => (
              <Card key={item.code}>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2 font-mono text-xs uppercase">
                    {item.code}
                    <StatusBadge status={item.status} />
                  </CardDescription>
                  <CardTitle>{item.headline}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                  <Button asChild size="sm">
                    <Link href={item.href}>{item.actionLabel}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-medium">Editions</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Edition</TableHead>
              <TableHead className="w-[16%]">Status</TableHead>
              <TableHead className="w-[12%]">Criteria</TableHead>
              <TableHead className="w-[14%]">Sources</TableHead>
              <TableHead>Last job</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editions.map((edition) => (
              <TableRow key={edition.code}>
                <TableCell>
                  <Link className="font-medium hover:underline" href={`/registry?edition=${encodeURIComponent(edition.code)}`}>
                    {edition.name}
                  </Link>
                  <div className="font-mono text-xs text-muted-foreground">{edition.code}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={edition.status} />
                    {edition.blockingFailures > 0 ? (
                      <Badge variant="destructive">{edition.blockingFailures} gates</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{edition.criteria}</TableCell>
                <TableCell className="text-muted-foreground">
                  {edition.fetched}/{edition.documents} on file
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {edition.lastJob ? (
                    <Link className="hover:underline" href={`/jobs/${edition.lastJob.id}`}>
                      {edition.lastJob.stage} · {edition.lastJob.status}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {blockingGates.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-medium">Blocking gates</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%]">Version</TableHead>
                <TableHead>Gate</TableHead>
                <TableHead className="w-[22%]">Expected</TableHead>
                <TableHead className="w-[22%]">Actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blockingGates.map((row) => (
                <TableRow key={`${row.versionCode}-${row.gate}`}>
                  <TableCell>
                    <Link className="font-mono text-sm hover:underline" href={`/gates?version=${row.versionCode}`}>
                      {row.versionCode}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.gate}</div>
                    <div className="text-xs text-muted-foreground">{row.description}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all">{row.expected ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs break-all">{row.actual ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {failedJobs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-medium">Failed jobs</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[16%]">Stage</TableHead>
                <TableHead className="w-[22%]">Version</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link className="font-mono text-sm hover:underline" href={`/jobs/${job.id}`}>
                      {job.stage}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{job.versionCode ?? "—"}</TableCell>
                  <TableCell className="text-destructive">{job.error}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
  warn,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="h-full hover:bg-muted/30">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className={warn && value > 0 ? "text-destructive" : undefined}>{value}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
      </Card>
    </Link>
  );
}
