/**
 * GLOBALG.A.P. IFA adapter: official checklist workbook → universal model.
 */

import { and, eq, isNotNull, type Database } from "@complifine/db";
import { standardDocuments } from "@complifine/db";
import { parseChecklistDocument } from "../steps/parse-checklist.ts";
import type { JobContext } from "../jobs.ts";
import type { AdapterVersion, StandardAdapter } from "./types.ts";
import { asGgapEdition } from "./types.ts";

export const globalGapAdapter: StandardAdapter = {
  standardCode: "globalgap-ifa",

  async ingest(db: Database, ctx: JobContext, version: AdapterVersion) {
    const [checklist] = await db
      .select()
      .from(standardDocuments)
      .where(
        and(
          eq(standardDocuments.standardVersionId, version.id),
          eq(standardDocuments.documentType, "checklist"),
          isNotNull(standardDocuments.storageKey),
        ),
      );

    if (!checklist?.storageKey) {
      await ctx.warn(`${version.code}: no fetched checklist, skipping`);
      return { skipped: true };
    }

    return parseChecklistDocument(db, ctx, {
      standardId: version.standardId,
      standardVersionId: version.id,
      documentId: checklist.id,
      documentSlug: checklist.slug,
      documentTitle: checklist.title,
      storageKey: checklist.storageKey,
      edition: asGgapEdition(version.edition),
    });
  },
};
