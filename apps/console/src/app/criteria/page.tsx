import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { LevelBadge } from "@/components/level-badge";
import { KbTrail } from "@/components/kb-trail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criteria" };

interface Listing {
  total: number;
  requirements: Array<{
    id: string;
    criterion: string;
    level: string;
    principle: string;
    page: number | null;
  }>;
}

interface VersionsResponse {
  versions: Array<{
    code: string;
    name: string;
    levelScheme?: string;
  }>;
}

interface VersionDetail {
  levelOptions?: Array<{ code: string; label: string; count: number }>;
}

export default async function CriteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; q?: string; level?: string }>;
}) {
  const params = await searchParams;
  const scope = await certScopeFromCookie();
  const qs = scopeQuery(scope);
  const catalog = await api<VersionsResponse>(`/versions${qs ? `?${qs}` : ""}`);
  const version = params.version ?? catalog.versions[0]?.code;
  if (!version) {
    return (
      <div id="tour-criteria" className="w-fit max-w-full space-y-2">
        <h1 className="font-heading text-2xl font-medium">Criteria</h1>
        <p className="text-sm text-muted-foreground">No versions in the current certification filter.</p>
      </div>
    );
  }

  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.level) query.set("level", params.level);
  query.set("limit", "80");
  const [data, detail] = await Promise.all([
    api<Listing>(`/versions/${version}/requirements?${query}`),
    api<VersionDetail>(`/versions/${version}`),
  ]);

  const current = catalog.versions.find((item) => item.code === version);

  return (
    <div className="space-y-6">
      <div id="tour-criteria" className="w-fit max-w-full space-y-2">
        <KbTrail
          items={[
            { href: "/registry", label: "Catalog" },
            { href: `/registry?edition=${encodeURIComponent(version)}`, label: current?.name ?? version },
            { label: "Criteria" },
          ]}
        />
        <h1 className="font-heading text-2xl font-medium">Criteria</h1>
        <p className="text-sm text-muted-foreground">
          {data.total} in {current?.name ?? version}. This is the fact table the agent cites.
        </p>
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Number or text" className="w-full min-w-0 sm:max-w-64" />
        <select
          name="level"
          defaultValue={params.level ?? ""}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="">All levels</option>
          {(detail.levelOptions ?? []).map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
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
          Filter
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%] sm:w-[22%]">ID</TableHead>
            <TableHead className="w-[24%] sm:w-[18%]">Level</TableHead>
            <TableHead>Principle</TableHead>
            <TableHead className="w-14">Page</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.requirements.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link
                  className="font-mono text-sm hover:underline"
                  href={`/criteria/${encodeURIComponent(row.criterion)}`}
                >
                  {row.criterion}
                </Link>
              </TableCell>
              <TableCell>
                <LevelBadge level={row.level} />
              </TableCell>
              <TableCell className="min-w-0">{row.principle}</TableCell>
              <TableCell className="text-muted-foreground">{row.page ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
