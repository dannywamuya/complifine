/**
 * Control library: what a company does to satisfy requirements, and what
 * evidence that work should produce.
 *
 * Controls are knowledge, not company data. The same "H&S induction" control
 * can satisfy a GLOBALG.A.P. Major Must and an ETI/SMETA labour clause. The
 * many-to-many `control_requirements` table is the long-term cross-standard
 * value. Actual uploaded evidence is a later table; this one only records
 * *expected* evidence types.
 */

import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { controlTypeEnum, primaryId, timestamps } from "./_shared.ts";
import { requirementVersions } from "./requirements.ts";

export const controls = pgTable(
  "controls",
  {
    id: primaryId(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    objective: text("objective"),
    controlType: controlTypeEnum("control_type").notNull().default("procedure"),
    ownerRole: text("owner_role"),
    frequency: text("frequency"),
    implementationGuidance: text("implementation_guidance"),
    reviewFrequency: text("review_frequency"),
    ...timestamps,
  },
  (t) => [uniqueIndex("controls_slug_key").on(t.slug)],
);

export const evidenceTypes = pgTable(
  "evidence_types",
  {
    id: primaryId(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("evidence_types_slug_key").on(t.slug)],
);

export const controlRequirements = pgTable(
  "control_requirements",
  {
    id: primaryId(),
    controlId: uuid("control_id")
      .notNull()
      .references(() => controls.id, { onDelete: "cascade" }),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("control_requirements_key").on(t.controlId, t.requirementVersionId),
    index("control_requirements_requirement_idx").on(t.requirementVersionId),
  ],
);

export const controlEvidenceTypes = pgTable(
  "control_evidence_types",
  {
    id: primaryId(),
    controlId: uuid("control_id")
      .notNull()
      .references(() => controls.id, { onDelete: "cascade" }),
    evidenceTypeId: uuid("evidence_type_id")
      .notNull()
      .references(() => evidenceTypes.id, { onDelete: "cascade" }),
    mandatory: boolean("mandatory").notNull().default(true),
    validityPeriod: text("validity_period"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("control_evidence_types_key").on(t.controlId, t.evidenceTypeId),
  ],
);

export const controlsRelations = relations(controls, ({ many }) => ({
  requirements: many(controlRequirements),
  evidence: many(controlEvidenceTypes),
}));

export const evidenceTypesRelations = relations(evidenceTypes, ({ many }) => ({
  controls: many(controlEvidenceTypes),
}));

export const controlRequirementsRelations = relations(controlRequirements, ({ one }) => ({
  control: one(controls, {
    fields: [controlRequirements.controlId],
    references: [controls.id],
  }),
  requirementVersion: one(requirementVersions, {
    fields: [controlRequirements.requirementVersionId],
    references: [requirementVersions.id],
  }),
}));

export const controlEvidenceTypesRelations = relations(controlEvidenceTypes, ({ one }) => ({
  control: one(controls, {
    fields: [controlEvidenceTypes.controlId],
    references: [controls.id],
  }),
  evidenceType: one(evidenceTypes, {
    fields: [controlEvidenceTypes.evidenceTypeId],
    references: [evidenceTypes.id],
  }),
}));

export type Control = typeof controls.$inferSelect;
export type NewControl = typeof controls.$inferInsert;
export type EvidenceType = typeof evidenceTypes.$inferSelect;
export type ControlRequirement = typeof controlRequirements.$inferSelect;
export type ControlEvidenceType = typeof controlEvidenceTypes.$inferSelect;
