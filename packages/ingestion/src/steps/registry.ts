/**
 * Step 1: reconcile the checked-in manifest into the database.
 *
 * Idempotent by design. Running it repeatedly converges the database on the
 * manifest without disturbing anything already ingested: rows are matched on
 * their stable slug, and only fields the manifest owns are updated. Fields the
 * pipeline owns - hashes, storage keys, statuses, page counts - are never
 * touched here, so a registry sync can safely run against a published version.
 */

import { and, eq, type Database } from "@complifine/db";
import { standardDocuments, standards, standardVersions } from "@complifine/db";
import { parseGlobalGapFilename } from "@complifine/core";
import {
  MANIFEST,
  NON_AUTHORITATIVE_SOURCES,
  documentMirrorUrl,
  documentUrl,
  resolveChannel,
  type ManifestDocument,
} from "../manifest.ts";
import type { JobContext } from "../jobs.ts";
import { recordAudit } from "../audit.ts";

export interface RegistryResult {
  readonly standards: number;
  readonly versions: number;
  readonly documentsCreated: number;
  readonly documentsUpdated: number;
  readonly documentsUnchanged: number;
}

export async function syncRegistry(db: Database, ctx: JobContext): Promise<RegistryResult> {
  let versionCount = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const standard of MANIFEST) {
    const standardId = await upsertStandard(db, standard);

    for (const version of standard.versions) {
      versionCount++;

      const [existingVersion] = await db
        .select()
        .from(standardVersions)
        .where(eq(standardVersions.code, version.code));

      let versionId: string;
      if (existingVersion) {
        versionId = existingVersion.id;
        await db
          .update(standardVersions)
          .set({
            name: version.name,
            edition: version.edition,
            levelScheme: version.levelScheme ?? defaultLevelScheme(version.edition),
            version: version.version,
            scope: version.scope,
            effectiveDate: version.effectiveDate ?? null,
            mandatoryFrom: version.mandatoryFrom ?? null,
            replacesLabel: version.replacesLabel ?? null,
            updatedAt: new Date(),
          })
          .where(eq(standardVersions.id, versionId));
      } else {
        const [row] = await db
          .insert(standardVersions)
          .values({
            standardId,
            code: version.code,
            name: version.name,
            edition: version.edition,
            levelScheme: version.levelScheme ?? defaultLevelScheme(version.edition),
            version: version.version,
            scope: version.scope,
            status: "draft",
            effectiveDate: version.effectiveDate ?? null,
            mandatoryFrom: version.mandatoryFrom ?? null,
            replacesLabel: version.replacesLabel ?? null,
          })
          .returning({ id: standardVersions.id });
        versionId = row!.id;
        await ctx.info(`Registered version ${version.code}`);
        await recordAudit(db, {
          entityType: "standard_version",
          entityId: versionId,
          action: "created",
          actor: "ingestion:registry",
          metadata: { code: version.code },
        });
      }

      for (const document of version.documents) {
        const outcome = await upsertDocument(db, ctx, versionId, document);
        if (outcome === "created") created++;
        else if (outcome === "updated") updated++;
        else unchanged++;
      }
    }
  }

  // Non-authoritative sources attach to the first version purely so they have
  // somewhere to live. Their authority level is what governs how they are
  // used, and it excludes them from every requirement query.
  const [anchorVersion] = await db.select().from(standardVersions).limit(1);
  if (anchorVersion) {
    for (const document of NON_AUTHORITATIVE_SOURCES) {
      const outcome = await upsertDocument(db, ctx, anchorVersion.id, document);
      if (outcome === "created") created++;
      else if (outcome === "updated") updated++;
      else unchanged++;
    }
  }

  const result: RegistryResult = {
    standards: MANIFEST.length,
    versions: versionCount,
    documentsCreated: created,
    documentsUpdated: updated,
    documentsUnchanged: unchanged,
  };

  ctx.count({ ...result });
  await ctx.info(
    `Registry synced: ${created} created, ${updated} updated, ${unchanged} unchanged`,
  );

  return result;
}

async function upsertStandard(
  db: Database,
  standard: (typeof MANIFEST)[number],
): Promise<string> {
  const [existing] = await db.select().from(standards).where(eq(standards.code, standard.code));

  if (existing) {
    await db
      .update(standards)
      .set({
        name: standard.name,
        publisher: standard.publisher,
        description: standard.description,
        homepageUrl: standard.homepageUrl,
        updatedAt: new Date(),
      })
      .where(eq(standards.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(standards)
    .values({
      code: standard.code,
      name: standard.name,
      publisher: standard.publisher,
      description: standard.description,
      homepageUrl: standard.homepageUrl,
    })
    .returning({ id: standards.id });

  return row!.id;
}

function defaultLevelScheme(edition: string): string {
  if (edition === "2-pillar" || edition === "4-pillar") return "smeta_7";
  return "globalgap_ifa";
}

async function upsertDocument(
  db: Database,
  ctx: JobContext,
  standardVersionId: string,
  document: ManifestDocument,
): Promise<"created" | "updated" | "unchanged"> {
  const parsed = parseGlobalGapFilename(document.filename);

  const manifestFields = {
    documentType: document.documentType,
    authorityLevel: document.authorityLevel,
    title: document.title,
    documentCode: document.documentCode ?? null,
    language: document.language ?? parsed.language,
    filename: document.filename,
    channel: resolveChannel(document),
    sourceUrl: documentUrl(document),
    mirrorUrl: documentMirrorUrl(document),
    publishedAt: document.publishedAt ?? parsed.fileDate,
    validFrom: document.validFrom ?? null,
    licenseNote: document.licenseNote ?? null,
    metadata: {
      note: document.note ?? null,
      localPath: document.localPath ?? null,
      availability: document.availability ?? "available",
      // Parsed from the filename convention. `versionDate` is the version the
      // file contains, which is not the same as when the file was generated -
      // the Smart checklist is a March 2024 file carrying the Sep 2022 version.
      filenameVersion: parsed.version,
      filenameVersionDate: parsed.versionDate,
      filenameDate: parsed.fileDate,
      isProtected: parsed.isProtected,
      extension: parsed.extension,
    } as Record<string, unknown>,
  };

  const [existing] = await db
    .select()
    .from(standardDocuments)
    .where(eq(standardDocuments.slug, document.slug));

  if (!existing) {
    await db.insert(standardDocuments).values({
      standardVersionId,
      slug: document.slug,
      status: "registered",
      ...manifestFields,
    });
    await ctx.info(`Registered document ${document.slug}`);
    return "created";
  }

  const changed = Object.entries(manifestFields).some(([key, value]) => {
    const current = (existing as Record<string, unknown>)[key];
    return JSON.stringify(current) !== JSON.stringify(value);
  });

  if (!changed) return "unchanged";

  await db
    .update(standardDocuments)
    .set({ ...manifestFields, updatedAt: new Date() })
    .where(eq(standardDocuments.id, existing.id));

  await recordAudit(db, {
    entityType: "standard_document",
    entityId: existing.id,
    action: "updated",
    actor: "ingestion:registry",
    metadata: { slug: document.slug },
  });

  return "updated";
}

/** Look up a registered document by slug. Throws with guidance when missing. */
export async function requireDocument(db: Database, slug: string) {
  const [row] = await db
    .select()
    .from(standardDocuments)
    .where(eq(standardDocuments.slug, slug));

  if (!row) {
    throw new Error(
      `Document "${slug}" is not registered. Run \`bun run kb registry\` first.`,
    );
  }
  return row;
}

/** Documents of a given type belonging to a version, excluding superseded ones. */
export async function documentsOfType(
  db: Database,
  standardVersionId: string,
  documentType: (typeof standardDocuments.$inferSelect)["documentType"],
) {
  return db
    .select()
    .from(standardDocuments)
    .where(
      and(
        eq(standardDocuments.standardVersionId, standardVersionId),
        eq(standardDocuments.documentType, documentType),
      ),
    );
}
