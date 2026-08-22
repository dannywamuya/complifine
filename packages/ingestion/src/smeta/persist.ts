/**
 * Persist parsed ETI / SMETA requirements into the universal tables.
 */

import { createHash } from "node:crypto";
import { and, eq, type Database } from "@complifine/db";
import {
  requirements,
  requirementVersions,
  standardSections,
} from "@complifine/db";
import { normalizeForComparison } from "@complifine/core";
import type { ParsedEtiClause } from "./eti-parser.ts";
import {
  etiSortKey,
  etiStableKey,
} from "./eti-clauses.ts";
import type { ParsedWorkplaceRequirement } from "./workplace-requirements.ts";
import { workplaceSortKey, workplaceStableKey } from "./workplace-requirements.ts";

function hashOf(principle: string, criteria: string, level: string): string {
  return createHash("sha256")
    .update(normalizeForComparison(principle))
    .update("\u0000")
    .update(normalizeForComparison(criteria))
    .update("\u0000")
    .update(level)
    .digest("hex");
}

async function upsertSection(
  db: Database,
  standardVersionId: string,
  documentId: string,
  number: string,
  title: string,
  parentId: string | null,
): Promise<string> {
  const identifier = `ETI ${number}`;
  const sourceGuid = `eti:${number}`;
  const [existing] = await db
    .select()
    .from(standardSections)
    .where(
      and(
        eq(standardSections.standardVersionId, standardVersionId),
        eq(standardSections.sourceGuid, sourceGuid),
      ),
    );

  if (existing) {
    await db
      .update(standardSections)
      .set({ title, parentId, sourceIdentifier: identifier, updatedAt: new Date() })
      .where(eq(standardSections.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(standardSections)
    .values({
      standardVersionId,
      documentId,
      sourceGuid,
      sourceIdentifier: identifier,
      title,
      parentId,
      depth: parentId ? 2 : 1,
      sectionOrder: etiSortKey(number),
    })
    .returning({ id: standardSections.id });
  return row!.id;
}

async function upsertRequirement(params: {
  db: Database;
  standardId: string;
  standardVersionId: string;
  documentId: string;
  sectionId: string | null;
  stableKey: string;
  sourceRequirementId: string;
  sortKey: number;
  principleText: string;
  criteriaText: string;
  level: string;
  page: number;
  excerpt: string;
}): Promise<"created" | "updated" | "unchanged"> {
  const { db } = params;
  const contentHash = hashOf(params.principleText, params.criteriaText, params.level);

  const [identity] = await db
    .select()
    .from(requirements)
    .where(
      and(eq(requirements.standardId, params.standardId), eq(requirements.stableKey, params.stableKey)),
    );

  let requirementId = identity?.id;
  if (!requirementId) {
    const [created] = await db
      .insert(requirements)
      .values({
        standardId: params.standardId,
        stableKey: params.stableKey,
        latestSourceIdentifier: params.sourceRequirementId,
      })
      .returning({ id: requirements.id });
    requirementId = created!.id;
  } else {
    await db
      .update(requirements)
      .set({ latestSourceIdentifier: params.sourceRequirementId, updatedAt: new Date() })
      .where(eq(requirements.id, requirementId));
  }

  const [version] = await db
    .select()
    .from(requirementVersions)
    .where(
      and(
        eq(requirementVersions.standardVersionId, params.standardVersionId),
        eq(requirementVersions.requirementId, requirementId),
      ),
    );

  const values = {
    requirementId,
    standardVersionId: params.standardVersionId,
    documentId: params.documentId,
    sourceRequirementId: params.sourceRequirementId,
    sortKey: params.sortKey,
    sectionId: params.sectionId,
    principleText: params.principleText,
    criteriaText: params.criteriaText,
    level: params.level,
    sourcePage: params.page,
    sourceExcerpt: params.excerpt,
    contentHash,
    status: "extracted" as const,
  };

  if (!version) {
    await db.insert(requirementVersions).values(values);
    return "created";
  }
  if (version.contentHash === contentHash) return "unchanged";
  await db
    .update(requirementVersions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(requirementVersions.id, version.id));
  return "updated";
}

export async function persistEtiClauses(
  db: Database,
  params: {
    standardId: string;
    standardVersionId: string;
    documentId: string;
    clauses: readonly ParsedEtiClause[];
  },
): Promise<{ created: number; updated: number; unchanged: number }> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const sectionIds = new Map<string, string>();

  for (const clause of params.clauses.filter((c) => !c.parentNumber)) {
    const id = await upsertSection(
      db,
      params.standardVersionId,
      params.documentId,
      clause.number,
      clause.title,
      null,
    );
    sectionIds.set(clause.number, id);
  }
  for (const clause of params.clauses.filter((c) => c.parentNumber)) {
    const parentId = clause.parentNumber ? (sectionIds.get(clause.parentNumber) ?? null) : null;
    const id = await upsertSection(
      db,
      params.standardVersionId,
      params.documentId,
      clause.number,
      clause.title,
      parentId,
    );
    sectionIds.set(clause.number, id);
  }

  for (const clause of params.clauses) {
    const outcome = await upsertRequirement({
      db,
      standardId: params.standardId,
      standardVersionId: params.standardVersionId,
      documentId: params.documentId,
      sectionId: sectionIds.get(clause.parentNumber ?? clause.number) ?? null,
      stableKey: etiStableKey(clause.number),
      sourceRequirementId: `ETI ${clause.number}`,
      sortKey: etiSortKey(clause.number),
      principleText: clause.title,
      criteriaText: clause.body,
      level: "eti_clause",
      page: clause.startPage,
      excerpt: clause.excerpt,
    });
    if (outcome === "created") created++;
    else if (outcome === "updated") updated++;
    else unchanged++;
  }

  return { created, updated, unchanged };
}

export async function persistWorkplaceRequirements(
  db: Database,
  params: {
    standardId: string;
    standardVersionId: string;
    documentId: string;
    edition: string;
    items: readonly ParsedWorkplaceRequirement[];
  },
): Promise<{ created: number; skippedPillar: number }> {
  let created = 0;
  let skippedPillar = 0;

  for (const item of params.items) {
    if (params.edition === "2-pillar" && item.pillar === "4-pillar") {
      skippedPillar++;
      continue;
    }
    const outcome = await upsertRequirement({
      db,
      standardId: params.standardId,
      standardVersionId: params.standardVersionId,
      documentId: params.documentId,
      sectionId: null,
      stableKey: workplaceStableKey(item.number),
      sourceRequirementId: `SMETA ${item.number}`,
      sortKey: workplaceSortKey(item.number),
      principleText: item.title,
      criteriaText: item.body,
      level: item.level,
      page: item.startPage,
      excerpt: item.body.slice(0, 280),
    });
    if (outcome === "created" || outcome === "updated") created++;
  }

  return { created, skippedPillar };
}
