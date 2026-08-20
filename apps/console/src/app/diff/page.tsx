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
export const metadata = { title: "Smart vs GFS" };

interface DiffReport {
  matched: number;
  smartOnly: string[];
  gfsOnly: string[];
  escalations: Array<{
    sourceRequirementId: string;
    smartLevel: string;
    gfsLevel: string;
    textSimilarity: number;
  }>;
  textChanges: Array<{ sourceRequirementId: string; textSimilarity: number }>;
}

export default async function DiffPage() {
  const report = await api<DiffReport>("/diff");

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Correspondence</p>
        <h1 className="font-heading text-2xl font-medium">Smart ↔ GFS</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Shared</CardDescription>
            <CardTitle>{report.matched}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>GFS only</CardDescription>
            <CardTitle>{report.gfsOnly.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Escalations</CardDescription>
            <CardTitle>{report.escalations.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      {report.gfsOnly.length > 0 ? (
        <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <span>GFS-only:</span>
          {report.gfsOnly.map((id) => (
            <Badge key={id} variant="outline" className="font-mono">
              {id}
            </Badge>
          ))}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Criterion</TableHead>
            <TableHead className="w-[22%]">Smart</TableHead>
            <TableHead className="w-[22%]">GFS</TableHead>
            <TableHead className="w-[18%]">Text similarity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.escalations.map((row) => (
            <TableRow key={row.sourceRequirementId}>
              <TableCell className="font-mono text-sm">{row.sourceRequirementId}</TableCell>
              <TableCell>{row.smartLevel}</TableCell>
              <TableCell>{row.gfsLevel}</TableCell>
              <TableCell className="font-mono text-xs">{row.textSimilarity.toFixed(3)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
