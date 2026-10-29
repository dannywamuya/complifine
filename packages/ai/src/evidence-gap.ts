/**
 * What a site still owes for one published edition.
 *
 * Applicable requirements come from the publisher's scoping tables. Each one
 * is either unmapped (no control in the library) or owed the evidence types
 * its controls expect. A type applies to this site when no form produces it,
 * or when a form that produces it includes the site's type. Drafts never count.
 */

import { and, eq, inArray, isNull, type Database } from "@complifine/db";
import {
  applicabilityQuestions,
  controlEvidenceTypes,
  controlRequirements,
  controls,
  evidence,
  evidenceTypes,
  formTemplates,
  requirementVersions,
  siteScopingAnswers,
} from "@complifine/db";
import { FORM_CADENCE_VALID_DAYS, type EvidenceGapStatus, type FormCadence } from "@complifine/core";
import { resolveChecklist, type ChecklistAnswer } from "./agent/tools.ts";

export interface GapRow {
  readonly status: EvidenceGapStatus;
  readonly requirementVersionId?: string;
  readonly criterion?: string;
  readonly level?: string;
  readonly controlId?: string;
  readonly controlTitle?: string;
  readonly evidenceTypeId?: string;
  readonly evidenceTypeSlug?: string;
  readonly evidenceTypeTitle?: string;
  readonly templateId?: string | null;
  readonly templateTitle?: string | null;
  readonly evidenceId?: string | null;
  readonly validFrom?: string | null;
  readonly expiresAt?: string | null;
}

export async function evidenceGap(
  db: Database,
  input: { readonly siteId: string; readonly siteType: string; readonly versionId: string },
): Promise<{ rows: GapRow[]; counts: Record<EvidenceGapStatus, number> }> {
  const saved = await db
    .select({
      questionNumber: applicabilityQuestions.sourceNumber,
      answer: siteScopingAnswers.answer,
    })
    .from(siteScopingAnswers)
    .innerJoin(applicabilityQuestions, eq(applicabilityQuestions.id, siteScopingAnswers.questionId))
    .where(
      and(eq(siteScopingAnswers.siteId, input.siteId), eq(applicabilityQuestions.standardVersionId, input.versionId)),
    );

  const answers: ChecklistAnswer[] = saved
    .filter(
      (row): row is { questionNumber: number; answer: "yes" | "no" } =>
        row.questionNumber !== null && (row.answer === "yes" || row.answer === "no"),
    )
    .map((row) => ({ questionNumber: row.questionNumber, answer: row.answer }));

  const resolution = await resolveChecklist(db, input.versionId, answers);
  const excluded = new Set(resolution.exclusions.map((row) => row.criterion));
  const requirements = await db
    .select({
      id: requirementVersions.id,
      criterion: requirementVersions.sourceRequirementId,
      level: requirementVersions.level,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, input.versionId));

  return gapFrom(
    db,
    input.siteId,
    input.siteType,
    requirements.filter((row) => row.criterion && !excluded.has(row.criterion)),
  );
}

async function gapFrom(
  db: Database,
  siteId: string,
  siteType: string,
  requirements: Array<{ id: string; criterion: string | null; level: string | null }>,
): Promise<{ rows: GapRow[]; counts: Record<EvidenceGapStatus, number> }> {
  const ids = requirements.map((row) => row.id);
  const links =
    ids.length === 0
      ? []
      : await db
          .select({
            requirementVersionId: controlRequirements.requirementVersionId,
            controlId: controls.id,
            controlTitle: controls.title,
          })
          .from(controlRequirements)
          .innerJoin(controls, eq(controls.id, controlRequirements.controlId))
          .where(inArray(controlRequirements.requirementVersionId, ids));

  const linked = new Set(links.map((row) => row.requirementVersionId));
  const rows: GapRow[] = [];
  for (const requirement of requirements) {
    if (!linked.has(requirement.id)) {
      rows.push({
        status: "unmapped",
        requirementVersionId: requirement.id,
        criterion: requirement.criterion ?? undefined,
        level: requirement.level ?? undefined,
      });
    }
  }

  const controlIds = [...new Set(links.map((row) => row.controlId))];
  const expected =
    controlIds.length === 0
      ? []
      : await db
          .select({
            controlId: controlEvidenceTypes.controlId,
            evidenceTypeId: evidenceTypes.id,
            slug: evidenceTypes.slug,
            title: evidenceTypes.title,
            mandatory: controlEvidenceTypes.mandatory,
          })
          .from(controlEvidenceTypes)
          .innerJoin(evidenceTypes, eq(evidenceTypes.id, controlEvidenceTypes.evidenceTypeId))
          .where(inArray(controlEvidenceTypes.controlId, controlIds));

  const templates = await db
    .select({
      id: formTemplates.id,
      title: formTemplates.title,
      evidenceTypeId: formTemplates.evidenceTypeId,
      siteTypes: formTemplates.siteTypes,
      cadence: formTemplates.cadence,
    })
    .from(formTemplates)
    .where(isNull(formTemplates.organizationId));
  const templatesByType = new Map<string, (typeof templates)[number][]>();
  for (const template of templates) {
    if (!template.evidenceTypeId) continue;
    const list = templatesByType.get(template.evidenceTypeId) ?? [];
    list.push(template);
    templatesByType.set(template.evidenceTypeId, list);
  }

  const live = await db.select().from(evidence).where(eq(evidence.siteId, siteId));
  const byType = new Map<string, (typeof live)[number]>();
  for (const row of live) {
    if (row.verificationStatus === "rejected") continue;
    const current = byType.get(row.evidenceTypeId);
    const at = row.validFrom?.getTime() ?? 0;
    if (!current || at >= (current.validFrom?.getTime() ?? 0)) byType.set(row.evidenceTypeId, row);
  }

  const seen = new Set<string>();
  for (const link of links) {
    for (const item of expected) {
      if (item.controlId !== link.controlId || !item.mandatory) continue;
      const key = `${link.requirementVersionId}:${item.evidenceTypeId}`;
      if (seen.has(key)) continue;
      const produced = templatesByType.get(item.evidenceTypeId) ?? [];
      const fitting = produced.find((template) => template.siteTypes.includes(siteType));
      if (produced.length > 0 && !fitting) continue;
      seen.add(key);
      const held = byType.get(item.evidenceTypeId);
      const requirement = requirements.find((row) => row.id === link.requirementVersionId);
      rows.push({
        status: held ? freshness(held, fitting?.cadence as FormCadence | undefined) : "missing",
        requirementVersionId: link.requirementVersionId,
        criterion: requirement?.criterion ?? undefined,
        level: requirement?.level ?? undefined,
        controlId: link.controlId,
        controlTitle: link.controlTitle,
        evidenceTypeId: item.evidenceTypeId,
        evidenceTypeSlug: item.slug,
        evidenceTypeTitle: item.title,
        templateId: fitting?.id ?? null,
        templateTitle: fitting?.title ?? null,
        evidenceId: held?.id ?? null,
        validFrom: held?.validFrom?.toISOString() ?? null,
        expiresAt: held?.expiresAt?.toISOString() ?? null,
      });
    }
  }

  const counts: Record<EvidenceGapStatus, number> = {
    present: 0,
    stale: 0,
    expired: 0,
    missing: 0,
    unmapped: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return { rows, counts };
}

function freshness(
  row: { source: string; expiresAt: Date | null; validFrom: Date | null },
  cadence: FormCadence | undefined,
): EvidenceGapStatus {
  const expires = row.expiresAt ?? (cadence && row.validFrom ? impliedExpiry(cadence, row.validFrom) : null);
  if (!expires || expires.getTime() >= Date.now()) return "present";
  return row.source === "form" ? "stale" : "expired";
}

function impliedExpiry(cadence: FormCadence, validFrom: Date): Date | null {
  const days = FORM_CADENCE_VALID_DAYS[cadence];
  if (days === null) return null;
  return new Date(validFrom.getTime() + days * 24 * 60 * 60 * 1000);
}
