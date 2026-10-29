/**
 * Form templates and the records a site fills from them.
 *
 * Templates are company artifacts, not standard artifacts: a training register
 * satisfies IFA v6 and ETI alike. A template names the `evidence_type` it
 * produces and the control library does the rest, so adding a standard never
 * touches this table.
 *
 * Library templates have `organization_id` null and carry the full
 * `definition`. An organisation variant points at its parent and stores only
 * `overrides` (header defaults, option lists, fixed rows, text); the columns
 * always come from the parent, so a variant cannot drift from what the gap
 * list and the capture pipeline expect.
 *
 * A record is `draft` until a person submits it. Only submission creates the
 * `evidence` row; AI capture writes drafts and nothing else.
 */

import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { FormDefinition, FormValues, FormVariantOverrides } from "@complifine/core";
import {
  formCadenceEnum,
  formCategoryEnum,
  formRecordOriginEnum,
  formRecordStatusEnum,
  primaryId,
  timestamps,
} from "./_shared.ts";
import { organizations, users } from "./tenancy.ts";
import { sites } from "./operations.ts";
import { evidenceTypes } from "./controls.ts";
import { agentRuns } from "./ai.ts";
import { companyDocuments, evidence } from "./evidence.ts";

/** Per-field provenance for a value the capture pipeline filled. */
export interface FieldExtraction {
  readonly confidence: number;
  readonly source?: string;
}

export type EntryExtraction = Record<string, FieldExtraction>;

export const formTemplates = pgTable(
  "form_templates",
  {
    id: primaryId(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: formCategoryEnum("category").notNull(),
    siteTypes: text("site_types").array().notNull().default([]),
    cadence: formCadenceEnum("cadence").notNull(),
    evidenceTypeId: uuid("evidence_type_id").references(() => evidenceTypes.id, {
      onDelete: "restrict",
    }),
    /** Null on variants; read the parent's and apply `overrides`. */
    definition: jsonb("definition").$type<FormDefinition>(),
    overrides: jsonb("overrides").$type<FormVariantOverrides>(),
    version: integer("version").notNull().default(1),
    /** Where the template came from, e.g. `AFREX GG/FARM/REC28`. */
    sourceRef: text("source_ref"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    parentTemplateId: uuid("parent_template_id"),
    docRef: text("doc_ref"),
    approverRole: text("approver_role"),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("form_templates_library_slug_key")
      .on(t.slug)
      .where(sql`organization_id IS NULL`),
    uniqueIndex("form_templates_variant_key")
      .on(t.organizationId, t.parentTemplateId)
      .where(sql`organization_id IS NOT NULL`),
    index("form_templates_org_idx").on(t.organizationId),
  ],
);

export const formRecords = pgTable(
  "form_records",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** Always the library template; the org variant is resolved at read time. */
    templateId: uuid("template_id")
      .notNull()
      .references(() => formTemplates.id, { onDelete: "restrict" }),
    templateVersion: integer("template_version").notNull().default(1),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    status: formRecordStatusEnum("status").notNull().default("draft"),
    origin: formRecordOriginEnum("origin").notNull().default("manual"),
    header: jsonb("header").$type<FormValues>().notNull().default({}),
    headerExtraction: jsonb("header_extraction").$type<EntryExtraction>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    sourceDocumentId: uuid("source_document_id").references(() => companyDocuments.id, {
      onDelete: "set null",
    }),
    captureRunId: uuid("capture_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    evidenceId: uuid("evidence_id"),
    ...timestamps,
  },
  (t) => [
    index("form_records_site_template_idx").on(t.siteId, t.templateId),
    index("form_records_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const formRecordEntries = pgTable(
  "form_record_entries",
  {
    id: primaryId(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => formRecords.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data").$type<FormValues>().notNull().default({}),
    /** Set by capture; a field's mark is removed when a person edits it. */
    extraction: jsonb("extraction").$type<EntryExtraction>(),
    enteredBy: uuid("entered_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("form_record_entries_record_idx").on(t.recordId, t.recordedAt)],
);

export const formTemplatesRelations = relations(formTemplates, ({ one }) => ({
  evidenceType: one(evidenceTypes, {
    fields: [formTemplates.evidenceTypeId],
    references: [evidenceTypes.id],
  }),
}));

export const formRecordsRelations = relations(formRecords, ({ one, many }) => ({
  template: one(formTemplates, { fields: [formRecords.templateId], references: [formTemplates.id] }),
  site: one(sites, { fields: [formRecords.siteId], references: [sites.id] }),
  entries: many(formRecordEntries),
  evidence: one(evidence, { fields: [formRecords.evidenceId], references: [evidence.id] }),
}));

export const formRecordEntriesRelations = relations(formRecordEntries, ({ one }) => ({
  record: one(formRecords, { fields: [formRecordEntries.recordId], references: [formRecords.id] }),
}));

export type FormTemplate = typeof formTemplates.$inferSelect;
export type NewFormTemplate = typeof formTemplates.$inferInsert;
export type FormRecord = typeof formRecords.$inferSelect;
export type FormRecordEntry = typeof formRecordEntries.$inferSelect;
