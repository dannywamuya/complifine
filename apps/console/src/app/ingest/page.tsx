"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STEPS = [
  { id: "registry", label: "Registry" },
  { id: "fetch", label: "Fetch" },
  { id: "parse", label: "Parse" },
  { id: "pages", label: "Pages" },
  { id: "prose", label: "Prose" },
  { id: "link", label: "Link" },
  { id: "gates", label: "Gates" },
  { id: "all", label: "Run all" },
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

export default function IngestPage() {
  const [version, setVersion] = useState("ifa-v6-smart-fv");
  const [data, setData] = useState<JobsResponse | null>(null);
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
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Pipeline</p>
        <h1 className="font-heading text-2xl font-medium">Ingest</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Stages run in a child process, the same CLIs as `bun run kb`. This page starts them and
          reads `ingestion_jobs`. It does not run the parser inside the HTTP request.
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
      <div className="flex flex-wrap items-center gap-2">
        <Select value={version} onValueChange={setVersion}>
          <SelectTrigger className="w-full min-w-0 max-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EDITIONS.map((edition) => (
              <SelectItem key={edition.value} value={edition.value}>
                {edition.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {STEPS.map((step) => (
          <Button
            key={step.id}
            variant={step.id === "all" ? "default" : "outline"}
            size="sm"
            disabled={Boolean(pending) || Boolean(data?.running)}
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
