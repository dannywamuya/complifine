/**
 * Step 2: acquire and preserve the source files.
 *
 * Preservation before parsing is a deliberate ordering (PRD section 19 step 2).
 * The original bytes are the evidence; everything downstream is derived and
 * can be regenerated. If a document later disappears from the publisher's
 * site - which happens, the fruit and vegetables page already links a
 * superseded revision of the CB rules - the copy under `storage/` is what
 * keeps the knowledge base reproducible.
 */

import { eq, type Database } from "@complifine/db";
import { standardDocuments, standards, standardVersions } from "@complifine/db";
import { parseGlobalGapFilename } from "@complifine/core";
import { fetchDocument, headDocument, loadLocalDocument, validateMagicBytes } from "../fetch.ts";
import { storeSourceFile, verifyStoredFile } from "../storage.ts";
import { findDocument, resolveChannel } from "../manifest.ts";
import type { JobContext } from "../jobs.ts";
import { recordAudit } from "../audit.ts";

export interface FetchOptions {
  /** Limit to specific document slugs. Empty means all registered documents. */
  readonly slugs?: readonly string[];
  /** Re-download even when the stored hash still matches the origin. */
  readonly force?: boolean;
  /** Directory that `localPath` entries resolve against. */
  readonly localBaseDir: string;
}

export interface FetchSummary {
  readonly downloaded: number;
  readonly unchanged: number;
  readonly changed: number;
  readonly failed: number;
  readonly failures: ReadonlyArray<{ slug: string; error: string }>;
  /** Documents the publisher has withdrawn, which failed as expected. */
  readonly withdrawn: ReadonlyArray<{ slug: string; error: string }>;
}

export async function fetchDocuments(
  db: Database,
  ctx: JobContext,
  options: FetchOptions,
): Promise<FetchSummary> {
  const rows = await db.select().from(standardDocuments);
  const targets = options.slugs?.length
    ? rows.filter((r) => options.slugs!.includes(r.slug))
    : rows;

  if (options.slugs?.length) {
    const missing = options.slugs.filter((slug) => !rows.some((r) => r.slug === slug));
    if (missing.length) {
      throw new Error(
        `Unknown document slug(s): ${missing.join(", ")}. Run \`bun run kb registry\` or check sources/manifest.`,
      );
    }
  }

  let downloaded = 0;
  let unchanged = 0;
  let changed = 0;
  const failures: Array<{ slug: string; error: string }> = [];
  const withdrawn: Array<{ slug: string; error: string }> = [];

  for (const row of targets) {
    try {
      const outcome = await fetchOne(db, ctx, row, options);
      if (outcome === "downloaded") downloaded++;
      else if (outcome === "changed") {
        downloaded++;
        changed++;
      } else unchanged++;
    } catch (error) {
      const message = (error as Error).message;

      // A document the manifest already records as withdrawn is expected to
      // fail. Treating it as an error would mean the pipeline never runs
      // clean, and a pipeline that always shows one red line is a pipeline
      // whose red lines stop being read.
      const isWithdrawnDocument =
        findDocument(row.slug)?.availability === "withdrawn" ||
        row.metadata.availability === "withdrawn";

      if (isWithdrawnDocument) {
        withdrawn.push({ slug: row.slug, error: message });
        await ctx.warn(
          `${row.slug} is unavailable, as the manifest records. Skipping.`,
          { reason: message.split("\n")[0] },
        );
        continue;
      }

      failures.push({ slug: row.slug, error: message });
      await ctx.error(`Failed to fetch ${row.slug}`, { error: message });
      await db
        .update(standardDocuments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(standardDocuments.id, row.id));
    }
  }

  const summary: FetchSummary = {
    downloaded,
    unchanged,
    changed,
    failed: failures.length,
    failures,
    withdrawn,
  };

  ctx.count({
    downloaded,
    unchanged,
    changed,
    failed: failures.length,
    withdrawn: withdrawn.length,
  });
  await ctx.info(
    `Fetch complete: ${downloaded} downloaded (${changed} content changes), ${unchanged} unchanged, ` +
      `${failures.length} failed, ${withdrawn.length} withdrawn by the publisher`,
  );

  return summary;
}

type Outcome = "downloaded" | "unchanged" | "changed";

async function fetchOne(
  db: Database,
  ctx: JobContext,
  row: typeof standardDocuments.$inferSelect,
  options: FetchOptions,
): Promise<Outcome> {
  const manifestEntry = findDocument(row.slug);
  const channel = manifestEntry ? resolveChannel(manifestEntry) : row.channel;
  const localPath = manifestEntry?.localPath ?? (row.metadata.localPath as string | null);

  if (channel === "member_gated") {
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    if (!localPath || !existsSync(resolve(options.localBaseDir, localPath))) {
      await ctx.info(
        `${row.slug} is member-gated and no local file is present. Skipping (not an error).`,
      );
      return "unchanged";
    }
  }
  const parsed = parseGlobalGapFilename(row.filename);

  // --- cheap change detection ---------------------------------------------
  // A HEAD request settles the common case - nothing changed - for a few bytes
  // rather than a megabyte. Only run it when we already hold a verified copy.
  if (!options.force && !localPath && row.fileHash && row.storageKey && row.sourceUrl) {
    const stillIntact = await verifyStoredFile(row.storageKey, row.fileHash);

    if (stillIntact) {
      try {
        const head = await headDocument(row.sourceUrl);
        const sameSize = head.byteSize !== null && head.byteSize === row.byteSize;
        const sameEtag = head.etag !== null && head.etag === row.etag;

        if (head.ok && (sameEtag || sameSize)) {
          await ctx.debug(`Unchanged at origin: ${row.slug}`);
          return "unchanged";
        }
      } catch (error) {
        // A HEAD failure is not a reason to skip the document; fall through to
        // a full download, which has its own retry and mirror handling.
        await ctx.debug(`HEAD failed for ${row.slug}, downloading in full`, {
          error: (error as Error).message,
        });
      }
    } else {
      await ctx.warn(
        `Stored copy of ${row.slug} does not match its recorded hash. Re-downloading.`,
        { storageKey: row.storageKey },
      );
    }
  }

  // --- acquire -------------------------------------------------------------
  const result = localPath
    ? await loadLocalDocument(localPath, options.localBaseDir)
    : await fetchDocument(row.sourceUrl!, { mirrorUrl: row.mirrorUrl });

  validateMagicBytes(result.bytes, parsed.extension);

  const contentChanged = row.fileHash !== null && row.fileHash !== result.hash;
  if (contentChanged) {
    await ctx.warn(`Content changed at origin: ${row.slug}`, {
      previousHash: row.fileHash,
      newHash: result.hash,
      previousBytes: row.byteSize,
      newBytes: result.byteSize,
    });
  }

  // --- preserve ------------------------------------------------------------
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.id, row.standardVersionId));

  const [standard] = version
    ? await db.select().from(standards).where(eq(standards.id, version.standardId))
    : [];

  const stored = await storeSourceFile({
    standardSlug: standard?.code ?? "unknown-standard",
    scopeSlug: version?.scope ?? "unscoped",
    versionSlug: version?.code ?? "unversioned",
    extension: parsed.extension,
    bytes: result.bytes,
  });

  await db
    .update(standardDocuments)
    .set({
      fileHash: stored.hash,
      byteSize: stored.byteSize,
      mimeType: result.mimeType,
      storageKey: stored.key,
      lastModifiedHeader: result.lastModified,
      etag: result.etag,
      retrievedAt: new Date(),
      status: "fetched",
      updatedAt: new Date(),
    })
    .where(eq(standardDocuments.id, row.id));

  await recordAudit(db, {
    entityType: "standard_document",
    entityId: row.id,
    action: contentChanged ? "content_changed" : "fetched",
    actor: "ingestion:fetch",
    metadata: {
      slug: row.slug,
      hash: stored.hash,
      bytes: stored.byteSize,
      resolvedFrom: result.resolvedFrom,
    },
    ...(contentChanged
      ? { changes: { fileHash: { from: row.fileHash, to: stored.hash } } }
      : {}),
  });

  await ctx.info(
    `${contentChanged ? "Updated" : "Fetched"} ${row.slug} (${formatBytes(stored.byteSize)})`,
    { hash: stored.hash.slice(0, 12), from: result.resolvedFrom },
  );

  return contentChanged ? "changed" : "downloaded";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
