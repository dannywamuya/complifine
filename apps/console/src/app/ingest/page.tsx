"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { VersionSelect, useScopedVersionState } from "@/components/version-select";
import { KbTrail } from "@/components/kb-trail";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STEPS = [
  { id: "registry", label: "Registry", hint: "Sync the checked-in manifest: new certs and editions appear here." },
  { id: "fetch", label: "Fetch", hint: "Download declared source files." },
  { id: "parse", label: "Parse", hint: "Extract criteria and structure from PDFs and workbooks." },
  { id: "pages", label: "Pages", hint: "Build the page map used for citations." },
  { id: "prose", label: "Prose", hint: "Chunk text for search." },
  { id: "link", label: "Link", hint: "Cross-edition relationships." },
  { id: "gates", label: "Gates", hint: "Publisher-independent counts. Blocking failures stop publish." },
  { id: "all", label: "Run all", hint: "Registry through gates for the selected edition (registry is global)." },
] as const;

interface Job {
  id: string;
  stage: string;
  status: string;
  versionCode: string | null;
  durationMs: number | null;
  startedAt: string | null;
  error: string | null;
}

interface JobsResponse {
  running: { kind: string; command: string; pid: number } | null;
  jobs: Job[];
}

interface VersionDetail {
  status: string;
  name: string;
  guidance?: { headline: string; detail: string };
}

function recommendedStep(status: string | undefined): string {
  switch (status) {
    case "draft":
      return "registry";
    case "ingesting":
      return "fetch";
    case "extracted":
    case "validation":
      return "gates";
    default:
      return "all";
  }
}

function IngestForm() {
  const searchParams = useSearchParams();
  const [version, setVersion] = useScopedVersionState(searchParams.get("version") ?? undefined);
  const [data, setData] = useState<JobsResponse | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<JobsResponse>("/jobs?limit=30"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!version) return;
    api<VersionDetail>(`/versions/${version}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [version, data?.running]);

  const suggested = recommendedStep(detail?.status);

  async function start(step: string, extra?: { force?: boolean; index?: boolean }) {
    setPending(step);
    setError(null);
    try {
      if (extra?.index) {
        await api("/index", { method: "POST", body: JSON.stringify({ force: extra.force }) });
      } else {
        await api("/ingest", {
          method: "POST",
          body: JSON.stringify({
            step,
            version: step === "all" || step === "registry" ? undefined : version,
            force: extra?.force,
          }),
        });
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div id="tour-ingest" className="w-fit max-w-3xl space-y-2">
        <KbTrail
          items={[
            { href: "/registry", label: "Catalog" },
            ...(detail
              ? [{ href: `/registry?edition=${encodeURIComponent(version)}`, label: detail.name }]
              : []),
            { label: "Ingest" },
          ]}
        />
        <h1 className="font-heading text-2xl font-medium">Ingest</h1>
        <p className="text-sm text-muted-foreground">
          Future standards are registered from the checked-in manifest, then fetched and parsed.
          Open the{" "}
          <Link href="/registry" className="underline underline-offset-4">
            catalog
          </Link>{" "}
          to see certifications, editions, and sources. This page starts the same CLIs as `bun run kb`.
          It does not publish — that stays on Review.
        </p>
      </div>
      {data?.running ? (
        <Alert>
          <AlertTitle>Running</AlertTitle>
          <AlertDescription className="font-mono text-xs">{data.running.command}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not start</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {detail ? (
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              Selected edition
              <StatusBadge status={detail.status} />
            </CardDescription>
            <CardTitle>{detail.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{detail.guidance?.detail ?? "Run Registry first if this edition is new."}</p>
            <p>
              Suggested next stage:{" "}
              <span className="font-medium text-foreground">
                {STEPS.find((step) => step.id === suggested)?.label}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <VersionSelect value={version} onValueChange={setVersion} />
        <Button asChild variant="outline" size="sm">
          <Link href={version ? `/registry?edition=${encodeURIComponent(version)}` : "/registry"}>
            Catalog
          </Link>
        </Button>
        {STEPS.map((step) => (
          <Button
            key={step.id}
            variant={step.id === suggested || step.id === "all" ? "default" : "outline"}
            size="sm"
            disabled={Boolean(pending) || Boolean(data?.running)}
            title={step.hint}
            onClick={() => void start(step.id)}
          >
            {pending === step.id ? "Starting…" : step.label}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(pending) || Boolean(data?.running)}
          onClick={() => void start("index", { index: true })}
        >
          Embed
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(pending) || Boolean(data?.running)}
          onClick={() => void start("fetch", { force: true })}
        >
          Fetch --force
        </Button>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.filter((step) => step.id !== "all").map((step, index) => (
          <li key={step.id} className="rounded-xl p-3 text-sm ring-1 ring-foreground/10">
            <p className="font-mono text-xs text-muted-foreground">{index + 1}</p>
            <p className="font-medium">{step.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{step.hint}</p>
          </li>
        ))}
      </ol>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[16%]">Stage</TableHead>
            <TableHead className="w-[14%]">Status</TableHead>
            <TableHead className="w-[22%]">Version</TableHead>
            <TableHead className="w-[14%]">Duration</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.jobs ?? []).map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <Link className="font-mono text-sm hover:underline" href={`/jobs/${job.id}`}>
                  {job.stage}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
                  {job.status}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {job.versionCode ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {job.durationMs != null ? `${job.durationMs}ms` : "—"}
              </TableCell>
              <TableCell className="text-destructive">{job.error}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function IngestPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading ingest…</p>}>
      <IngestForm />
    </Suspense>
  );
}
