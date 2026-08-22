/**
 * Shared column builders, custom types and Postgres enums.
 *
 * Enum values are imported from `@complifine/core` rather than redeclared, so
 * the database constraint and the TypeScript union can never drift apart.
 */

import { customType, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  APPLICABILITY_SOURCES,
  CHUNK_TYPES,
  CONTROL_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  JOB_STAGES,
  JOB_STATUSES,
  LOG_LEVELS,
  MEMBERSHIP_ROLES,
  RELATIONSHIP_ORIGINS,
  RELATIONSHIP_TYPES,
  REQUIREMENT_STATUSES,
  REVIEW_DECISIONS,
  SCOPING_ANSWERS,
  SITE_TYPES,
  SOURCE_CHANNELS,
  USER_KINDS,
  VERSION_STATUSES,
} from "@complifine/core";

// ---------------------------------------------------------------------------
// Custom types
// ---------------------------------------------------------------------------

/**
 * Postgres `tsvector`. Drizzle has no built-in, and we need one because the
 * full-text half of hybrid search ranks with `ts_rank_cd` over a stored,
 * weighted vector rather than recomputing `to_tsvector` per row per query.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * Embedding dimensionality.
 *
 * Fixed in the schema because a pgvector column's width is part of its type.
 * It is declared here as a named constant so the embedding client can assert
 * that the model it is calling actually returns this many floats, rather than
 * discovering the mismatch as an opaque insert error 1,900 rows in.
 *
 * Changing model families means a migration. See docs/RAG.md.
 */
export const EMBEDDING_DIMENSIONS = 1536;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const documentTypeEnum = pgEnum("document_type", DOCUMENT_TYPES);
export const documentStatusEnum = pgEnum("document_status", DOCUMENT_STATUSES);
export const versionStatusEnum = pgEnum("version_status", VERSION_STATUSES);
export const requirementStatusEnum = pgEnum("requirement_status", REQUIREMENT_STATUSES);
export const sourceChannelEnum = pgEnum("source_channel", SOURCE_CHANNELS);
export const userKindEnum = pgEnum("user_kind", USER_KINDS);
export const membershipRoleEnum = pgEnum("membership_role", MEMBERSHIP_ROLES);
export const siteTypeEnum = pgEnum("site_type", SITE_TYPES);
export const controlTypeEnum = pgEnum("control_type", CONTROL_TYPES);
export const relationshipTypeEnum = pgEnum("relationship_type", RELATIONSHIP_TYPES);
export const relationshipOriginEnum = pgEnum("relationship_origin", RELATIONSHIP_ORIGINS);
export const scopingAnswerEnum = pgEnum("scoping_answer", SCOPING_ANSWERS);
export const applicabilitySourceEnum = pgEnum("applicability_source", APPLICABILITY_SOURCES);
export const jobStageEnum = pgEnum("job_stage", JOB_STAGES);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const logLevelEnum = pgEnum("log_level", LOG_LEVELS);
export const chunkTypeEnum = pgEnum("chunk_type", CHUNK_TYPES);
export const reviewDecisionEnum = pgEnum("review_decision", REVIEW_DECISIONS);

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

export const primaryId = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

/**
 * `withTimezone` everywhere. Certification dates, evidence expiry and audit
 * windows are all real-world instants that will eventually be compared across
 * Kenya (UTC+3) and Europe; a naive timestamp would make those comparisons
 * quietly wrong.
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const createdAtOnly = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};
