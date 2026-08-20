/**
 * Retrieval filters, in one place.
 *
 * Both retrievers must apply exactly the same restrictions. If they diverge -
 * if the lexical side honours the authority ceiling and the semantic side does
 * not - then fusion quietly reintroduces the very rows the filter existed to
 * exclude, and the bug is invisible because the results still look reasonable.
 * Sharing one builder makes that class of mistake impossible rather than
 * unlikely.
 */

import { sql, type SQL } from "@complifine/db";
import type { AuthorityLevel, ChunkType, RequirementLevel } from "@complifine/core";

export interface SearchFilters {
  /** Restrict to one edition's version, e.g. `ifa-v6-smart-fv`. */
  readonly versionCode?: string;
  readonly chunkTypes?: readonly ChunkType[];
  readonly levels?: readonly RequirementLevel[];
  /**
   * Only chunks at or above this authority. Defaults to everything, but the
   * agent sets it to 3 when answering "what is required", so that guidance
   * cannot be presented as a rule.
   */
  readonly maxAuthorityLevel?: AuthorityLevel;
  readonly sectionId?: string;
}

/**
 * Filters as a list of conditions, for the caller to combine with its own.
 *
 * Values are passed as bound parameters rather than interpolated, including in
 * the array cases: a version code or chunk type reaching the database as
 * literal SQL is an injection surface, and these values originate in a model's
 * tool arguments.
 */
export function filterConditions(
  filters: SearchFilters,
  versionId: string | null,
  chunkAlias: string,
  requirementAlias: string,
): SQL[] {
  const conditions: SQL[] = [];
  const chunk = sql.raw(chunkAlias);
  const requirement = sql.raw(requirementAlias);

  if (versionId) {
    conditions.push(sql`${chunk}.standard_version_id = ${versionId}::uuid`);
  }

  if (filters.chunkTypes?.length) {
    conditions.push(sql`${chunk}.chunk_type IN (${valueList(filters.chunkTypes)})`);
  }

  if (filters.maxAuthorityLevel !== undefined) {
    conditions.push(sql`${chunk}.authority_level <= ${filters.maxAuthorityLevel}`);
  }

  if (filters.sectionId) {
    conditions.push(sql`${chunk}.section_id = ${filters.sectionId}::uuid`);
  }

  if (filters.levels?.length) {
    conditions.push(sql`${requirement}.level IN (${valueList(filters.levels)})`);
  }

  return conditions;
}

/**
 * A comma-separated list of bound parameters, for `IN (...)`.
 *
 * Written out one placeholder per value rather than passed as a single array
 * parameter: drizzle serialises an embedded JS array into one scalar bind, so
 * `= ANY($1::text[])` receives the joined string and matches nothing. Doing it
 * this way keeps every value bound rather than interpolated, which matters
 * because these arrive from a model's tool arguments.
 */
function valueList(values: readonly string[]): SQL {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );
}

/** `WHERE a AND b`, or nothing at all when there is nothing to filter on. */
export function whereClause(conditions: readonly SQL[]): SQL {
  if (conditions.length === 0) return sql``;
  return sql`WHERE ${sql.join([...conditions], sql` AND `)}`;
}

/** Exported so the identifier retriever can build its own `IN` list. */
export { valueList };
