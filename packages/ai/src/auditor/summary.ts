/**
 * Rank gaps the way an auditor would walk a closing meeting:
 * Major Must failures, then anything at risk, then missing evidence.
 */

import type { AuditVerdict } from "@complifine/core";
import type { RankedItem } from "./judge.ts";

const VERDICT_RANK: Record<AuditVerdict, number> = {
  likely_non_compliant: 0,
  at_risk: 1,
  insufficient_evidence: 2,
  likely_compliant: 3,
  not_applicable: 4,
};

function levelRank(level: string): number {
  if (level === "major_must") return 0;
  if (level === "minor_must") return 1;
  return 2;
}

function majorFailure(item: RankedItem): number {
  return item.level === "major_must" && item.verdict === "likely_non_compliant" ? 0 : 1;
}

export function rankItems(items: readonly RankedItem[]): RankedItem[] {
  return [...items].sort((a, b) => {
    const major = majorFailure(a) - majorFailure(b);
    if (major !== 0) return major;
    const verdict = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    if (verdict !== 0) return verdict;
    return levelRank(a.level) - levelRank(b.level);
  });
}

export function recommendationsFrom(items: readonly RankedItem[]) {
  return rankItems(items)
    .filter((item) => item.verdict !== "likely_compliant" && item.verdict !== "not_applicable")
    .map((item, index) => ({
      requirementVersionId: item.requirementVersionId,
      text: item.recommendation || item.rationale,
      priority: index + 1,
    }));
}
