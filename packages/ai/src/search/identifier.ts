/**
 * Answering a query that names a criterion outright.
 *
 * "What does FV-Smart 32.10.06 say?" is a primary key lookup wearing the
 * costume of a search query. Routing it through ranking would be slower and,
 * unlike a lookup, capable of returning the wrong criterion - which in a
 * compliance answer is not a degraded result but a false one.
 *
 * Returns the criterion's chunk in every edition that has it, so asking about
 * "32.10.06" without naming an edition shows both rather than silently
 * choosing.
 */

import { sql, type Database } from "@complifine/db";
import { filterConditions, valueList, whereClause, type SearchFilters } from "./filters.ts";
import type { QueryRow } from "./lexical.ts";
import type { SemanticRow } from "./semantic.ts";

export async function identifierLookup(
  db: Database,
  identifiers: readonly string[],
  filters: SearchFilters,
  versionId: string | null,
): Promise<SemanticRow[]> {
  const where = whereClause([
    ...filterConditions(filters, versionId, "dc", "rv"),
    sql`rv.source_requirement_id IN (${valueList(identifiers)})`,
  ]);

  const rows = await db.execute<QueryRow<SemanticRow>>(sql`
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
      1::float8                   AS "score"
    FROM document_chunks dc
    JOIN standard_versions sv    ON sv.id = dc.standard_version_id
    JOIN standard_documents sd   ON sd.id = dc.document_id
    JOIN requirement_versions rv ON rv.id = dc.requirement_version_id
    LEFT JOIN standard_sections ss ON ss.id = dc.section_id
    ${where}
    ORDER BY rv.sort_key, sv.code
  `);

  return [...rows];
}
