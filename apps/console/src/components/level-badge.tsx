import { Badge } from "@/components/ui/badge";

export function LevelBadge({ level }: { level: string }) {
  const key = level.toLowerCase();
  const variant = key.includes("major")
    ? "destructive"
    : key.includes("minor")
      ? "outline"
      : "secondary";
  return <Badge variant={variant}>{level}</Badge>;
}
