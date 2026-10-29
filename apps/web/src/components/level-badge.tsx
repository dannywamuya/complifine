import { Badge } from "@/components/ui/badge";

export function LevelBadge({ level }: { level: string }) {
  const key = level.toLowerCase();
  const variant = key.includes("major")
    ? "destructive"
    : key.includes("minor")
      ? "outline"
      : "secondary";
  return <Badge variant={variant}>{levelLabel(level)}</Badge>;
}

function levelLabel(level: string): string {
  return level
    .split("_")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0]?.toUpperCase() + part.slice(1)))
    .join(" ");
}
