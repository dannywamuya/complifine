/**
 * One requirement, judged only from its dossier.
 *
 * Citations the model invents are kept on `ungrounded` and removed from the
 * evidence the user is shown. The verdict stays a simulation either way.
 */

import { z } from "zod";
import { AUDIT_CITATION_KINDS, AUDIT_VERDICTS, FINDING_SEVERITIES, type AuditVerdict } from "@complifine/core";
import type { AuditCitation } from "@complifine/db";
import type { Dossier } from "./dossier.ts";

export const judgeSchema = z.object({
  verdict: z.enum(AUDIT_VERDICTS),
  rationale: z.string(),
  recommendation: z.string(),
  suggestedSeverity: z.enum(FINDING_SEVERITIES).nullable(),
  citedEvidence: z.array(
    z.object({
      kind: z.enum(AUDIT_CITATION_KINDS),
      id: z.string(),
      label: z.string(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});

export type JudgeDraft = z.infer<typeof judgeSchema>;

export interface JudgedItem {
  verdict: AuditVerdict;
  rationale: string;
  recommendation: string;
  suggestedSeverity: JudgeDraft["suggestedSeverity"];
  citedEvidence: AuditCitation[];
  ungrounded: AuditCitation[];
  confidence: number;
}

export const AUDITOR_INSTRUCTIONS = `You are simulating a certification-body auditor for the edition named in the dossier.
Judge only from the dossier. Do not use outside knowledge of this company.
Use insufficient_evidence when nothing is on file, or when unmapped is true.
Use likely_compliant, at_risk, likely_non_compliant, or not_applicable. Never say the site is certified.
Cite only ids listed in citeable, using the same kind and id. If the dossier is trimmed, say the review saw only part of the records.
suggestedSeverity is major for a likely failure of a Major Must, minor otherwise, and null when you are not raising a gap.`;

export interface AuditGenerator {
  judge(dossier: Dossier): Promise<JudgeDraft & { promptTokens?: number; completionTokens?: number }>;
  summarize(input: {
    readonly edition: string;
    readonly items: readonly RankedItem[];
  }): Promise<{
    summary: string;
    recommendations: Array<{ requirementVersionId: string; text: string; priority: number }>;
    promptTokens?: number;
    completionTokens?: number;
  }>;
}

export interface RankedItem {
  requirementVersionId: string;
  criterion: string;
  level: string;
  verdict: AuditVerdict;
  rationale: string;
  recommendation: string;
}

export function groundCitations(
  allowed: readonly AuditCitation[],
  cited: readonly AuditCitation[],
): { citedEvidence: AuditCitation[]; ungrounded: AuditCitation[] } {
  const byKey = new Map(allowed.map((row) => [`${row.kind}:${row.id}`, row]));
  const citedEvidence: AuditCitation[] = [];
  const ungrounded: AuditCitation[] = [];
  const seen = new Set<string>();
  for (const row of cited) {
    const key = `${row.kind}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const known = byKey.get(key);
    if (known) citedEvidence.push(known);
    else ungrounded.push({ kind: row.kind, id: row.id, label: row.label });
  }
  return { citedEvidence, ungrounded };
}

export async function judgeRequirement(
  dossier: Dossier,
  generator: AuditGenerator,
): Promise<JudgedItem & { promptTokens?: number; completionTokens?: number }> {
  const draft = await generator.judge(dossier);
  const grounded = groundCitations(dossier.citeable, draft.citedEvidence);
  return {
    verdict: draft.verdict,
    rationale: draft.rationale.trim(),
    recommendation: draft.recommendation.trim(),
    suggestedSeverity: draft.suggestedSeverity,
    citedEvidence: grounded.citedEvidence,
    ungrounded: grounded.ungrounded,
    confidence: draft.confidence,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
  };
}

const RESPONSE_FOR_VERDICT = {
  likely_compliant: "compliant",
  at_risk: "partial",
  likely_non_compliant: "non_compliant",
  not_applicable: "not_applicable",
  insufficient_evidence: null,
} as const;

/** The self-assessment answer a verdict suggests. Insufficient evidence has none until the person chooses. */
export function responseForVerdict(verdict: AuditVerdict): (typeof RESPONSE_FOR_VERDICT)[AuditVerdict] {
  return RESPONSE_FOR_VERDICT[verdict];
}
