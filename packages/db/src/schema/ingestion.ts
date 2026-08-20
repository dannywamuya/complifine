/**
 * Ingestion jobs and their event log.
 *
 * The PRD requires (section 46) that ingestion never runs inside an HTTP
 * request and that every job is observable and retryable. Two tables achieve
 * that: a job row that records intent and outcome, and an append-only event
 * stream that records what happened along the way.
 *
 * The event log is not decoration. When a reconciliation gate fails on
 * criterion 137 of 190, the useful artefact is the trail showing which page
 * the mapper searched and what it found - not a stack trace.
 */

import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createdAtOnly,
  jobStageEnum,
  jobStatusEnum,
  logLevelEnum,
  primaryId,
  timestamps,
} from "./_shared.ts";
import { standardDocuments, standardVersions } from "./standards.ts";

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: primaryId(),

    /** Groups the jobs of one pipeline run so a whole run can be inspected. */
    runId: uuid("run_id").notNull(),

    standardVersionId: uuid("standard_version_id").references(() => standardVersions.id, {
      onDelete: "cascade",
    }),
    documentId: uuid("document_id").references(() => standardDocuments.id, {
      onDelete: "cascade",
    }),

    stage: jobStageEnum("stage").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),

    attempt: integer("attempt").notNull().default(1),

    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),

    /** Counters the stage produced, e.g. `{ requirements: 190, skipped: 0 }`. */
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    error: text("error"),
    errorStack: text("error_stack"),

    ...timestamps,
  },
  (t) => [
    index("ingestion_jobs_run_idx").on(t.runId),
    index("ingestion_jobs_document_idx").on(t.documentId),
    index("ingestion_jobs_status_idx").on(t.status),
    index("ingestion_jobs_stage_idx").on(t.stage),
  ],
);

export const ingestionEvents = pgTable(
  "ingestion_events",
  {
    id: primaryId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: "cascade" }),

    level: logLevelEnum("level").notNull().default("info"),
    message: text("message").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),

    ...createdAtOnly,
  },
  (t) => [
    index("ingestion_events_job_idx").on(t.jobId, t.createdAt),
    index("ingestion_events_level_idx").on(t.level),
  ],
);

export const ingestionJobsRelations = relations(ingestionJobs, ({ one, many }) => ({
  standardVersion: one(standardVersions, {
    fields: [ingestionJobs.standardVersionId],
    references: [standardVersions.id],
  }),
  document: one(standardDocuments, {
    fields: [ingestionJobs.documentId],
    references: [standardDocuments.id],
  }),
  events: many(ingestionEvents),
}));

export const ingestionEventsRelations = relations(ingestionEvents, ({ one }) => ({
  job: one(ingestionJobs, {
    fields: [ingestionEvents.jobId],
    references: [ingestionJobs.id],
  }),
}));

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
export type IngestionEvent = typeof ingestionEvents.$inferSelect;
export type NewIngestionEvent = typeof ingestionEvents.$inferInsert;
