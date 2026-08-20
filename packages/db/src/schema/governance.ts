/**
 * Governance: quality gates, human review and the audit trail.
 *
 * A knowledge base that cannot prove how it reached its contents is not
 * evidence, it is just a database. These three tables are what let CompliFine
 * answer "who approved this requirement text, on what date, against which
 * checks" - the question a certification body would actually ask.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAtOnly, primaryId, reviewDecisionEnum, timestamps } from "./_shared.ts";
import { standardVersions } from "./standards.ts";

// ---------------------------------------------------------------------------
// quality_gate_results
// ---------------------------------------------------------------------------

/**
 * The outcome of one named check against one standard version.
 *
 * Persisted rather than merely printed, because publication is gated on them
 * and a gate result is therefore part of the audit trail. Re-running the gates
 * overwrites the row for that gate, so the table always reflects current
 * truth, while `checked_at` shows how fresh that truth is.
 */
export const qualityGateResults = pgTable(
  "quality_gate_results",
  {
    id: primaryId(),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),

    /** Stable machine name, e.g. `requirement-count`. */
    gate: text("gate").notNull(),
    /** Human description of what the gate asserts. */
    description: text("description").notNull(),

    passed: boolean("passed").notNull(),
    /** Whether failing this gate blocks publication, or is advisory only. */
    blocking: boolean("blocking").notNull().default(true),

    /** What the gate expected, as a human-readable string. */
    expected: text("expected"),
    /** What it actually found. */
    actual: text("actual"),
    /** Numeric score where the gate produces one, e.g. a mean similarity. */
    score: doublePrecision("score"),

    /** Rows or identifiers that failed, so a reviewer can go straight to them. */
    failures: jsonb("failures").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),

    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("quality_gate_results_key").on(t.standardVersionId, t.gate),
    index("quality_gate_results_version_idx").on(t.standardVersionId),
    index("quality_gate_results_passed_idx").on(t.passed),
  ],
);

// ---------------------------------------------------------------------------
// knowledge_reviews
// ---------------------------------------------------------------------------

export const knowledgeReviews = pgTable(
  "knowledge_reviews",
  {
    id: primaryId(),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),

    /**
     * What was reviewed. Null means the whole version was signed off; a value
     * scopes the review to one entity, e.g. a single requirement corrected
     * during review.
     */
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),

    decision: reviewDecisionEnum("decision").notNull(),
    reviewer: text("reviewer").notNull(),
    notes: text("notes"),

    ...createdAtOnly,
  },
  (t) => [
    index("knowledge_reviews_version_idx").on(t.standardVersionId),
    index("knowledge_reviews_entity_idx").on(t.entityType, t.entityId),
  ],
);

// ---------------------------------------------------------------------------
// audit_logs
// ---------------------------------------------------------------------------

/**
 * Append-only record of every mutation to knowledge-layer data.
 *
 * Deliberately generic and deliberately not foreign-keyed to the entities it
 * describes: an audit log that cascades away when its subject is deleted is
 * useless precisely when it matters.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: primaryId(),

    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),

    /** e.g. `created`, `updated`, `status_changed`, `published`. */
    action: text("action").notNull(),

    /** Who did it: a user identifier, or a process name like `ingestion:parse`. */
    actor: text("actor").notNull(),

    /** Field-level diff, `{ field: { from, to } }`. */
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    ...createdAtOnly,
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_actor_idx").on(t.actor),
  ],
);

export const qualityGateResultsRelations = relations(qualityGateResults, ({ one }) => ({
  standardVersion: one(standardVersions, {
    fields: [qualityGateResults.standardVersionId],
    references: [standardVersions.id],
  }),
}));

export const knowledgeReviewsRelations = relations(knowledgeReviews, ({ one }) => ({
  standardVersion: one(standardVersions, {
    fields: [knowledgeReviews.standardVersionId],
    references: [standardVersions.id],
  }),
}));

export type QualityGateResult = typeof qualityGateResults.$inferSelect;
export type NewQualityGateResult = typeof qualityGateResults.$inferInsert;
export type KnowledgeReview = typeof knowledgeReviews.$inferSelect;
export type NewKnowledgeReview = typeof knowledgeReviews.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
