/**
 * Everything the auditor is allowed to know about one requirement.
 *
 * Built from SQL. The model never sees another requirement's records, and it
 * can only cite ids that appear in `citeable`.
 */

import { and, desc, eq, inArray, isNull, type Database } from "@complifine/db";
import {
  assessmentItems,
  assessments,
  companyDocuments,
  controlEvidenceTypes,
  controlRequirements,
  controls,
  correctiveActions,
  evidence,
  evidenceRequirements,
  evidenceTypes,
  findings,
  formRecordEntries,
  formRecords,
  formTemplates,
  requirementVersions,
  standardSections,
  standardVersions,
} from "@complifine/db";
import type { AuditCitation } from "@complifine/db";
import type { EvidenceGapStatus } from "@complifine/core";
import { estimateTokens } from "../tokens.ts";
import { evidenceGap, type GapRow } from "../evidence-gap.ts";
import { ensureDocumentText } from "../capture/document-text.ts";

export const DOSSIER_TOKEN_BUDGET = 6_000;
const ENTRY_LIMIT = 30;

export interface DossierRecord {
  id: string;
  templateTitle: string;
  status: string;
  entries: Array<Record<string, unknown>>;
}

export interface DossierDocument {
  id: string;
  filename: string;
  text: string;
}

export interface Dossier {
  requirement: {
    id: string;
    criterion: string;
    level: string;
    principle: string;
    criteria: string | null;
    section: string | null;
  };
  edition: { code: string; name: string };
  unmapped: boolean;
  controls: Array<{ id: string; title: string }>;
  gaps: Array<{ status: EvidenceGapStatus; evidenceTypeTitle?: string; templateTitle?: string | null }>;
  records: DossierRecord[];
  documents: DossierDocument[];
  evidence: Array<{ id: string; title: string; source: string; validFrom: string | null; expiresAt: string | null }>;
  assessment: { response: string; comment: string | null } | null;
  findings: Array<{
    id: string;
    status: string;
    severity: string;
    description: string;
    actions: Array<{ status: string; action: string }>;
  }>;
  citeable: AuditCitation[];
  trimmed: boolean;
}

export async function buildDossier(
  db: Database,
  input: {
    readonly siteId: string;
    readonly siteType: string;
    readonly versionId: string;
    readonly requirementVersionId: string;
    readonly gapRows?: readonly GapRow[];
    readonly readFile?: (storageKey: string) => Promise<Uint8Array>;
  },
): Promise<Dossier> {
  const [requirement] = await db
    .select({
      id: requirementVersions.id,
      criterion: requirementVersions.sourceRequirementId,
      level: requirementVersions.level,
      principle: requirementVersions.principleText,
      criteria: requirementVersions.criteriaText,
      sectionId: requirementVersions.sectionId,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.id, input.requirementVersionId));
  if (!requirement) throw new Error("Requirement not found");

  const [section] = requirement.sectionId
    ? await db
        .select({ title: standardSections.title })
        .from(standardSections)
        .where(eq(standardSections.id, requirement.sectionId))
    : [undefined];
  const [edition] = await db
    .select({ code: standardVersions.code, name: standardVersions.name })
    .from(standardVersions)
    .where(eq(standardVersions.id, input.versionId));

  const linked = await db
    .select({ id: controls.id, title: controls.title })
    .from(controlRequirements)
    .innerJoin(controls, eq(controls.id, controlRequirements.controlId))
    .where(eq(controlRequirements.requirementVersionId, requirement.id));

  const gapRows =
    input.gapRows ??
    (await evidenceGap(db, { siteId: input.siteId, siteType: input.siteType, versionId: input.versionId })).rows;
  const gaps = gapRows
    .filter((row) => row.requirementVersionId === requirement.id)
    .map((row) => ({
      status: row.status,
      evidenceTypeTitle: row.evidenceTypeTitle,
      templateTitle: row.templateTitle,
    }));

  const controlIds = linked.map((row) => row.id);
  const expected =
    controlIds.length === 0
      ? []
      : await db
          .select({ evidenceTypeId: controlEvidenceTypes.evidenceTypeId })
          .from(controlEvidenceTypes)
          .where(and(inArray(controlEvidenceTypes.controlId, controlIds), eq(controlEvidenceTypes.mandatory, true)));
  const typeIds = [...new Set(expected.map((row) => row.evidenceTypeId))];

  const templates =
    typeIds.length === 0
      ? []
      : await db
          .select({
            id: formTemplates.id,
            title: formTemplates.title,
            evidenceTypeId: formTemplates.evidenceTypeId,
            siteTypes: formTemplates.siteTypes,
          })
          .from(formTemplates)
          .where(and(isNull(formTemplates.organizationId), inArray(formTemplates.evidenceTypeId, typeIds)));
  const fitting = templates.filter(
    (template) => template.evidenceTypeId && template.siteTypes.includes(input.siteType),
  );

  const records: DossierRecord[] = [];
  for (const template of fitting) {
    const [record] = await db
      .select({ id: formRecords.id, status: formRecords.status })
      .from(formRecords)
      .where(
        and(
          eq(formRecords.siteId, input.siteId),
          eq(formRecords.templateId, template.id),
          inArray(formRecords.status, ["submitted", "verified"]),
        ),
      )
      .orderBy(desc(formRecords.submittedAt))
      .limit(1);
    if (!record) continue;
    const entries = await db
      .select({ data: formRecordEntries.data })
      .from(formRecordEntries)
      .where(eq(formRecordEntries.recordId, record.id))
      .orderBy(desc(formRecordEntries.recordedAt))
      .limit(ENTRY_LIMIT);
    records.push({
      id: record.id,
      templateTitle: template.title,
      status: record.status,
      entries: entries.map((entry) => entry.data).reverse(),
    });
  }

  const held = await db
    .select({
      id: evidence.id,
      title: evidenceTypes.title,
      source: evidence.source,
      documentId: evidence.documentId,
      validFrom: evidence.validFrom,
      expiresAt: evidence.expiresAt,
      evidenceTypeId: evidence.evidenceTypeId,
    })
    .from(evidence)
    .innerJoin(evidenceTypes, eq(evidenceTypes.id, evidence.evidenceTypeId))
    .where(eq(evidence.siteId, input.siteId));
  const linkedEvidenceIds = new Set(
    (
      await db
        .select({ evidenceId: evidenceRequirements.evidenceId })
        .from(evidenceRequirements)
        .where(eq(evidenceRequirements.requirementVersionId, requirement.id))
    ).map((row) => row.evidenceId),
  );
  const relevant = held.filter(
    (row) => typeIds.includes(row.evidenceTypeId) || linkedEvidenceIds.has(row.id),
  );

  const documentIds = [...new Set(relevant.map((row) => row.documentId).filter((id): id is string => Boolean(id)))];
  const documents: DossierDocument[] = [];
  if (documentIds.length > 0) {
    const files = await db
      .select({
        id: companyDocuments.id,
        filename: companyDocuments.filename,
        mimeType: companyDocuments.mimeType,
        storageKey: companyDocuments.storageKey,
        extractedText: companyDocuments.extractedText,
      })
      .from(companyDocuments)
      .where(inArray(companyDocuments.id, documentIds));
    for (const file of files) {
      const text = input.readFile ? await ensureDocumentText(db, file, input.readFile) : file.extractedText;
      documents.push({ id: file.id, filename: file.filename, text: text ?? "" });
    }
  }

  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(and(eq(assessments.siteId, input.siteId), eq(assessments.standardVersionId, input.versionId)))
    .orderBy(desc(assessments.createdAt))
    .limit(1);
  const [item] = assessment
    ? await db
        .select({ response: assessmentItems.response, comment: assessmentItems.comment })
        .from(assessmentItems)
        .where(
          and(eq(assessmentItems.assessmentId, assessment.id), eq(assessmentItems.requirementVersionId, requirement.id)),
        )
    : [undefined];

  const openFindings = await db
    .select({
      id: findings.id,
      status: findings.status,
      severity: findings.severity,
      description: findings.description,
    })
    .from(findings)
    .where(
      and(
        eq(findings.siteId, input.siteId),
        eq(findings.requirementVersionId, requirement.id),
        inArray(findings.status, ["open", "in_progress"]),
      ),
    );
  const findingIds = openFindings.map((row) => row.id);
  const actions =
    findingIds.length === 0
      ? []
      : await db
          .select({
            findingId: correctiveActions.findingId,
            status: correctiveActions.status,
            action: correctiveActions.action,
          })
          .from(correctiveActions)
          .where(inArray(correctiveActions.findingId, findingIds));

  const citeable: AuditCitation[] = [
    ...relevant.map((row) => ({ kind: "evidence" as const, id: row.id, label: row.title })),
    ...records.map((row) => ({ kind: "record" as const, id: row.id, label: row.templateTitle })),
    ...documents.map((row) => ({ kind: "document" as const, id: row.id, label: row.filename })),
  ];

  return trimDossier({
    requirement: {
      id: requirement.id,
      criterion: requirement.criterion,
      level: requirement.level,
      principle: requirement.principle,
      criteria: requirement.criteria,
      section: section?.title ?? null,
    },
    edition: { code: edition?.code ?? "", name: edition?.name ?? "" },
    unmapped: linked.length === 0,
    controls: linked,
    gaps,
    records,
    documents,
    evidence: relevant.map((row) => ({
      id: row.id,
      title: row.title,
      source: row.source,
      validFrom: row.validFrom?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    })),
    assessment: item ? { response: item.response, comment: item.comment } : null,
    findings: openFindings.map((row) => ({
      ...row,
      actions: actions.filter((action) => action.findingId === row.id).map(({ status, action }) => ({ status, action })),
    })),
    citeable,
    trimmed: false,
  });
}

/** Drop record rows, then document text, until the dossier fits the token budget. */
export function trimDossier(dossier: Dossier, budget = DOSSIER_TOKEN_BUDGET): Dossier {
  const next: Dossier = {
    ...dossier,
    records: dossier.records.map((record) => ({ ...record, entries: [...record.entries] })),
    documents: dossier.documents.map((document) => ({ ...document })),
  };
  let trimmed = dossier.trimmed;
  while (estimateTokens(JSON.stringify(next)) > budget) {
    const record = [...next.records].sort((a, b) => b.entries.length - a.entries.length)[0];
    if (record && record.entries.length > 0) {
      record.entries.pop();
      trimmed = true;
      continue;
    }
    const document = [...next.documents].sort((a, b) => b.text.length - a.text.length)[0];
    if (document && document.text.length > 400) {
      document.text = document.text.slice(0, Math.floor(document.text.length / 2));
      trimmed = true;
      continue;
    }
    break;
  }
  next.trimmed = trimmed;
  return next;
}
