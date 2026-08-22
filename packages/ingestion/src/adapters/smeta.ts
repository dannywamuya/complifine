/**
 * SMETA adapter: ETI Base Code (always) + Workplace Requirements (when dropped).
 */

import { existsSync } from "node:fs";
import { eq, type Database } from "@complifine/db";
import { standardDocuments } from "@complifine/db";
import { extractPdf } from "../pdf/extract.ts";
import { readStoredFile } from "../storage.ts";
import { parseEtiBaseCode } from "../smeta/eti-parser.ts";
import { parseWorkplaceRequirements } from "../smeta/workplace-requirements.ts";
import { persistEtiClauses, persistWorkplaceRequirements } from "../smeta/persist.ts";
import type { JobContext } from "../jobs.ts";
import type { AdapterVersion, StandardAdapter } from "./types.ts";

export const smetaAdapter: StandardAdapter = {
  standardCode: "smeta",

  async ingest(db: Database, ctx: JobContext, version: AdapterVersion) {
    const documents = await db
      .select()
      .from(standardDocuments)
      .where(eq(standardDocuments.standardVersionId, version.id));

    const eti = documents.find((d) => d.documentType === "base_code");
    const wr = documents.find((d) => d.documentType === "principles_and_criteria");

    const result: Record<string, unknown> = {};

    if (eti?.storageKey) {
      const bytes = await readStoredFile(eti.storageKey);
      const pdf = await extractPdf(bytes);
      const parsed = parseEtiBaseCode(pdf.pages);
      const persisted = await persistEtiClauses(db, {
        standardId: version.standardId,
        standardVersionId: version.id,
        documentId: eti.id,
        clauses: parsed.clauses,
      });
      result.eti = { ...persisted, unmatched: parsed.unmatchedHeadings };
      await ctx.info(
        `ETI Base Code: ${persisted.created} created, ${persisted.updated} updated, ${persisted.unchanged} unchanged` +
          (parsed.unmatchedHeadings.length
            ? ` (${parsed.unmatchedHeadings.length} headings not located in the PDF)`
            : ""),
      );
    } else {
      await ctx.warn(`${version.code}: ETI Base Code not fetched`);
    }

    if (wr?.storageKey) {
      const bytes = await readStoredFile(wr.storageKey);
      const pdf = await extractPdf(bytes);
      const items = parseWorkplaceRequirements(pdf.pages);
      const persisted = await persistWorkplaceRequirements(db, {
        standardId: version.standardId,
        standardVersionId: version.id,
        documentId: wr.id,
        edition: version.edition,
        items,
      });
      result.workplaceRequirements = { parsed: items.length, ...persisted };
      await ctx.info(
        `SMETA Workplace Requirements: ${items.length} parsed, ${persisted.created} written` +
          (persisted.skippedPillar ? `, ${persisted.skippedPillar} held for 4-pillar` : ""),
      );
    } else {
      await ctx.info(
        `${version.code}: Workplace Requirements not on disk (member-gated). ` +
          `Drop the official member PDF at storage/drops/smeta/ and re-run fetch.`,
      );
      result.workplaceRequirements = { skipped: true, reason: "member_gated" };
    }

    return result;
  },
};

/** True when the operator has placed the member WR file. */
export function workplaceRequirementsPresent(localPath: string): boolean {
  return existsSync(localPath);
}
