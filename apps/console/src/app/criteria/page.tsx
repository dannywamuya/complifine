import Link from "next/link";
import { api } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { LevelBadge } from "@/components/level-badge";
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

export default async function CriteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; q?: string; level?: string }>;
}) {
  const params = await searchParams;
  const version = params.version ?? "ifa-v6-smart-fv";
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.level) query.set("level", params.level);
  query.set("limit", "80");
  const data = await api<Listing>(`/versions/${version}/requirements?${query}`);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{version}</p>
        <h1 className="font-heading text-2xl font-medium">Criteria</h1>
        <p className="text-sm text-muted-foreground">{data.total} rows</p>
      </div>
      <form className="flex flex-wrap gap-2" method="get">
        <Input name="q" defaultValue={params.q ?? ""} placeholder="Number or text" className="w-full min-w-0 sm:max-w-64" />
        <select
          name="level"
          defaultValue={params.level ?? ""}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="">All levels</option>
          <option value="major_must">Major Must</option>
          <option value="minor_must">Minor Must</option>
          <option value="recommendation">Recommendation</option>
        </select>
        <select
          name="version"
          defaultValue={version}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          {EDITIONS.map((edition) => (
            <option key={edition.value} value={edition.value}>
              {edition.label}
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
