import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { KbTrail } from "@/components/kb-trail";
import { StatusBadge } from "@/components/status-badge";
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
export const metadata = { title: "Versions" };

interface VersionsResponse {
  versions: Array<{
    code: string;
    name: string;
    edition: string;
    status: string;
    standardCode: string;
    standardName: string;
    criteria: number;
    effectiveDate: string | null;
  }>;
}

export default async function VersionsPage() {
  const scope = await certScopeFromCookie();
  const qs = scopeQuery(scope);
  const data = await api<VersionsResponse>(`/versions${qs ? `?${qs}` : ""}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div id="tour-versions" className="w-fit max-w-full space-y-2">
          <KbTrail items={[{ href: "/registry", label: "Catalog" }, { label: "Editions table" }]} />
          <h1 className="font-heading text-2xl font-medium">Editions</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Flat list of every ingested edition. The usual place to browse is the catalog.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/registry">Catalog</Link>
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Certification</TableHead>
            <TableHead>Edition</TableHead>
            <TableHead className="w-[14%]">Status</TableHead>
            <TableHead className="w-[12%]">Criteria</TableHead>
            <TableHead className="w-[16%]">Effective</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.versions.map((version) => (
            <TableRow key={version.code}>
              <TableCell className="text-sm">{version.standardName}</TableCell>
              <TableCell>
                <Link className="text-sm hover:underline" href={`/registry?edition=${encodeURIComponent(version.code)}`}>
                  {version.name}
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge status={version.status} />
              </TableCell>
              <TableCell>{version.criteria}</TableCell>
              <TableCell className="text-muted-foreground">{version.effectiveDate ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
