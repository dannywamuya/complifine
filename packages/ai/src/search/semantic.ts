/**
 * Semantic retrieval over pgvector.
 *
 * Exists because producers do not speak in standard vocabulary. "Do I need to
 * test my water?" has to reach the criterion about water analysis, and "when
 * can workers go back in after spraying" has to reach the one about re-entry
 * intervals - neither shares a content word with its answer, so no amount of
 * lexical cleverness will find them.
 *
 * Written as raw SQL rather than through the query builder so that it shares
 * the filter builder with the lexical side; the two retrievers applying
 * different restrictions is a bug that would not show up in any output.
 */

import { sql, type Database } from "@complifine/db";
import { filterConditions, whereClause, type SearchFilters } from "./filters.ts";
import type { LexicalRow } from "./lexical.ts";

export type SemanticRow = Omit<LexicalRow, "idfScore" | "rankScore">;

export async function semanticSearch(
  db: Database,
  embedding: readonly number[],
  model: string,
  filters: SearchFilters,
  versionId: string | null,
  limit: number,
): Promise<SemanticRow[]> {
  // The model predicate is not optional: comparing a query vector against
  // embeddings from a different model gives numbers that are well-formed and
  // meaningless, so a mismatch must return nothing rather than nonsense.
  const where = whereClause([
    ...filterConditions(filters, versionId, "dc", "rv"),
    sql`ce.model = ${model}`,
  ]);
  const vector = `[${embedding.join(",")}]`;

  const rows = await db.execute<SemanticRow>(sql`
    SELECT
      dc.id                       AS "chunkId",
      dc.chunk_type               AS "chunkType",
      dc.heading                  AS "heading",
      dc.text                     AS "text",
      dc.authority_level          AS "authorityLevel",
      dc.source_page              AS "sourcePage",
      sv.code                     AS "versionCode",
      sd.slug                     AS "documentSlug",
      sd.title                    AS "documentTitle",
      rv.source_requirement_id    AS "requirementId",
      rv.level::text              AS "requirementLevel",
      ss.title                    AS "sectionTitle",
      (1 - (ce.embedding <=> ${vector}::vector))::float8 AS "score"
    FROM chunk_embeddings ce
    JOIN document_chunks dc      ON dc.id = ce.chunk_id
    JOIN standard_versions sv    ON sv.id = dc.standard_version_id
    JOIN standard_documents sd   ON sd.id = dc.document_id
    LEFT JOIN requirement_versions rv ON rv.id = dc.requirement_version_id
    LEFT JOIN standard_sections ss    ON ss.id = dc.section_id
    ${where}
    -- Ordered by distance ascending rather than by similarity descending so the
    -- HNSW index is usable: the planner will not match an ascending index scan
    -- to a descending order on a derived expression.
    ORDER BY ce.embedding <=> ${vector}::vector
    LIMIT ${limit}
  `);

  return [...rows];
}
