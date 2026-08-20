/**
 * Lexical retrieval, weighted by how rare each term is.
 *
 * Postgres full-text search has one property that makes it unusable as-is on a
 * corpus like this: `ts_rank_cd` has no notion of inverse document frequency.
 * It scores by term frequency and cover density, so a match on a word that
 * appears in half the corpus counts for as much as a match on the one word in
 * the question that actually narrows it down.
 *
 * That is fatal here rather than merely suboptimal, because a compliance corpus
 * is the pathological case for it. Measured against the ingested IFA v6 index,
 * the query "Is document control a Major Must for a GFS producer?" breaks into
 * six lexemes with these document frequencies:
 *
 *     produc     55%      must     36%      document  29%
 *     major      24%      gfs      24%      control   13%
 *
 * Five of the six are near-ubiquitous. Ranking by `ts_rank_cd` put the correct
 * criterion - FV-GFS 01.01, "A procedure is in place to manage and control
 * documents and records" - at rank 36, behind three dozen chunks that simply
 * say "producer" a lot. Weighting each lexeme by its IDF moves it to rank 2.
 *
 * So the score here is the BM25 IDF sum over matched query lexemes, with
 * `ts_rank_cd` retained at unit weight as a tiebreaker. The IDF term decides
 * which chunks are about the question; the rank term decides, among chunks that
 * are equally on-topic, which one says it most densely and in its heading.
 *
 * Full BM25 term-frequency saturation is deliberately not implemented. It
 * corrects for repeated terms in long documents, and this corpus is chunked
 * into criteria of one to three sentences where nearly every term frequency is
 * one. The saturation term would be arithmetic with no effect.
 */

import { sql, type Database, type SQL } from "@complifine/db";
import { filterConditions, whereClause, type SearchFilters } from "./filters.ts";

/**
 * `db.execute<T>` constrains `T` to `Record<string, unknown>`, which a plain
 * interface does not satisfy. Intersecting keeps the named fields typed while
 * meeting the constraint, rather than widening every column to `unknown`.
 */
export type QueryRow<T> = T & Record<string, unknown>;

export interface LexicalRow {
  chunkId: string;
  chunkType: string;
  heading: string | null;
  text: string;
  authorityLevel: number;
  sourcePage: number | null;
  versionCode: string;
  documentSlug: string;
  documentTitle: string;
  requirementId: string | null;
  requirementLevel: string | null;
  sectionTitle: string | null;
  score: number;
  idfScore: number;
  rankScore: number;
}

/**
 * How much `ts_rank_cd` may move a result relative to the IDF sum.
 *
 * IDF sums land between roughly 1 and 15 on this corpus; `ts_rank_cd` returns
 * values under 1. At unit weight the rank term can therefore reorder chunks
 * whose IDF scores are within about one rare term of each other, and cannot
 * override a genuinely better term match. That is exactly the intended
 * division of labour.
 */
const RANK_WEIGHT = 1.0;

/**
 * Exact-lexeme membership test.
 *
 * `quote_literal(lex)::tsquery` rather than `to_tsquery('complifine_en', lex)`:
 * the lexemes come out of `tsvector_to_array` already stemmed, and passing them
 * back through the dictionary would stem them a second time. Most stemmers are
 * idempotent, but not all are, and a lexeme that changed on the second pass
 * would match nothing while looking perfectly correct. Casting a quoted string
 * skips the dictionary entirely, and `quote_literal` handles the apostrophes
 * that appear in lexemes from possessives. The test still uses the GIN index.
 */
const LEXEME_MATCH = (column: SQL | string) =>
  sql`${sql.raw(String(column))} @@ quote_literal(w.lex)::tsquery`;

export async function lexicalSearch(
  db: Database,
  query: string,
  filters: SearchFilters,
  versionId: string | null,
  limit: number,
): Promise<LexicalRow[]> {
  const where = whereClause(filterConditions(filters, versionId, "dc", "rv"));

  const rows = await db.execute<QueryRow<LexicalRow>>(sql`
    WITH lexemes AS (
      SELECT DISTINCT unnest(tsvector_to_array(to_tsvector('complifine_en', ${query}))) AS lex
    ),
    corpus AS (
      SELECT count(*)::float8 AS n FROM document_chunks
    ),
    weighted AS (
      -- BM25's IDF: ln(1 + (N - df + 0.5) / (df + 0.5)). The +1 inside the log
      -- keeps it positive even for a term present in every document, so a
      -- ubiquitous term contributes almost nothing rather than a penalty.
      SELECT
        l.lex,
        ln(
          1 + ((SELECT n FROM corpus) - count(c.id) + 0.5) / (count(c.id) + 0.5)
        )::float8 AS idf
      FROM lexemes l
      LEFT JOIN document_chunks c
        ON c.search_vector @@ quote_literal(l.lex)::tsquery
      GROUP BY l.lex
    ),
    full_query AS (
      SELECT string_agg(lex, ' | ')::tsquery AS tsq FROM lexemes
    ),
    scored AS (
      SELECT dc.id AS chunk_id, sum(w.idf)::float8 AS idf_score
      FROM weighted w
      JOIN document_chunks dc ON ${LEXEME_MATCH("dc.search_vector")}
      GROUP BY dc.id
    )
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
      s.idf_score                 AS "idfScore",
      ts_rank_cd(dc.search_vector, (SELECT tsq FROM full_query), 32)::float8 AS "rankScore",
      (
        s.idf_score
        + ${RANK_WEIGHT} * ts_rank_cd(dc.search_vector, (SELECT tsq FROM full_query), 32)
      )::float8                   AS "score"
    FROM scored s
    JOIN document_chunks dc      ON dc.id = s.chunk_id
    JOIN standard_versions sv    ON sv.id = dc.standard_version_id
    JOIN standard_documents sd   ON sd.id = dc.document_id
    LEFT JOIN requirement_versions rv ON rv.id = dc.requirement_version_id
    LEFT JOIN standard_sections ss    ON ss.id = dc.section_id
    ${where}
    ORDER BY "score" DESC, dc.id
    LIMIT ${limit}
  `);

  return [...rows];
}
