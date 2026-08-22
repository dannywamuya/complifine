import Link from "next/link";
import { api } from "@/lib/api";
import { certScopeFromCookie } from "@/lib/scope-server";
import { scopeQuery } from "@/lib/scope";
import { Badge } from "@/components/ui/badge";
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
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Knowledge</p>
        <h1 className="font-heading text-2xl font-medium">Versions</h1>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Certification</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="w-[14%]">Edition</TableHead>
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
                <Link className="font-mono text-sm hover:underline" href={`/versions/${version.code}`}>
                  {version.code}
                </Link>
              </TableCell>
              <TableCell className="uppercase">{version.edition}</TableCell>
              <TableCell>
                <Badge variant="secondary">{version.status}</Badge>
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
