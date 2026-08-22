import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-medium">Quality gates</h1>
        <p className="text-sm text-muted-foreground">No versions in the current certification filter.</p>
      </div>
    );
  }

  const report = await api<GateReport>(`/versions/${version}/gates`);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{version}</p>
        <h1 className="font-heading text-2xl font-medium">Quality gates</h1>
        <p className="mt-1">
          {report.passed ? (
            <Badge>all blocking passed</Badge>
          ) : (
            <Badge variant="destructive">{report.blockingFailures} blocking failures</Badge>
          )}
        </p>
      </div>
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
