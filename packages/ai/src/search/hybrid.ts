/**
 * Hybrid retrieval.
 *
 * Three retrievers, because each fails in a way the others do not.
 *
 * **Identifier lookup.** "What does FV-Smart 32.10.06 say?" has one correct
 * answer and no ranking problem. Sending it to a vector index is strictly worse
 * than a primary key lookup: slower, and capable of being wrong. So an exact
 * criterion number short-circuits everything else.
 *
 * **Lexical, IDF-weighted.** Compliance vocabulary is precise and the words
 * matter. "Major Must", "MRL", "unannounced audit" and "parallel ownership" are
 * terms of art; an embedding happily places "maximum residue limit exceedance"
 * near "pesticide residue testing", which is helpful for browsing and wrong for
 * an auditor who asked about the specific rule. See `lexical.ts` for why plain
 * `ts_rank_cd` is not enough on this corpus.
 *
 * **Semantic.** Producers do not speak in standard vocabulary. "Do I need to
 * test my water?" must reach the water analysis criterion, which never uses the
 * word "test". Lexical search cannot do this and never will.
 *
 * The two ranked lists are combined with Reciprocal Rank Fusion rather than a
 * weighted sum of scores. The IDF sum is unbounded and corpus-dependent while
 * cosine similarity is bounded in [-1, 1]; normalising them onto a common scale
 * means inventing a mapping, and every choice of mapping is a hyperparameter
 * nobody can justify. RRF uses only the ranks, so it needs no calibration and
 * cannot be destabilised by one retriever's score distribution shifting.
 */

import { eq, type Database } from "@complifine/db";
import { retrievalLogs, standardVersions } from "@complifine/db";
import {
  canonicalizeCriterionNumber,
  extractCriterionNumbers,
  type ChunkType,
  type RequirementLevel,
} from "@complifine/core";
import type { Embedder } from "../embed/provider.ts";
import { lexicalSearch, type LexicalRow } from "./lexical.ts";
import { semanticSearch, type SemanticRow } from "./semantic.ts";
import { identifierLookup } from "./identifier.ts";
import type { SearchFilters } from "./filters.ts";

export type { SearchFilters } from "./filters.ts";

export interface SearchOptions extends SearchFilters {
  readonly limit?: number;
  /**
   * How deep each retriever goes before fusion. Larger than `limit` on purpose:
   * a result ranked eighth by one retriever and second by the other should be
   * able to win, and it cannot if the first list was truncated at five.
   */
  readonly candidateDepth?: number;
  /** Skip logging. Used by the eval harness so a sweep does not flood the log. */
  readonly log?: boolean;
  readonly agentRunId?: string;
}

export interface SearchHit {
  readonly chunkId: string;
  readonly chunkType: ChunkType;
  readonly heading: string | null;
  readonly text: string;
  readonly authorityLevel: number;
  readonly sourcePage: number | null;

  readonly versionCode: string;
  readonly documentSlug: string;
  readonly documentTitle: string;

  readonly requirementId: string | null;
  readonly requirementLevel: RequirementLevel | null;
  readonly sectionTitle: string | null;

  /** Fused score. Comparable within one result set only. */
  readonly score: number;
  readonly lexicalRank: number | null;
  readonly lexicalScore: number | null;
  readonly semanticRank: number | null;
  readonly semanticScore: number | null;
}

export type SearchStrategy = "exact_id" | "hybrid" | "fulltext_only" | "vector_only";

export interface SearchResult {
  readonly strategy: SearchStrategy;
  readonly hits: readonly SearchHit[];
  readonly durationMs: number;
  /** Set when the query named a criterion and was answered by lookup. */
  readonly matchedIdentifier: string | null;
}

/**
 * RRF damping constant.
 *
 * 60 is the value from Cormack et al. (2009), where it was found to be
 * insensitive across collections. Its effect is to flatten the difference
 * between adjacent top ranks - rank 1 scores 1/61 and rank 2 scores 1/62 - so
 * that agreement between the two retrievers outweighs either one's confidence
 * about its own ordering. That is the behaviour we want: when lexical and
 * semantic search independently surface the same criterion, it should win.
 */
const RRF_K = 60;

/**
 * Weight applied to the semantic retriever's contribution.
 *
 * One when the embedder is a real model. When it is the deterministic local
 * stand-in, its ranking is bag-of-words overlap - largely redundant with the
 * lexical side and noisy where it is not - and at full weight RRF lets a
 * spurious semantic rank 1 tie with a genuine lexical rank 1. Down-weighting
 * keeps the local embedder useful for exercising the plumbing without letting
 * it fabricate agreement between two retrievers that are really one.
 */
const NON_SEMANTIC_WEIGHT = 0.25;

const DEFAULT_LIMIT = 10;
const DEFAULT_DEPTH = 40;

async function resolveVersionId(db: Database, versionCode?: string): Promise<string | null> {
  if (!versionCode) return null;
  const [version] = await db
    .select({ id: standardVersions.id })
    .from(standardVersions)
    .where(eq(standardVersions.code, versionCode));

  if (!version) {
    const known = await db.select({ code: standardVersions.code }).from(standardVersions);
    throw new Error(
      `Unknown version "${versionCode}". Known: ${known.map((v) => v.code).join(", ")}`,
    );
  }
  return version.id;
}

/**
 * Criterion numbers named in a query.
 *
 * Accepts the full form ("FV-Smart 32.10.06") and the bare number ("32.10.06"),
 * which is how people actually write them. A bare number is expanded to both
 * editions unless the query already restricts to one.
 */
export function identifiersInQuery(query: string, versionCode?: string): string[] {
  const explicit = extractCriterionNumbers(query).map((criterion) => criterion.formatted);
  if (explicit.length > 0) return explicit;

  const bare = query.match(/\b\d{1,2}(?:\.\d{2}){1,2}\b/g);
  if (!bare) return [];

  const editions = versionCode?.includes("gfs")
    ? (["FV-GFS"] as const)
    : versionCode?.includes("smart")
      ? (["FV-Smart"] as const)
      : (["FV-Smart", "FV-GFS"] as const);

  return bare.flatMap((number) =>
    editions
      .map((prefix) => canonicalizeCriterionNumber(`${prefix} ${number}`))
      .filter((id): id is string => id !== null),
  );
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

function fuse(
  lexical: readonly LexicalRow[],
  semantic: readonly SemanticRow[],
  limit: number,
  semanticWeight: number,
): SearchHit[] {
  interface Entry {
    row: LexicalRow | SemanticRow;
    lexicalRank: number | null;
    lexicalScore: number | null;
    semanticRank: number | null;
    semanticScore: number | null;
  }

  const merged = new Map<string, Entry>();

  lexical.forEach((row, index) => {
    merged.set(row.chunkId, {
      row,
      lexicalRank: index + 1,
      lexicalScore: row.score,
      semanticRank: null,
      semanticScore: null,
    });
  });

  semantic.forEach((row, index) => {
    const existing = merged.get(row.chunkId);
    if (existing) {
      existing.semanticRank = index + 1;
      existing.semanticScore = row.score;
    } else {
      merged.set(row.chunkId, {
        row,
        lexicalRank: null,
        lexicalScore: null,
        semanticRank: index + 1,
        semanticScore: row.score,
      });
    }
  });

  return [...merged.values()]
    .map((entry) => {
      const score =
        (entry.lexicalRank ? 1 / (RRF_K + entry.lexicalRank) : 0) +
        (entry.semanticRank ? semanticWeight / (RRF_K + entry.semanticRank) : 0);

      return {
        chunkId: entry.row.chunkId,
        chunkType: entry.row.chunkType as ChunkType,
        heading: entry.row.heading,
        text: entry.row.text,
        authorityLevel: entry.row.authorityLevel,
        sourcePage: entry.row.sourcePage,
        versionCode: entry.row.versionCode,
        documentSlug: entry.row.documentSlug,
        documentTitle: entry.row.documentTitle,
        requirementId: entry.row.requirementId,
        requirementLevel: entry.row.requirementLevel as RequirementLevel | null,
        sectionTitle: entry.row.sectionTitle,
        score,
        lexicalRank: entry.lexicalRank,
        lexicalScore: entry.lexicalScore,
        semanticRank: entry.semanticRank,
        semanticScore: entry.semanticScore,
      };
    })
    // Ties broken by chunk id so a result set is reproducible run to run;
    // an unstable order would make the eval suite flap.
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function search(
  db: Database,
  embedder: Embedder | null,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult> {
  const started = performance.now();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const depth = Math.max(options.candidateDepth ?? DEFAULT_DEPTH, limit);

  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { strategy: "hybrid", hits: [], durationMs: 0, matchedIdentifier: null };
  }

  const versionId = await resolveVersionId(db, options.versionCode);

  let strategy: SearchStrategy = "hybrid";
  let hits: SearchHit[] = [];
  let matchedIdentifier: string | null = null;

  // --- exact identifier ----------------------------------------------------
  const identifiers = identifiersInQuery(trimmed, options.versionCode);
  if (identifiers.length > 0) {
    const rows = await identifierLookup(db, identifiers, options, versionId);
    if (rows.length > 0) {
      strategy = "exact_id";
      matchedIdentifier = identifiers[0]!;
      hits = rows.slice(0, limit).map((row) => ({
        ...row,
        chunkType: row.chunkType as ChunkType,
        requirementLevel: row.requirementLevel as RequirementLevel | null,
        score: 1,
        lexicalRank: null,
        lexicalScore: null,
        semanticRank: null,
        semanticScore: null,
      }));
    }
  }

  // --- hybrid --------------------------------------------------------------
  if (hits.length === 0) {
    const lexical = await lexicalSearch(db, trimmed, options, versionId, depth);

    let semantic: SemanticRow[] = [];
    if (embedder) {
      const { embeddings } = await embedder.embed([trimmed]);
      const embedding = embeddings[0];
      if (embedding) {
        semantic = await semanticSearch(db, embedding, embedder.model, options, versionId, depth);
      }
    }

    strategy =
      !embedder || semantic.length === 0
        ? "fulltext_only"
        : lexical.length === 0
          ? "vector_only"
          : "hybrid";

    hits = fuse(lexical, semantic, limit, embedder?.semantic === false ? NON_SEMANTIC_WEIGHT : 1);
  }

  const durationMs = Math.round(performance.now() - started);

  if (options.log !== false) {
    // Retrieval tuning is impossible without a record of what was asked and
    // what came back, and a failure to log must never fail the search itself.
    await db
      .insert(retrievalLogs)
      .values({
        query: trimmed,
        strategy,
        filters: {
          versionCode: options.versionCode ?? null,
          chunkTypes: options.chunkTypes ?? null,
          levels: options.levels ?? null,
          maxAuthorityLevel: options.maxAuthorityLevel ?? null,
        },
        resultCount: hits.length,
        results: hits.map((hit) => ({
          chunkId: hit.chunkId,
          requirementId: hit.requirementId,
          score: hit.score,
          lexicalRank: hit.lexicalRank,
          semanticRank: hit.semanticRank,
        })),
        durationMs,
        agentRunId: options.agentRunId ?? null,
      })
      .catch(() => undefined);
  }

  return { strategy, hits, durationMs, matchedIdentifier };
}
