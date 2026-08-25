import { Badge } from "@/components/ui/badge";

const VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  published: "default",
  approved: "outline",
  review: "outline",
  validation: "secondary",
  extracted: "secondary",
  ingesting: "secondary",
  draft: "secondary",
  retired: "destructive",
  failed: "destructive",
  succeeded: "default",
  completed: "default",
  running: "outline",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT[status] ?? "secondary"}>{status.replaceAll("_", " ")}</Badge>;
}
