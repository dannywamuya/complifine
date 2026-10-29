/**
 * Company evidence: the files a company holds and the compliance records
 * that point at them.
 *
 * `documents` are company files, never knowledge `standard_documents`. An
 * `evidence` row says "this site has this expected evidence type, valid from
 * here to there", whether it came from an uploaded lab report or from a
 * submitted register (`source = form`). The gap list and readiness read only
 * this table, so both intake paths count the same way.
 */

import { relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  companyDocumentPurposeEnum,
  evidenceSourceEnum,
  evidenceVerificationEnum,
  primaryId,
  timestamps,
} from "./_shared.ts";
import { organizations, users } from "./tenancy.ts";
import { sites } from "./operations.ts";
import { controls, evidenceTypes } from "./controls.ts";
import { requirementVersions } from "./requirements.ts";
import { formRecords } from "./forms.ts";

export const companyDocuments = pgTable(
  "documents",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    purpose: companyDocumentPurposeEnum("purpose").notNull().default("evidence"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    fileHash: text("file_hash").notNull(),
    /** Path within STORAGE_ROOT, e.g. `orgs/<orgId>/evidence/<sha256>.pdf`. */
    storageKey: text("storage_key").notNull(),
    /** Text the auditor can read. Null until extraction succeeds. */
    extractedText: text("extracted_text"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("documents_org_idx").on(t.organizationId),
    index("documents_site_idx").on(t.siteId),
    index("documents_hash_idx").on(t.organizationId, t.fileHash),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    evidenceTypeId: uuid("evidence_type_id")
      .notNull()
      .references(() => evidenceTypes.id, { onDelete: "restrict" }),
    documentId: uuid("document_id").references(() => companyDocuments.id, { onDelete: "set null" }),
    formRecordId: uuid("form_record_id").references(() => formRecords.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    verificationStatus: evidenceVerificationEnum("verification_status").notNull().default("unverified"),
    source: evidenceSourceEnum("source").notNull().default("upload"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("evidence_org_idx").on(t.organizationId),
    index("evidence_site_type_idx").on(t.siteId, t.evidenceTypeId),
    uniqueIndex("evidence_form_record_key").on(t.formRecordId),
  ],
);

export const evidenceControls = pgTable(
  "evidence_controls",
  {
    id: primaryId(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    controlId: uuid("control_id")
      .notNull()
      .references(() => controls.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("evidence_controls_key").on(t.evidenceId, t.controlId)],
);

export const evidenceRequirements = pgTable(
  "evidence_requirements",
  {
    id: primaryId(),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("evidence_requirements_key").on(t.evidenceId, t.requirementVersionId),
    index("evidence_requirements_requirement_idx").on(t.requirementVersionId),
  ],
);

export const companyDocumentsRelations = relations(companyDocuments, ({ one }) => ({
  organization: one(organizations, {
    fields: [companyDocuments.organizationId],
    references: [organizations.id],
  }),
  site: one(sites, { fields: [companyDocuments.siteId], references: [sites.id] }),
}));

export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  site: one(sites, { fields: [evidence.siteId], references: [sites.id] }),
  evidenceType: one(evidenceTypes, {
    fields: [evidence.evidenceTypeId],
    references: [evidenceTypes.id],
  }),
  document: one(companyDocuments, {
    fields: [evidence.documentId],
    references: [companyDocuments.id],
  }),
  formRecord: one(formRecords, { fields: [evidence.formRecordId], references: [formRecords.id] }),
  controls: many(evidenceControls),
  requirements: many(evidenceRequirements),
}));

export const evidenceControlsRelations = relations(evidenceControls, ({ one }) => ({
  evidence: one(evidence, { fields: [evidenceControls.evidenceId], references: [evidence.id] }),
  control: one(controls, { fields: [evidenceControls.controlId], references: [controls.id] }),
}));

export const evidenceRequirementsRelations = relations(evidenceRequirements, ({ one }) => ({
  evidence: one(evidence, {
    fields: [evidenceRequirements.evidenceId],
    references: [evidence.id],
  }),
  requirementVersion: one(requirementVersions, {
    fields: [evidenceRequirements.requirementVersionId],
    references: [requirementVersions.id],
  }),
}));

export type CompanyDocument = typeof companyDocuments.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
