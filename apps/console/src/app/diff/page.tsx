import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { defaultComparePair } from "@/lib/kb";
import { KbTrail } from "@/components/kb-trail";
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

interface EditionDelta {
  sourceRequirementId: string;
  smartLevel: string;
  gfsLevel: string;
  levelChanged: boolean;
  escalated: boolean;
  textSimilarity: number;
  textChanged: boolean;
}

interface LiveDiff {
  matched: number;
  smartOnly: string[];
  gfsOnly: string[];
  matches?: EditionDelta[];
  escalations: EditionDelta[];
  relaxations: EditionDelta[];
  textChanges: EditionDelta[];
  identicalTexts: number;
}

function levelLabel(code: string): string {
  return code.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

interface CompareRow {
  from: string;
  fromLevel: string;
  to: string;
  toLevel: string;
  type: string;
}

function deltaType(row: EditionDelta): string {
  if (row.escalated) return "stricter";
  if (row.levelChanged) return "relaxed";
  if (row.textChanged) return "reworded";
  return "equivalent";
}

function liveTableRows(diff: LiveDiff | null): CompareRow[] {
  if (!diff) return [];
  const source = diff.matches?.length
    ? diff.matches
    : [...diff.escalations, ...diff.relaxations, ...diff.textChanges];
  const seen = new Set<string>();
  const rows: CompareRow[] = [];
  for (const row of source) {
    if (seen.has(row.sourceRequirementId)) continue;
    seen.add(row.sourceRequirementId);
    rows.push({
      from: row.sourceRequirementId,
      fromLevel: levelLabel(row.smartLevel),
      to: row.sourceRequirementId,
      toLevel: levelLabel(row.gfsLevel),
      type: deltaType(row),
    });
  }
  return rows;
}

function orient(row: Relationship, fromCode: string): Relationship {
  if (row.fromVersion === fromCode) return row;
  return {
    ...row,
    from: row.to,
    fromLevel: row.toLevel,
    fromVersion: row.toVersion,
    to: row.from,
    toLevel: row.fromLevel,
    toVersion: row.fromVersion,
  };
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
  const fallback = defaultComparePair(versions);
  const from = params.from ?? fallback.from;
  const to = params.to ?? fallback.to;
  const fromName = versions.find((version) => version.code === from)?.name ?? from;
  const toName = versions.find((version) => version.code === to)?.name ?? to;

  if (!from || !to) {
    return (
      <div id="tour-compare" className="w-fit max-w-full space-y-2">
        <h1 className="font-heading text-2xl font-medium">Compare</h1>
        <p className="text-sm text-muted-foreground">
          Need two ingested versions in scope to compare. Open Catalog and ingest a pair first.
        </p>
      </div>
    );
  }

  const [storedResult, diffResult] = await Promise.allSettled([
    api<{ relationships: Relationship[] }>(
      `/relationships?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
    api<LiveDiff>(`/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  ]);

  const relationships =
    storedResult.status === "fulfilled"
      ? storedResult.value.relationships.map((row) => orient(row, from))
      : [];

  const diff = diffResult.status === "fulfilled" ? diffResult.value : null;
  const diffError =
    diffResult.status === "rejected"
      ? diffResult.reason instanceof ApiError
        ? diffResult.reason.message
        : "Could not compare these editions."
      : null;

  const storedLevelChanges = relationships.filter((row) => row.fromLevel !== row.toLevel);
  const liveRows = liveTableRows(diff);
  const tableRows: CompareRow[] = relationships.length
    ? relationships.map((row) => ({
        from: row.from,
        fromLevel: row.fromLevel,
        to: row.to,
        toLevel: row.toLevel,
        type: row.type,
      }))
    : liveRows;
  const shown = tableRows.slice(0, 120);

  return (
    <div className="space-y-6">
      <div id="tour-compare" className="w-fit max-w-full space-y-2">
        <KbTrail items={[{ href: "/registry", label: "Catalog" }, { label: "Compare" }]} />
        <h1 className="font-heading text-2xl font-medium">Compare</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shared criterion numbers between two editions — live, even before you persist Link on
          Ingest.
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
      <p className="text-sm text-muted-foreground">
        {fromName} → {toName}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Matched numbers</CardDescription>
            <CardTitle>{diff?.matched ?? relationships.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Only in {fromName}</CardDescription>
            <CardTitle>{diff?.smartOnly.length ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Only in {toName}</CardDescription>
            <CardTitle>{diff?.gfsOnly.length ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Stricter in {toName}</CardDescription>
            <CardTitle>{diff?.escalations.length ?? storedLevelChanges.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Reworded</CardDescription>
            <CardTitle>{diff?.textChanges.length ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      {diff && diff.identicalTexts > 0 ? (
        <p className="text-sm text-muted-foreground">
          {diff.identicalTexts} of {diff.matched} shared numbers have identical principle text.
        </p>
      ) : null}
      {diffError ? (
        <p className="text-sm text-muted-foreground">
          {diffError}{" "}
          <Link href="/ingest" className="underline underline-offset-2">
            Open Ingest
          </Link>{" "}
          and parse both editions, then run Link if you want stored rows.
        </p>
      ) : null}
      {!diff && !relationships.length && !diffError ? (
        <p className="text-sm text-muted-foreground">
          No correspondence yet. Parse both editions on{" "}
          <Link href="/ingest" className="underline underline-offset-2">
            Ingest
          </Link>
          , then compare again.
        </p>
      ) : null}
      {diff && diff.matched === 0 && !relationships.length ? (
        <p className="text-sm text-muted-foreground">
          These editions share no criterion numbers. Compare works best on parallel editions of the
          same standard (for example IFA Smart and GFS).
        </p>
      ) : null}

      {shown.length > 0 ? (
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
            {shown.map((row) => (
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
      ) : null}
      {tableRows.length > shown.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {tableRows.length} pairs.
        </p>
      ) : null}

      {diff?.textChanges.length ? (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-medium">Reworded principles</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>{fromName}</TableHead>
                <TableHead>{toName}</TableHead>
                <TableHead className="w-[20%]">Similarity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diff.textChanges.map((row) => (
                <TableRow key={`text-${row.sourceRequirementId}`}>
                  <TableCell className="font-mono text-sm">{row.sourceRequirementId}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{levelLabel(row.smartLevel)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{levelLabel(row.gfsLevel)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.textSimilarity.toFixed(3)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {diff && (diff.smartOnly.length > 0 || diff.gfsOnly.length > 0) ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <h2 className="font-heading text-lg font-medium">Only in {fromName}</h2>
            <p className="font-mono text-sm text-muted-foreground">
              {diff.smartOnly.length ? diff.smartOnly.join(", ") : "None"}
            </p>
          </div>
          <div className="space-y-2">
            <h2 className="font-heading text-lg font-medium">Only in {toName}</h2>
            <p className="font-mono text-sm text-muted-foreground">
              {diff.gfsOnly.length ? diff.gfsOnly.join(", ") : "None"}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
