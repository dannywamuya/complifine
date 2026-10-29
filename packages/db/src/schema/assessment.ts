/**
 * Self-assessment against one edition at one site, and the findings that
 * fall out of a partial or non-compliant answer.
 *
 * Scoring is a count of responses. Nothing here is generated.
 */

import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  assessmentResponseEnum,
  assessmentStatusEnum,
  correctiveActionStatusEnum,
  findingSeverityEnum,
  findingStatusEnum,
  primaryId,
  timestamps,
} from "./_shared.ts";
import { organizations, users } from "./tenancy.ts";
import { sites } from "./operations.ts";
import { standardVersions } from "./standards.ts";
import { requirementVersions } from "./requirements.ts";
import { evidence } from "./evidence.ts";
import { formRecords } from "./forms.ts";

export const assessments = pgTable(
  "assessments",
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
    status: assessmentStatusEnum("status").notNull().default("draft"),
    assessorId: uuid("assessor_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("assessments_site_idx").on(t.siteId, t.standardVersionId)],
);

export const assessmentItems = pgTable(
  "assessment_items",
  {
    id: primaryId(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),
    response: assessmentResponseEnum("response").notNull().default("not_assessed"),
    comment: text("comment"),
    evidenceId: uuid("evidence_id").references(() => evidence.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("assessment_items_key").on(t.assessmentId, t.requirementVersionId)],
);

export const findings = pgTable(
  "findings",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "set null" }),
    requirementVersionId: uuid("requirement_version_id").references(() => requirementVersions.id, {
      onDelete: "set null",
    }),
    section: text("section"),
    description: text("description").notNull(),
    severity: findingSeverityEnum("severity").notNull().default("minor"),
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: findingStatusEnum("status").notNull().default("open"),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    sourceFormRecordId: uuid("source_form_record_id").references(() => formRecords.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("findings_site_status_idx").on(t.siteId, t.status)],
);

export const correctiveActions = pgTable(
  "corrective_actions",
  {
    id: primaryId(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    rootCause: text("root_cause"),
    action: text("action").notNull(),
    preventiveAction: text("preventive_action"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: correctiveActionStatusEnum("status").notNull().default("open"),
    completionEvidenceId: uuid("completion_evidence_id").references(() => evidence.id, {
      onDelete: "set null",
    }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("corrective_actions_finding_idx").on(t.findingId)],
);

export const assessmentsRelations = relations(assessments, ({ many }) => ({
  items: many(assessmentItems),
}));

export const assessmentItemsRelations = relations(assessmentItems, ({ one }) => ({
  assessment: one(assessments, { fields: [assessmentItems.assessmentId], references: [assessments.id] }),
}));

export const findingsRelations = relations(findings, ({ many }) => ({
  actions: many(correctiveActions),
}));

export const correctiveActionsRelations = relations(correctiveActions, ({ one }) => ({
  finding: one(findings, { fields: [correctiveActions.findingId], references: [findings.id] }),
}));

export type Assessment = typeof assessments.$inferSelect;
export type AssessmentItem = typeof assessmentItems.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type CorrectiveAction = typeof correctiveActions.$inferSelect;
