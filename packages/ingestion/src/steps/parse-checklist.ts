/**
 * Step 3: persist a parsed checklist workbook into the knowledge layer.
 *
 * Idempotent throughout. Every entity is matched on a natural key the
 * publisher owns - a section GUID, a criterion GUID, a question GUID - so a
 * second run updates in place rather than duplicating. Requirement versions
 * additionally carry a content hash, so an unchanged criterion is not even
 * written, which keeps `updated_at` meaningful as a signal that something
 * really did change.
 */

import { createHash } from "node:crypto";
import { and, eq, type Database } from "@complifine/db";
import {
  applicabilityQuestions,
  checklistItems,
  checklists,
  requirementApplicability,
  requirements,
  requirementVersions,
  standardSections,
} from "@complifine/db";
import { normalizeForComparison } from "@complifine/core";
import { Workbook } from "../xlsx/workbook.ts";
import { parseChecklistWorkbook, type ParsedChecklist } from "../xlsx/checklist-adapter.ts";
import { readStoredFile } from "../storage.ts";
import type { JobContext } from "../jobs.ts";
import { recordAudit } from "../audit.ts";

export interface ParseChecklistParams {
  readonly standardId: string;
  readonly standardVersionId: string;
  readonly documentId: string;
  readonly documentSlug: string;
  readonly documentTitle: string;
  readonly storageKey: string;
  readonly edition: "smart" | "gfs";
}

export interface ParseChecklistResult {
  readonly parsed: ParsedChecklist;
  readonly sectionsWritten: number;
  readonly requirementsCreated: number;
  readonly requirementsUpdated: number;
  readonly requirementsUnchanged: number;
  readonly questionsWritten: number;
  readonly applicabilityLinksWritten: number;
  readonly checklistItemsWritten: number;
}

/**
 * Hash of the fields that constitute the requirement's meaning.
 *
 * Normalised first so that a whitespace-only change in the source does not
 * present as a substantive edit. Level is included because a Minor-to-Major
 * escalation is exactly the kind of change that must not slip through as
 * "unchanged" - it is the difference between a finding and a failed audit.
 */
function requirementContentHash(input: {
  principleText: string;
  criteriaText: string | null;
  level: string;
}): string {
  return createHash("sha256")
    .update(normalizeForComparison(input.principleText))
    .update("\u0000")
    .update(normalizeForComparison(input.criteriaText ?? ""))
    .update("\u0000")
    .update(input.level)
    .digest("hex");
}

export async function parseChecklistDocument(
  db: Database,
  ctx: JobContext,
  params: ParseChecklistParams,
): Promise<ParseChecklistResult> {
  const bytes = await readStoredFile(params.storageKey);
  const workbook = Workbook.fromBytes(bytes);

  await ctx.debug("Workbook opened", {
    sheets: workbook.sheetNames.length,
    tables: workbook.tableNames.length,
  });

  const parsed = parseChecklistWorkbook(workbook, params.edition);

  await ctx.info(
    `Parsed ${parsed.requirements.length} criteria, ${parsed.sections.length} sections, ` +
      `${parsed.questions.length} scoping questions, ${parsed.applicabilityLinks.length} applicability links`,
  );

  // Diagnostics that indicate the source drifted from what the parser expects.
  const d = parsed.diagnostics;
  if (d.piRowsSkipped > 0) {
    await ctx.warn(`Skipped ${d.piRowsSkipped} rows in the criteria table`, {
      unparseableNumbers: d.unparseableCriterionNumbers,
    });
  }
  if (d.levelLabelMismatches > 0) {
    await ctx.error(
      `${d.levelLabelMismatches} criteria where the level lookup disagrees with the cached label`,
    );
  }
  if (d.unresolvedSectionGuids.length > 0) {
    await ctx.warn(`${d.unresolvedSectionGuids.length} section GUIDs did not resolve`, {
      guids: d.unresolvedSectionGuids.slice(0, 10),
    });
  }
  await ctx.debug("Applicability link provenance", {
    fromRelationalTable: d.linksFromRelational,
    fromCriteriaSheetColumn: d.linksFromPiColumn,
    corroboratedByBoth: d.linksInBoth,
    droppedAsOtherProduct: d.danglingRelationalLinks,
  });

  // --- sections ------------------------------------------------------------
  const sectionIdByGuid = await writeSections(db, params, parsed);

  // --- requirements --------------------------------------------------------
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const requirementVersionIdByGuid = new Map<string, string>();

  for (const requirement of parsed.requirements) {
    const contentHash = requirementContentHash(requirement);

    // Stable identity, scoped to the standard so a future v6.1 that reuses the
    // GUID attaches a new version to the same requirement.
    const [existingRequirement] = await db
      .select()
      .from(requirements)
      .where(
        and(
          eq(requirements.standardId, params.standardId),
          eq(requirements.stableKey, requirement.stableKey),
        ),
      );

    let requirementId: string;
    if (existingRequirement) {
      requirementId = existingRequirement.id;
      if (existingRequirement.latestSourceIdentifier !== requirement.sourceRequirementId) {
        await db
          .update(requirements)
          .set({
            latestSourceIdentifier: requirement.sourceRequirementId,
            updatedAt: new Date(),
          })
          .where(eq(requirements.id, requirementId));
      }
    } else {
      const [row] = await db
        .insert(requirements)
        .values({
          standardId: params.standardId,
          stableKey: requirement.stableKey,
          latestSourceIdentifier: requirement.sourceRequirementId,
        })
        .returning({ id: requirements.id });
      requirementId = row!.id;
    }

    const versionFields = {
      requirementId,
      standardVersionId: params.standardVersionId,
      documentId: params.documentId,
      sourceRequirementId: requirement.sourceRequirementId,
      sortKey: requirement.sortKey,
      sectionId: requirement.sectionGuid
        ? (sectionIdByGuid.get(requirement.sectionGuid) ?? null)
        : null,
      subsectionId: requirement.subsectionGuid
        ? (sectionIdByGuid.get(requirement.subsectionGuid) ?? null)
        : null,
      principleGuid: requirement.principleGuid,
      principleText: requirement.principleText,
      criteriaGuid: requirement.criteriaGuid,
      criteriaText: requirement.criteriaText,
      levelGuid: requirement.levelGuid,
      level: requirement.level,
      naExempt: requirement.naExempt,
      phuRelated: requirement.phuRelated,
      sourceLocation: requirement.sourceLocation,
      sourceExcerpt: requirement.sourceExcerpt,
      contentHash,
      status: "extracted" as const,
    };

    const [existingVersion] = await db
      .select()
      .from(requirementVersions)
      .where(
        and(
          eq(requirementVersions.standardVersionId, params.standardVersionId),
          eq(requirementVersions.requirementId, requirementId),
        ),
      );

    if (!existingVersion) {
      const [row] = await db
        .insert(requirementVersions)
        .values(versionFields)
        .returning({ id: requirementVersions.id });
      requirementVersionIdByGuid.set(requirement.stableKey, row!.id);
      created++;
    } else if (existingVersion.contentHash === contentHash) {
      // Structural fields can still have moved even when the text has not -
      // for instance if the section tree was rebuilt - so refresh them without
      // touching updated_at.
      await db
        .update(requirementVersions)
        .set({
          sectionId: versionFields.sectionId,
          subsectionId: versionFields.subsectionId,
          sourceLocation: versionFields.sourceLocation,
          sortKey: versionFields.sortKey,
        })
        .where(eq(requirementVersions.id, existingVersion.id));
      requirementVersionIdByGuid.set(requirement.stableKey, existingVersion.id);
      unchanged++;
    } else {
      await db
        .update(requirementVersions)
        .set({ ...versionFields, updatedAt: new Date() })
        .where(eq(requirementVersions.id, existingVersion.id));
      requirementVersionIdByGuid.set(requirement.stableKey, existingVersion.id);
      updated++;

      await recordAudit(db, {
        entityType: "requirement_version",
        entityId: existingVersion.id,
        action: "text_changed",
        actor: "ingestion:parse",
        metadata: { sourceRequirementId: requirement.sourceRequirementId },
        changes: {
          contentHash: { from: existingVersion.contentHash, to: contentHash },
          level: { from: existingVersion.level, to: requirement.level },
        },
      });
    }
  }

  // --- applicability -------------------------------------------------------
  const questionIdByGuid = await writeQuestions(db, params, parsed);
  const linksWritten = await writeApplicabilityLinks(
    db,
    parsed,
    requirementVersionIdByGuid,
    questionIdByGuid,
  );

  // --- checklist -----------------------------------------------------------
  const itemsWritten = await writeChecklist(db, params, parsed, requirementVersionIdByGuid);

  const result: ParseChecklistResult = {
    parsed,
    sectionsWritten: sectionIdByGuid.size,
    requirementsCreated: created,
    requirementsUpdated: updated,
    requirementsUnchanged: unchanged,
    questionsWritten: questionIdByGuid.size,
    applicabilityLinksWritten: linksWritten,
    checklistItemsWritten: itemsWritten,
  };

  ctx.count({
    sections: result.sectionsWritten,
    requirementsCreated: created,
    requirementsUpdated: updated,
    requirementsUnchanged: unchanged,
    questions: result.questionsWritten,
    applicabilityLinks: linksWritten,
    checklistItems: itemsWritten,
  });

  await ctx.info(
    `Persisted: ${created} new, ${updated} changed, ${unchanged} unchanged requirements; ` +
      `${linksWritten} applicability links; ${itemsWritten} checklist items`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

async function writeSections(
  db: Database,
  params: ParseChecklistParams,
  parsed: ParsedChecklist,
): Promise<Map<string, string>> {
  const idByGuid = new Map<string, string>();

  // Two passes: parents must exist before children can reference them.
  const ordered = [...parsed.sections].sort((a, b) => a.depth - b.depth);

  for (const section of ordered) {
    const fields = {
      standardVersionId: params.standardVersionId,
      documentId: params.documentId,
      sourceGuid: section.sourceGuid,
      sourceIdentifier: section.sourceIdentifier,
      title: section.title,
      body: section.body,
      depth: section.depth,
      sectionOrder: section.sectionOrder,
      parentId: section.parentGuid ? (idByGuid.get(section.parentGuid) ?? null) : null,
    };

    const [existing] = await db
      .select()
      .from(standardSections)
      .where(
        and(
          eq(standardSections.standardVersionId, params.standardVersionId),
          eq(standardSections.sourceGuid, section.sourceGuid),
        ),
      );

    if (existing) {
      await db
        .update(standardSections)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(standardSections.id, existing.id));
      idByGuid.set(section.sourceGuid, existing.id);
    } else {
      const [row] = await db
        .insert(standardSections)
        .values(fields)
        .returning({ id: standardSections.id });
      idByGuid.set(section.sourceGuid, row!.id);
    }
  }

  return idByGuid;
}

async function writeQuestions(
  db: Database,
  params: ParseChecklistParams,
  parsed: ParsedChecklist,
): Promise<Map<string, string>> {
  const idByGuid = new Map<string, string>();

  for (const question of parsed.questions) {
    const fields = {
      standardVersionId: params.standardVersionId,
      sourceGuid: question.sourceGuid,
      sourceNumber: question.sourceNumber,
      questionText: question.questionText,
      justificationTemplate: question.justificationTemplate,
      displayOrder: question.displayOrder,
      // Every scoping question in IFA v6 is phrased so that "no" removes the
      // linked criteria. Stored per row rather than assumed, so a future
      // question phrased the other way is a data change, not a code change.
      exemptingAnswer: "no" as const,
    };

    const [existing] = await db
      .select()
      .from(applicabilityQuestions)
      .where(
        and(
          eq(applicabilityQuestions.standardVersionId, params.standardVersionId),
          eq(applicabilityQuestions.sourceGuid, question.sourceGuid),
        ),
      );

    if (existing) {
      await db
        .update(applicabilityQuestions)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(applicabilityQuestions.id, existing.id));
      idByGuid.set(question.sourceGuid, existing.id);
    } else {
      const [row] = await db
        .insert(applicabilityQuestions)
        .values(fields)
        .returning({ id: applicabilityQuestions.id });
      idByGuid.set(question.sourceGuid, row!.id);
    }
  }

  return idByGuid;
}

async function writeApplicabilityLinks(
  db: Database,
  parsed: ParsedChecklist,
  requirementVersionIdByGuid: ReadonlyMap<string, string>,
  questionIdByGuid: ReadonlyMap<string, string>,
): Promise<number> {
  const naExemptByGuid = new Map(
    parsed.requirements.map((r) => [r.stableKey, r.naExempt] as const),
  );

  let written = 0;

  for (const link of parsed.applicabilityLinks) {
    const requirementVersionId = requirementVersionIdByGuid.get(link.requirementStableKey);
    const questionId = questionIdByGuid.get(link.questionGuid);
    if (!requirementVersionId || !questionId) continue;

    const fields = {
      requirementVersionId,
      questionId,
      source: "globalgap_official" as const,
      neverExempt: naExemptByGuid.get(link.requirementStableKey) ?? false,
      evidence: [...link.evidence],
    };

    const [existing] = await db
      .select()
      .from(requirementApplicability)
      .where(
        and(
          eq(requirementApplicability.requirementVersionId, requirementVersionId),
          eq(requirementApplicability.questionId, questionId),
        ),
      );

    if (existing) {
      await db
        .update(requirementApplicability)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(requirementApplicability.id, existing.id));
    } else {
      await db.insert(requirementApplicability).values(fields);
    }
    written++;
  }

  return written;
}

async function writeChecklist(
  db: Database,
  params: ParseChecklistParams,
  parsed: ParsedChecklist,
  requirementVersionIdByGuid: ReadonlyMap<string, string>,
): Promise<number> {
  if (parsed.checklistItems.length === 0) return 0;

  const slug = `${params.documentSlug}-items`;

  const [existingChecklist] = await db
    .select()
    .from(checklists)
    .where(eq(checklists.slug, slug));

  let checklistId: string;
  if (existingChecklist) {
    checklistId = existingChecklist.id;
  } else {
    const [row] = await db
      .insert(checklists)
      .values({
        standardVersionId: params.standardVersionId,
        documentId: params.documentId,
        slug,
        title: params.documentTitle,
        sourceSheet: parsed.checklistItems[0]?.sourceLocation.kind === "xlsx"
          ? parsed.checklistItems[0].sourceLocation.sheet
          : null,
      })
      .returning({ id: checklists.id });
    checklistId = row!.id;
  }

  // The visible checklist is a rendering of the criteria table, so rebuilding
  // it wholesale is both simpler and safer than diffing rows: there is no
  // independent state on an item to preserve.
  await db.delete(checklistItems).where(eq(checklistItems.checklistId, checklistId));

  const rows = parsed.checklistItems
    .map((item) => ({
      checklistId,
      requirementVersionId: item.sourceGuid
        ? (requirementVersionIdByGuid.get(item.sourceGuid) ?? null)
        : null,
      sourceGuid: item.sourceGuid,
      sourceIdentifier: item.sourceIdentifier,
      questionText: item.questionText,
      criteriaText: item.criteriaText,
      responseOptions: item.responseOptions,
      isHeader: item.isHeader,
      displayOrder: item.displayOrder,
      sourceLocation: item.sourceLocation,
    }))
    // The unique index on (checklist, source_guid) treats nulls as distinct, so
    // header rows coexist, but duplicate criterion GUIDs must not.
    .filter((row, index, all) =>
      row.sourceGuid === null
        ? true
        : all.findIndex((other) => other.sourceGuid === row.sourceGuid) === index,
    );

  if (rows.length > 0) await db.insert(checklistItems).values(rows);

  return rows.length;
}
