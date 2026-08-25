import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { RefreshGatesButton } from "@/components/refresh-gates-button";
import { KbTrail } from "@/components/kb-trail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gates" };

interface GateReport {
  passed: boolean;
  blockingFailures: number;
  advisoryFailures: number;
  results: Array<{
    gate: string;
    description: string;
    blocking: boolean;
    passed: boolean;
    expected: string | null;
    actual: string | null;
    failures?: unknown[];
  }>;
}

interface VersionsResponse {
  versions: Array<{ code: string; name: string }>;
}

export default async function GatesPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string }>;
}) {
  const params = await searchParams;
  const scope = await certScopeFromCookie();
  const qs = scopeQuery(scope);
  const catalog = await api<VersionsResponse>(`/versions${qs ? `?${qs}` : ""}`);
  const version = params.version ?? catalog.versions[0]?.code;
  if (!version) {
    return (
      <div id="tour-gates" className="w-fit max-w-full space-y-2">
        <h1 className="font-heading text-2xl font-medium">Quality gates</h1>
        <p className="text-sm text-muted-foreground">No versions in the current certification filter.</p>
      </div>
    );
  }

  const report = await api<GateReport>(`/versions/${version}/gates`);

  const current = catalog.versions.find((item) => item.code === version);

  return (
    <div className="space-y-6">
      <div id="tour-gates" className="w-fit max-w-3xl space-y-2">
        <KbTrail
          items={[
            { href: "/registry", label: "Catalog" },
            { href: `/registry?edition=${encodeURIComponent(version)}`, label: current?.name ?? version },
            { label: "Gates" },
          ]}
        />
        <h1 className="font-heading text-2xl font-medium">Quality gates</h1>
        <p className="text-sm text-muted-foreground">
          Numbers the publisher stated independently of our parse. This edition cannot be published
          while a blocking gate fails.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {report.passed ? (
            <Badge>all blocking passed</Badge>
          ) : (
            <Badge variant="destructive">{report.blockingFailures} blocking failures</Badge>
          )}
          {report.advisoryFailures > 0 ? (
            <Badge variant="outline">{report.advisoryFailures} advisory</Badge>
          ) : null}
        </div>
      </div>
      {!report.passed ? (
        <Alert variant="destructive">
          <AlertTitle>Publishing is blocked</AlertTitle>
          <AlertDescription>
            Fix ingest (re-parse) rather than editing rows, then re-run.{" "}
            <Link href={`/review?version=${version}`} className="underline underline-offset-4">
              Go to review
            </Link>{" "}
            only after blocking gates pass.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2" method="get">
          <select
            name="version"
            defaultValue={version}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            {catalog.versions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Show
          </Button>
        </form>
        <RefreshGatesButton version={version} />
        <Button asChild variant="outline" size="sm">
          <Link href={`/registry?edition=${encodeURIComponent(version)}`}>Catalog</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Gate</TableHead>
            <TableHead className="w-[16%]">Result</TableHead>
            <TableHead className="w-[22%]">Expected</TableHead>
            <TableHead className="w-[22%]">Actual</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.results.map((row) => (
            <TableRow key={row.gate}>
              <TableCell>
                <div className="font-medium">{row.gate}</div>
                <div className="text-xs text-muted-foreground">{row.description}</div>
              </TableCell>
              <TableCell>
                <Badge variant={row.passed ? "secondary" : row.blocking ? "destructive" : "outline"}>
                  {row.passed ? "pass" : row.blocking ? "fail" : "advisory"}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs break-all">{row.expected}</TableCell>
              <TableCell className="font-mono text-xs break-all">{row.actual}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
