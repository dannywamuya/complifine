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
  COMPANY_DOCUMENT_PURPOSES,
  CONTROL_TYPES,
  EVIDENCE_SOURCES,
  EVIDENCE_VERIFICATION_STATUSES,
  FORM_CADENCES,
  FORM_CATEGORIES,
  FORM_RECORD_ORIGINS,
  FORM_RECORD_STATUSES,
  ASSESSMENT_RESPONSES,
  ASSESSMENT_STATUSES,
  CORRECTIVE_ACTION_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DIGESTS,
  NOTIFICATION_EVENT_TYPES,
  AUDIT_RUN_STATUSES,
  AUDIT_VERDICTS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
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
  ACCOUNT_STATUSES,
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
export const accountStatusEnum = pgEnum("account_status", ACCOUNT_STATUSES);
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
export const evidenceVerificationEnum = pgEnum(
  "evidence_verification",
  EVIDENCE_VERIFICATION_STATUSES,
);
export const evidenceSourceEnum = pgEnum("evidence_source", EVIDENCE_SOURCES);
export const companyDocumentPurposeEnum = pgEnum(
  "company_document_purpose",
  COMPANY_DOCUMENT_PURPOSES,
);
export const formCategoryEnum = pgEnum("form_category", FORM_CATEGORIES);
export const formCadenceEnum = pgEnum("form_cadence", FORM_CADENCES);
export const formRecordStatusEnum = pgEnum("form_record_status", FORM_RECORD_STATUSES);
export const formRecordOriginEnum = pgEnum("form_record_origin", FORM_RECORD_ORIGINS);
export const assessmentStatusEnum = pgEnum("assessment_status", ASSESSMENT_STATUSES);
export const assessmentResponseEnum = pgEnum("assessment_response", ASSESSMENT_RESPONSES);
export const findingStatusEnum = pgEnum("finding_status", FINDING_STATUSES);
export const findingSeverityEnum = pgEnum("finding_severity", FINDING_SEVERITIES);
export const correctiveActionStatusEnum = pgEnum("corrective_action_status", CORRECTIVE_ACTION_STATUSES);
export const notificationEventTypeEnum = pgEnum("notification_event_type", NOTIFICATION_EVENT_TYPES);
export const notificationChannelEnum = pgEnum("notification_channel", NOTIFICATION_CHANNELS);
export const notificationDigestEnum = pgEnum("notification_digest", NOTIFICATION_DIGESTS);
export const auditRunStatusEnum = pgEnum("audit_run_status", AUDIT_RUN_STATUSES);
export const auditVerdictEnum = pgEnum("audit_verdict", AUDIT_VERDICTS);

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
