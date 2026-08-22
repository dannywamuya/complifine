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
export const metadata = { title: "Sources" };

interface DocumentsResponse {
  documents: Array<{
    slug: string;
    title: string;
    type: string;
    authority: string;
    edition: string;
    standardName?: string;
    sourceUrl: string | null;
    pages: number | null;
    status: string;
    sha256: string | null;
    binding: boolean;
  }>;
}

export default async function SourcesPage() {
  const scope = await certScopeFromCookie();
  const qs = scopeQuery(scope);
  const data = await api<DocumentsResponse>(`/documents${qs ? `?${qs}` : ""}`);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Provenance</p>
        <h1 className="font-heading text-2xl font-medium">Sources</h1>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead className="w-[16%]">Version</TableHead>
            <TableHead className="w-[14%]">Type</TableHead>
            <TableHead className="w-[12%]">Binding</TableHead>
            <TableHead className="w-[12%]">Status</TableHead>
            <TableHead className="w-[14%]">Hash</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.documents.map((document) => (
            <TableRow key={`${document.edition}-${document.slug}`}>
              <TableCell>
                {document.sourceUrl ? (
                  <a href={document.sourceUrl} className="hover:underline" target="_blank" rel="noreferrer">
                    {document.title}
                  </a>
                ) : (
                  document.title
                )}
              </TableCell>
              <TableCell>
                <Link className="font-mono text-xs hover:underline" href={`/versions/${document.edition}`}>
                  {document.edition}
                </Link>
              </TableCell>
              <TableCell>{document.type}</TableCell>
              <TableCell>
                <Badge variant={document.binding ? "default" : "secondary"}>
                  {document.binding ? "yes" : "no"}
                </Badge>
              </TableCell>
              <TableCell>{document.status}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground break-all">
                {document.sha256?.slice(0, 12) ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
