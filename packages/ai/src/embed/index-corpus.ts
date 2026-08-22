/**
 * Building the retrieval index.
 *
 * Chunking and embedding are separate passes over separate tables, and the
 * separation is what makes re-running this cheap. Chunks are derived from the
 * knowledge base and rebuilt whenever it changes; embeddings are keyed by the
 * chunk's content hash, so a chunk whose text did not change keeps the vector
 * it already had. Re-indexing after an ingest that touched one document costs
 * one API call, not a rebuild of the corpus.
 */

import { and, eq, inArray, isNull, sql, type Database } from "@complifine/db";
import {
  chunkEmbeddings,
  documentChunks,
  requirementVersions,
  standardDocuments,
  standardSections,
  standardVersions,
} from "@complifine/db";
import { requirementLevelLabel } from "@complifine/core";
import {
  chunkProse,
  chunkRequirements,
  type PreparedChunk,
  type ProseChunkSource,
  type RequirementChunkSource,
} from "../chunking/index.ts";
import type { Embedder } from "./provider.ts";

export interface IndexOptions {
  /** Restrict to one standard version. */
  readonly versionCode?: string;
  /** Re-embed every chunk even when its content hash is unchanged. */
  readonly force?: boolean;
  readonly onProgress?: (message: string) => void;
}

export interface IndexReport {
  readonly versions: ReadonlyArray<{
    code: string;
    requirementChunks: number;
    proseChunks: number;
    chunksWritten: number;
    chunksDeleted: number;
  }>;
  readonly embedded: number;
  readonly reused: number;
  readonly model: string;
  readonly tokens: number | null;
}

// ---------------------------------------------------------------------------
// Chunking pass
// ---------------------------------------------------------------------------

/**
 * Breadcrumb for a section, walking up its parents.
 *
 * Built in memory from a single query rather than with a recursive CTE per
 * section: the whole section tree for a version is a few hundred rows.
 */
function buildPaths(
  sections: ReadonlyArray<{
    id: string;
    parentId: string | null;
    title: string;
    sourceIdentifier: string | null;
  }>,
): Map<string, string[]> {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const paths = new Map<string, string[]>();

  const label = (section: { title: string; sourceIdentifier: string | null }) =>
    section.sourceIdentifier ? `${section.sourceIdentifier} ${section.title}` : section.title;

  for (const section of sections) {
    const path: string[] = [];
    let cursor: typeof section | undefined = section;
    const guard = new Set<string>();

    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      path.unshift(label(cursor));
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }

    paths.set(section.id, path);
  }

  return paths;
}

async function chunkVersion(
  db: Database,
  version: { id: string; code: string },
  onProgress?: (message: string) => void,
) {
  const sections = await db
    .select({
      id: standardSections.id,
      documentId: standardSections.documentId,
      parentId: standardSections.parentId,
      title: standardSections.title,
      sourceIdentifier: standardSections.sourceIdentifier,
      body: standardSections.body,
      depth: standardSections.depth,
      sectionOrder: standardSections.sectionOrder,
      sourcePage: standardSections.sourcePage,
    })
    .from(standardSections)
    .where(eq(standardSections.standardVersionId, version.id));

  const paths = buildPaths(sections);

  const documents = await db
    .select()
    .from(standardDocuments)
    .where(eq(standardDocuments.standardVersionId, version.id));

  const documentById = new Map(documents.map((document) => [document.id, document]));

  // --- requirements -------------------------------------------------------
  const requirements = await db
    .select()
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, version.id));

  const pcDocument = documents.find((d) => d.documentType === "principles_and_criteria");
  if (!pcDocument) {
    throw new Error(
      `${version.code} has no Principles & Criteria document. Run \`bun run kb all\` first.`,
    );
  }

  const requirementSources: RequirementChunkSource[] = requirements.map((requirement) => ({
    requirementVersionId: requirement.id,
    sourceRequirementId: requirement.sourceRequirementId,
    levelLabel: requirementLevelLabel(requirement.level),
    principleText: requirement.principleText,
    criteriaText: requirement.criteriaText,
    sectionId: requirement.subsectionId ?? requirement.sectionId,
    sectionPath: paths.get(requirement.subsectionId ?? requirement.sectionId ?? "") ?? [],
    sourcePage: requirement.sourcePage,
    sortKey: requirement.sortKey,
  }));

  // Requirement chunks are attributed to the Principles & Criteria PDF, not to
  // the checklist they were parsed from. The PDF is authority level 1 and is
  // what a producer must be able to cite in an audit; the workbook is merely
  // the machine-readable route to the same words.
  const byDocument = new Map<string, PreparedChunk[]>();
  byDocument.set(pcDocument.id, chunkRequirements(requirementSources));

  // --- prose ---------------------------------------------------------------
  const proseByDocument = new Map<string, ProseChunkSource[]>();

  for (const section of sections) {
    // Sections derived from the checklist workbook carry no owning document;
    // only PDF-derived prose sections do, and only those are chunked here.
    const document = section.documentId ? documentById.get(section.documentId) : undefined;
    if (!document) continue;
    if (document.documentType !== "general_regulations" && document.documentType !== "guidance") {
      continue;
    }
    if (!section.body || section.body.trim().length === 0) continue;

    const path = paths.get(section.id) ?? [];
    const list = proseByDocument.get(document.id) ?? [];
    list.push({
      sectionId: section.id,
      identifier: section.sourceIdentifier,
      title: section.title,
      body: section.body,
      // The section's own label is the last element of its path.
      ancestorPath: path.slice(0, -1),
      sourcePage: section.sourcePage,
      order: section.sectionOrder,
    });
    proseByDocument.set(document.id, list);
  }

  for (const [documentId, proseSections] of proseByDocument) {
    byDocument.set(documentId, chunkProse(proseSections));
  }

  // --- persist -------------------------------------------------------------
  let written = 0;
  let deleted = 0;
  let requirementChunks = 0;
  let proseChunks = 0;

  for (const [documentId, chunks] of byDocument) {
    const document = documentById.get(documentId)!;
    const hashes = new Set(chunks.map((chunk) => chunk.contentHash));

    // Remove chunks that no longer correspond to anything in the source. Done
    // by hash rather than by truncating the document's chunks, so that the
    // embeddings of unchanged chunks survive.
    const existing = await db
      .select({ id: documentChunks.id, contentHash: documentChunks.contentHash })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));

    const stale = existing.filter((row) => !hashes.has(row.contentHash)).map((row) => row.id);
    if (stale.length > 0) {
      await db.delete(documentChunks).where(inArray(documentChunks.id, stale));
      deleted += stale.length;
    }

    for (const chunk of chunks) {
      await db
        .insert(documentChunks)
        .values({
          standardVersionId: version.id,
          documentId,
          sectionId: chunk.sectionId,
          requirementVersionId: chunk.requirementVersionId,
          chunkType: chunk.chunkType,
          heading: chunk.heading,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          sourcePage: chunk.sourcePage,
          authorityLevel: document.authorityLevel,
          contentHash: chunk.contentHash,
          ordinal: chunk.ordinal,
        })
        .onConflictDoUpdate({
          target: [documentChunks.documentId, documentChunks.contentHash],
          set: {
            ordinal: chunk.ordinal,
            sectionId: chunk.sectionId,
            requirementVersionId: chunk.requirementVersionId,
            sourcePage: chunk.sourcePage,
            authorityLevel: document.authorityLevel,
            updatedAt: new Date(),
          },
        });

      written++;
      if (chunk.chunkType === "requirement") requirementChunks++;
      else proseChunks++;
    }
  }

  onProgress?.(
    `${version.code}: ${requirementChunks} requirement chunks, ${proseChunks} prose chunks` +
      (deleted > 0 ? `, ${deleted} stale removed` : ""),
  );

  return { code: version.code, requirementChunks, proseChunks, chunksWritten: written, chunksDeleted: deleted };
}

// ---------------------------------------------------------------------------
// Embedding pass
// ---------------------------------------------------------------------------

/** How many chunks to embed and write per round trip. */
const EMBED_BATCH = 96;

async function embedPending(
  db: Database,
  embedder: Embedder,
  options: IndexOptions,
): Promise<{ embedded: number; reused: number; tokens: number | null }> {
  if (options.force) {
    await db.delete(chunkEmbeddings).where(eq(chunkEmbeddings.model, embedder.model));
  }

  // A chunk needs embedding when it has no vector for this model, or when the
  // vector it has was computed from different text. The second case is what
  // the stored content hash is for: staleness is detectable without recomputing
  // anything or trusting a timestamp.
  const pending = await db
    .select({ id: documentChunks.id, text: documentChunks.text, contentHash: documentChunks.contentHash })
    .from(documentChunks)
    .leftJoin(
      chunkEmbeddings,
      and(
        eq(chunkEmbeddings.chunkId, documentChunks.id),
        eq(chunkEmbeddings.model, embedder.model),
      ),
    )
    .where(
      sql`${chunkEmbeddings.id} IS NULL OR ${chunkEmbeddings.contentHash} <> ${documentChunks.contentHash}`,
    );

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(documentChunks);

  if (pending.length === 0) {
    return { embedded: 0, reused: total, tokens: 0 };
  }

  let tokens: number | null = 0;

  for (let start = 0; start < pending.length; start += EMBED_BATCH) {
    const batch = pending.slice(start, start + EMBED_BATCH);
    const result = await embedder.embed(batch.map((chunk) => chunk.text));

    if (result.embeddings.length !== batch.length) {
      throw new Error(
        `Embedder returned ${result.embeddings.length} vectors for ${batch.length} chunks. ` +
          "Refusing to write, because a misaligned batch would give every chunk its neighbour's vector.",
      );
    }

    for (const [index, chunk] of batch.entries()) {
      await db
        .insert(chunkEmbeddings)
        .values({
          chunkId: chunk.id,
          model: embedder.model,
          dimensions: embedder.dimensions,
          embedding: [...result.embeddings[index]!],
          contentHash: chunk.contentHash,
        })
        .onConflictDoUpdate({
          target: [chunkEmbeddings.chunkId, chunkEmbeddings.model],
          set: {
            embedding: [...result.embeddings[index]!],
            contentHash: chunk.contentHash,
            dimensions: embedder.dimensions,
          },
        });
    }

    tokens = tokens === null || result.tokens === null ? null : tokens + result.tokens;
    options.onProgress?.(
      `embedded ${Math.min(start + batch.length, pending.length)}/${pending.length}`,
    );
  }

  return { embedded: pending.length, reused: total - pending.length, tokens };
}

// ---------------------------------------------------------------------------

export async function indexCorpus(
  db: Database,
  embedder: Embedder,
  options: IndexOptions = {},
): Promise<IndexReport> {
  const versions = await db
    .select({ id: standardVersions.id, code: standardVersions.code })
    .from(standardVersions)
    .orderBy(standardVersions.code);

  const selected = options.versionCode
    ? versions.filter((version) => version.code === options.versionCode)
    : versions;

  if (selected.length === 0) {
    throw new Error(
      options.versionCode
        ? `Unknown version "${options.versionCode}". Known: ${versions.map((v) => v.code).join(", ")}`
        : "No standard versions registered. Run `bun run kb all` first.",
    );
  }

  const reports = [];
  for (const version of selected) {
    reports.push(await chunkVersion(db, version, options.onProgress));
  }

  const { embedded, reused, tokens } = await embedPending(db, embedder, options);

  return { versions: reports, embedded, reused, model: embedder.model, tokens };
}

/**
 * Which models the index actually holds vectors for.
 *
 * Needed because querying with a different model than the index was built with
 * is a silent failure, not a loud one: the vectors are the same length and
 * pgvector will happily compare them, so the model filter in `semanticSearch`
 * is all that stands between a mismatch and a page of confident nonsense. With
 * the filter, a mismatch instead yields zero semantic hits and looks like a
 * retrieval quality problem. Either way the operator needs to be told, so the
 * caller reconciles the two before searching.
 */
export async function indexedModels(
  db: Database,
): Promise<ReadonlyArray<{ model: string; vectors: number }>> {
  return db
    .select({ model: chunkEmbeddings.model, vectors: sql<number>`count(*)::int` })
    .from(chunkEmbeddings)
    .groupBy(chunkEmbeddings.model)
    .orderBy(sql`count(*) DESC`);
}

/** Chunks that have no vector for the given model. Reported by `ai status`. */
export async function unembeddedChunkCount(db: Database, model: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(documentChunks)
    .leftJoin(
      chunkEmbeddings,
      and(eq(chunkEmbeddings.chunkId, documentChunks.id), eq(chunkEmbeddings.model, model)),
    )
    .where(isNull(chunkEmbeddings.id));

  return row?.value ?? 0;
}
