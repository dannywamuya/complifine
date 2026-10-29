/**
 * An on-demand AI audit of one site against one published edition.
 *
 * The run and its items are a simulation. Accepting a verdict is what writes
 * the self-assessment, and opening a finding is a separate confirmation.
 * Nothing in this file is a certification decision.
 */

import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AuditCitationKind, AuditVerdict, FindingSeverity } from "@complifine/core";
import { auditRunStatusEnum, auditVerdictEnum, findingSeverityEnum, primaryId, timestamps } from "./_shared.ts";
import { organizations, users } from "./tenancy.ts";
import { sites } from "./operations.ts";
import { standardVersions } from "./standards.ts";
import { requirementVersions } from "./requirements.ts";
import { findings } from "./assessment.ts";

export interface AuditProgress {
  done: number;
  total: number;
}

export interface AuditRecommendation {
  requirementVersionId: string;
  text: string;
  priority: number;
}

export interface AuditCitation {
  kind: AuditCitationKind;
  id: string;
  label: string;
}

export const auditRuns = pgTable(
  "audit_runs",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    status: auditRunStatusEnum("status").notNull().default("queued"),
    progress: jsonb("progress").$type<AuditProgress>().notNull().default({ done: 0, total: 0 }),
    model: text("model"),
    summary: text("summary"),
    recommendations: jsonb("recommendations").$type<AuditRecommendation[]>(),
    counts: jsonb("counts").$type<Partial<Record<AuditVerdict, number>>>(),
    readinessSnapshot: jsonb("readiness_snapshot").$type<Record<string, unknown>>(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("audit_runs_site_version_idx").on(t.siteId, t.standardVersionId, t.createdAt)],
);

export const auditRunItems = pgTable(
  "audit_run_items",
  {
    id: primaryId(),
    auditRunId: uuid("audit_run_id")
      .notNull()
      .references(() => auditRuns.id, { onDelete: "cascade" }),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),
    verdict: auditVerdictEnum("verdict").notNull(),
    rationale: text("rationale").notNull().default(""),
    recommendation: text("recommendation").notNull().default(""),
    suggestedSeverity: findingSeverityEnum("suggested_severity").$type<FindingSeverity>(),
    citedEvidence: jsonb("cited_evidence").$type<AuditCitation[]>().notNull().default([]),
    /** Citations the model named that were not in the dossier. Kept, not shown as proof. */
    ungrounded: jsonb("ungrounded").$type<AuditCitation[]>().notNull().default([]),
    confidence: doublePrecision("confidence"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    findingId: uuid("finding_id").references(() => findings.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("audit_run_items_key").on(t.auditRunId, t.requirementVersionId),
    index("audit_run_items_run_idx").on(t.auditRunId),
  ],
);

export const auditRunsRelations = relations(auditRuns, ({ many }) => ({
  items: many(auditRunItems),
}));

export const auditRunItemsRelations = relations(auditRunItems, ({ one }) => ({
  run: one(auditRuns, { fields: [auditRunItems.auditRunId], references: [auditRuns.id] }),
}));

export type AuditRun = typeof auditRuns.$inferSelect;
export type AuditRunItem = typeof auditRunItems.$inferSelect;
