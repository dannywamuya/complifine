import Link from "next/link";
import { LevelBadge } from "@/components/level-badge";

export interface RequirementRef {
  criterion: string;
  level?: string;
  controlTitle?: string;
}

interface RequirementSource {
  criterion?: string;
  level?: string;
  controlTitle?: string;
  templateId?: string | null;
}

export function requirementsByTemplate(rows: readonly RequirementSource[]): Map<string, RequirementRef[]> {
  const grouped = new Map<string, RequirementRef[]>();
  for (const row of rows) {
    if (!row.templateId || !row.criterion) continue;
    const list = grouped.get(row.templateId) ?? [];
    const known = list.some((item) => item.criterion === row.criterion && item.controlTitle === row.controlTitle);
    if (!known) {
      list.push({ criterion: row.criterion, level: row.level, controlTitle: row.controlTitle });
    }
    grouped.set(row.templateId, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.criterion.localeCompare(b.criterion));
  return grouped;
}

export function requirementCodes(requirements: readonly RequirementRef[], limit = 4): string {
  const codes = [...new Set(requirements.map((row) => row.criterion))];
  if (codes.length === 0) return "";
  const shown = codes.slice(0, limit).join(", ");
  return codes.length > limit ? `${shown} +${codes.length - limit}` : shown;
}

export function RequirementList({ requirements }: { requirements: readonly RequirementRef[] }) {
  if (requirements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Not linked to a requirement in the current edition.</p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Applies to {requirements.length} {requirements.length === 1 ? "requirement" : "requirements"}.
      </p>
      <ul className="divide-y rounded-xl border">
        {requirements.map((requirement) => (
          <li
            key={`${requirement.criterion}-${requirement.controlTitle ?? ""}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <Link
              href={`/app/criteria/${encodeURIComponent(requirement.criterion)}`}
              className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {requirement.criterion}
            </Link>
            {requirement.level ? <LevelBadge level={requirement.level} /> : null}
            {requirement.controlTitle ? (
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{requirement.controlTitle}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
