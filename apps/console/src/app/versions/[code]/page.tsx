import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
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

interface VersionDetail {
  code: string;
  name: string;
  edition: string;
  status: string;
  allowedNext: string[];
  levels: Record<string, number>;
  documents: Array<{
    slug: string;
    title: string;
    type: string;
    authority: string;
    status: string;
    pageCount: number | null;
    sourceUrl: string | null;
  }>;
}

export default async function VersionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const version = await api<VersionDetail>(`/versions/${code}`);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {version.edition} · {version.status}
        </p>
        <h1 className="font-heading text-2xl font-medium">{version.name}</h1>
        {version.allowedNext.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Next: {version.allowedNext.join(", ")} ·{" "}
            <Link href={`/review?version=${code}`} className="underline underline-offset-4">
              review / promote
            </Link>
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(version.levels).map(([level, count]) => (
          <Card key={level} size="sm">
            <CardHeader>
              <CardDescription>{level}</CardDescription>
              <CardTitle>{count}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <p className="text-sm">
        <Link href={`/criteria?version=${code}`} className="underline underline-offset-4">
          Criteria
        </Link>
        {" · "}
        <Link href={`/gates?version=${code}`} className="underline underline-offset-4">
          Gates
        </Link>
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="w-[16%]">Type</TableHead>
            <TableHead className="w-[16%]">Authority</TableHead>
            <TableHead className="w-[12%]">Pages</TableHead>
            <TableHead className="w-[14%]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {version.documents.map((document) => (
            <TableRow key={document.slug}>
              <TableCell>
                {document.sourceUrl ? (
                  <a href={document.sourceUrl} className="hover:underline" target="_blank" rel="noreferrer">
                    {document.title}
                  </a>
                ) : (
                  document.title
                )}
              </TableCell>
              <TableCell>{document.type}</TableCell>
              <TableCell>{document.authority}</TableCell>
              <TableCell>{document.pageCount ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary">{document.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
