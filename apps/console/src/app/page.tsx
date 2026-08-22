import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

interface Status {
  ai: { credentials: boolean; embeddings: Array<{ model: string; vectors: number }> };
  versions: Array<{
    code: string;
    name: string;
    edition: string;
    status: string;
    standardCode: string;
    standardName: string;
    criteria: number;
    documents: number;
    fetched: number;
  }>;
}

interface JobsResponse {
  running: { command: string; pid: number } | null;
  jobs: Array<{
    id: string;
    stage: string;
    status: string;
    durationMs: number | null;
    startedAt: string | null;
    error: string | null;
  }>;
}

interface Storage {
  files: number;
  bytes: number;
}

export default async function OverviewPage() {
  let status: Status | null = null;
  let jobs: JobsResponse | null = null;
  let storage: Storage | null = null;
  let error: string | null = null;
  const scope = await certScopeFromCookie();

  try {
    [status, jobs, storage] = await Promise.all([
      api<Status>("/status"),
      api<JobsResponse>("/jobs?limit=8"),
      api<Storage>("/storage"),
    ]);
  } catch (err) {
    error = (err as Error).message;
  }

  const versions = (status?.versions ?? []).filter(
    (version) => scope.length === 0 || scope.includes(version.standardCode),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Knowledge base</p>
        <h1 className="font-heading text-2xl font-medium">Overview</h1>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {versions.map((version) => (
          <Link key={version.code} href={`/versions/${version.code}`}>
            <Card className="h-full hover:bg-muted/30">
              <CardHeader>
                <CardDescription className="font-mono text-xs uppercase">
                  {version.standardName} · {version.edition} · {version.status}
                </CardDescription>
                <CardTitle>{version.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {version.criteria} criteria · {version.fetched}/{version.documents} documents
              </CardContent>
            </Card>
          </Link>
        ))}
        <Card>
          <CardHeader>
            <CardDescription>Embeddings</CardDescription>
            <CardTitle className="text-base">
              {status?.ai.embeddings.map((row) => `${row.model} (${row.vectors})`).join(" · ") ||
                "none"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {status?.ai.credentials ? "API key present" : "No API key"}
            {storage
              ? ` · ${storage.files} files, ${(storage.bytes / (1024 * 1024)).toFixed(1)} MB`
              : null}
          </CardContent>
        </Card>
      </div>
      {jobs?.running ? (
        <p className="text-sm">
          Running: <span className="font-mono">{jobs.running.command}</span> (pid {jobs.running.pid})
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Stage</TableHead>
            <TableHead className="w-[18%]">Status</TableHead>
            <TableHead className="w-[18%]">Duration</TableHead>
            <TableHead className="w-[28%]">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(jobs?.jobs ?? []).map((job) => (
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
              <TableCell className="text-muted-foreground">
                {job.durationMs != null ? `${job.durationMs}ms` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
