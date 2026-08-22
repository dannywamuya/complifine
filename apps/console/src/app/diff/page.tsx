import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare" };

interface VersionsResponse {
  versions: Array<{ code: string; name: string; standardCode: string }>;
}

interface Relationship {
  type: string;
  origin: string;
  from: string;
  fromLevel: string;
  fromVersion: string;
  to: string;
  toLevel: string;
  toVersion: string;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const scope = await certScopeFromCookie();
  const qs = scopeQuery(scope);
  const catalog = await api<VersionsResponse>(`/versions${qs ? `?${qs}` : ""}`);
  const versions = catalog.versions;
  const from = params.from ?? versions[0]?.code;
  const to =
    params.to ??
    versions.find((version) => version.code !== from && version.standardCode === versions[0]?.standardCode)
      ?.code ??
    versions.find((version) => version.code !== from)?.code;

  if (!from || !to) {
    return (
      <div id="tour-compare" className="w-fit max-w-full space-y-2">
        <h1 className="font-heading text-2xl font-medium">Compare</h1>
        <p className="text-sm text-muted-foreground">
          Need two ingested versions in scope to compare relationships.
        </p>
      </div>
    );
  }

  const { relationships } = await api<{ relationships: Relationship[] }>(
    `/relationships?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  const escalations = relationships.filter((row) => row.fromLevel !== row.toLevel);

  return (
    <div className="space-y-6">
      <div id="tour-compare" className="w-fit max-w-full">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Correspondence
        </p>
        <h1 className="font-heading text-2xl font-medium">Compare</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stored links between two versions. Pair any ingested editions — not only Smart and GFS.
        </p>
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <select
          name="from"
          defaultValue={from}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          {versions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          name="to"
          defaultValue={to}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          {versions.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Compare
        </Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Linked pairs</CardDescription>
            <CardTitle>{relationships.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Level changes</CardDescription>
            <CardTitle>{escalations.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>From → to</CardDescription>
            <CardTitle className="text-base font-medium">
              {from} → {to}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead className="w-[18%]">Level</TableHead>
            <TableHead>To</TableHead>
            <TableHead className="w-[18%]">Level</TableHead>
            <TableHead className="w-[16%]">Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(escalations.length ? escalations : relationships.slice(0, 80)).map((row) => (
            <TableRow key={`${row.from}-${row.to}-${row.type}`}>
              <TableCell className="font-mono text-sm">{row.from}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.fromLevel}</Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">{row.to}</TableCell>
              <TableCell>
                <Badge variant="secondary">{row.toLevel}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{row.type}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
