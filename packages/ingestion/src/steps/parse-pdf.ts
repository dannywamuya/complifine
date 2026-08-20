/**
 * Step 4: read the PDFs.
 *
 * Two distinct jobs, deliberately separate:
 *
 *   `mapRequirementPages` backfills page provenance onto requirements already
 *   imported from the workbook, and in doing so verifies that each one really
 *   appears in the authoritative standard.
 *
 *   `parseProseDocument` imports long-form documents - the General Regulations
 *   and the guideline - as a section tree, since those contain no criteria but
 *   plenty of rules a producer needs to find.
 */

import { and, eq, isNull, type Database } from "@complifine/db";
import {
  requirementVersions,
  standardDocuments,
  standardSections,
} from "@complifine/db";
import type { Edition } from "@complifine/core";
import { extractPdf } from "../pdf/extract.ts";
import { buildPageMap, type PageMap } from "../pdf/page-map.ts";
import { parseProseSections } from "../pdf/section-parser.ts";
import { readStoredFile } from "../storage.ts";
import type { JobContext } from "../jobs.ts";

// ---------------------------------------------------------------------------
// Page mapping
// ---------------------------------------------------------------------------

export interface MapPagesParams {
  readonly standardVersionId: string;
  readonly documentId: string;
  readonly storageKey: string;
  readonly edition: Edition;
}

export interface MapPagesResult {
  readonly pageCount: number;
  readonly mapped: number;
  readonly unmapped: readonly string[];
  readonly lowCoverage: ReadonlyArray<{ id: string; page: number; coverage: number }>;
  readonly unmatchedInPdf: readonly string[];
  readonly meanCoverage: number;
  readonly pageMap: PageMap;
}

export async function mapRequirementPages(
  db: Database,
  ctx: JobContext,
  params: MapPagesParams,
): Promise<MapPagesResult> {
  const bytes = await readStoredFile(params.storageKey);
  const pdf = await extractPdf(bytes);

  await ctx.debug(`Extracted ${pdf.pageCount} pages`);

  const rows = await db
    .select({
      id: requirementVersions.id,
      sourceRequirementId: requirementVersions.sourceRequirementId,
      principleText: requirementVersions.principleText,
      criteriaText: requirementVersions.criteriaText,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, params.standardVersionId));

  if (rows.length === 0) {
    throw new Error(
      "No requirements to map. Run `bun run kb parse` before mapping PDF pages.",
    );
  }

  const pageMap = buildPageMap(pdf, rows, params.edition);

  let mapped = 0;
  let coverageSum = 0;
  const unmapped: string[] = [];
  const lowCoverage: Array<{ id: string; page: number; coverage: number }> = [];

  for (const row of rows) {
    const location = pageMap.locations.get(row.sourceRequirementId);

    if (!location) {
      unmapped.push(row.sourceRequirementId);
      continue;
    }

    coverageSum += location.coverage;
    if (location.textMissing) {
      lowCoverage.push({
        id: row.sourceRequirementId,
        page: location.page,
        coverage: location.coverage,
      });
    }

    await db
      .update(requirementVersions)
      .set({ sourcePage: location.page })
      .where(eq(requirementVersions.id, row.id));

    mapped++;
  }

  await db
    .update(standardDocuments)
    .set({ pageCount: pdf.pageCount, status: "parsed", updatedAt: new Date() })
    .where(eq(standardDocuments.id, params.documentId));

  const meanCoverage = mapped > 0 ? coverageSum / mapped : 0;

  const result: MapPagesResult = {
    pageCount: pdf.pageCount,
    mapped,
    unmapped,
    lowCoverage,
    unmatchedInPdf: pageMap.unmatchedInPdf,
    meanCoverage,
    pageMap,
  };

  ctx.count({
    pageCount: pdf.pageCount,
    mapped,
    unmapped: unmapped.length,
    lowCoverage: lowCoverage.length,
    meanCoverage: Number(meanCoverage.toFixed(4)),
  });

  if (unmapped.length > 0) {
    await ctx.warn(`${unmapped.length} requirements not found in the PDF`, {
      examples: unmapped.slice(0, 10),
    });
  }
  if (lowCoverage.length > 0) {
    await ctx.warn(`${lowCoverage.length} requirements matched an identifier but little text`, {
      examples: lowCoverage.slice(0, 5),
    });
  }

  await ctx.info(
    `Mapped ${mapped}/${rows.length} requirements to pages across ${pdf.pageCount} pages ` +
      `(mean text coverage ${(meanCoverage * 100).toFixed(1)}%)`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Prose documents
// ---------------------------------------------------------------------------

export interface ParseProseParams {
  readonly standardVersionId: string;
  readonly documentId: string;
  readonly storageKey: string;
  /** Prefix that keeps section GUIDs unique across the version's documents. */
  readonly guidPrefix: string;
}

export interface ParseProseResult {
  readonly pageCount: number;
  readonly sectionsWritten: number;
  readonly maxDepth: number;
}

export async function parseProseDocument(
  db: Database,
  ctx: JobContext,
  params: ParseProseParams,
): Promise<ParseProseResult> {
  const bytes = await readStoredFile(params.storageKey);
  const pdf = await extractPdf(bytes);
  const sections = parseProseSections(pdf);

  if (sections.length === 0) {
    await ctx.warn("No sections detected. The document may be scanned rather than text-based.");
  }

  // Rebuild wholesale. Prose sections are derived entirely from the file, hold
  // no independent state, and their synthetic GUIDs shift when headings change,
  // so diffing would leave orphans behind.
  await db
    .delete(standardSections)
    .where(eq(standardSections.documentId, params.documentId));

  const idByNumber = new Map<string, string>();
  let written = 0;
  let maxDepth = 0;

  // Depth first so that a parent is always inserted before its children, and
  // its row id is available when the child needs it.
  const ordered = sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => a.section.depth - b.section.depth || a.section.order - b.section.order);

  for (const { section, index } of ordered) {
    maxDepth = Math.max(maxDepth, section.depth);

    // The parser reports the parent it actually found rather than the one the
    // clause number implies, so a clause whose parent heading never appeared in
    // the extracted text is stored as a root instead of a dangling child.
    const parentId = section.parentNumber
      ? (idByNumber.get(section.parentNumber) ?? null)
      : null;

    if (section.parentNumber && !parentId) {
      throw new Error(
        `Parent ${section.parentNumber} of section ${section.number} was not inserted first. ` +
          "This is a bug in the section ordering, not in the source document.",
      );
    }

    // The document position guarantees uniqueness. Two unnumbered headings can
    // share a title - "General" appears in most of these documents - and a
    // title-derived key would silently drop the second one.
    const [row] = await db
      .insert(standardSections)
      .values({
        standardVersionId: params.standardVersionId,
        documentId: params.documentId,
        sourceGuid: `${params.guidPrefix}:${String(index).padStart(4, "0")}:${
          section.number ?? "unnumbered"
        }`,
        sourceIdentifier: section.number,
        title: section.title,
        body: section.body,
        depth: section.depth,
        sectionOrder: section.order,
        sourcePage: section.startPage,
        parentId,
      })
      .returning({ id: standardSections.id });

    if (row) {
      if (section.number) idByNumber.set(section.number, row.id);
      written++;
    }
  }

  await db
    .update(standardDocuments)
    .set({ pageCount: pdf.pageCount, status: "parsed", updatedAt: new Date() })
    .where(eq(standardDocuments.id, params.documentId));

  ctx.count({ pageCount: pdf.pageCount, sections: written, maxDepth });
  await ctx.info(
    `Parsed ${written} sections (max depth ${maxDepth}) from ${pdf.pageCount} pages`,
  );

  return { pageCount: pdf.pageCount, sectionsWritten: written, maxDepth };
}

/** Requirements still missing page provenance. Used by the quality gates. */
export async function requirementsMissingPages(db: Database, standardVersionId: string) {
  return db
    .select({
      id: requirementVersions.id,
      sourceRequirementId: requirementVersions.sourceRequirementId,
    })
    .from(requirementVersions)
    .where(
      and(
        eq(requirementVersions.standardVersionId, standardVersionId),
        isNull(requirementVersions.sourcePage),
      ),
    );
}
