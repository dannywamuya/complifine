import { api } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit" };

interface AuditResponse {
  audit: Array<{
    id: string;
    entityType: string;
    action: string;
    actor: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
}

export default async function AuditPage() {
  const data = await api<AuditResponse>("/audit");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Trail</p>
        <h1 className="font-heading text-2xl font-medium">Audit</h1>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[24%]">When</TableHead>
            <TableHead className="w-[18%]">Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-[22%]">Entity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.audit.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </TableCell>
              <TableCell>{row.actor}</TableCell>
              <TableCell className="font-mono text-xs">{row.action}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{row.entityType}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
