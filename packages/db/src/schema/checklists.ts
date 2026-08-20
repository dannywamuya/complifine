/**
 * Checklists: the assessment-oriented view of the same requirements.
 *
 * A checklist is not the standard (PRD section 11). The P&Cs define what must
 * be true; the checklist is the instrument an auditor or a producer uses to
 * record whether it is true. They are connected, not duplicated - a checklist
 * item points at a requirement version rather than restating it, so correcting
 * a requirement's text cannot leave the checklist saying something different.
 */

import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { SourceLocation } from "@complifine/core";
import { primaryId, timestamps } from "./_shared.ts";
import { standardDocuments, standardVersions } from "./standards.ts";
import { requirementVersions } from "./requirements.ts";

export const checklists = pgTable(
  "checklists",
  {
    id: primaryId(),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => standardDocuments.id, { onDelete: "cascade" }),

    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Sheet the items were read from, e.g. `P&Cs`. */
    sourceSheet: text("source_sheet"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("checklists_slug_key").on(t.slug),
    index("checklists_version_idx").on(t.standardVersionId),
  ],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: primaryId(),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),

    /**
     * The requirement this item assesses. Nullable because the official
     * workbook's checklist sheet also contains section header rows, which are
     * structural rather than assessable, and discarding them would lose the
     * visual grouping an auditor expects.
     */
    requirementVersionId: uuid("requirement_version_id").references(
      () => requirementVersions.id,
      { onDelete: "cascade" },
    ),

    /** The publisher's GUID for this item - the same PIGUID as the requirement. */
    sourceGuid: text("source_guid"),
    /** Human number as printed on the checklist row. */
    sourceIdentifier: text("source_identifier"),

    /** The question text an assessor answers. */
    questionText: text("question_text"),
    /** Supporting detail shown under the question. */
    criteriaText: text("criteria_text"),

    /**
     * Permitted responses, read from the workbook's own answer columns rather
     * than assumed. IFA v6 offers Yes / No / N/A, but a future standard may
     * differ and hard-coding would make that a schema change.
     */
    responseOptions: jsonb("response_options").$type<string[]>(),

    /** True when the row is a section heading rather than an assessable item. */
    isHeader: jsonb("is_header").$type<boolean>(),

    displayOrder: integer("display_order").notNull(),
    /** Exact cell provenance, e.g. `{ sheet: "P&Cs", row: 42 }`. */
    sourceLocation: jsonb("source_location").$type<SourceLocation>(),

    ...timestamps,
  },
  (t) => [
    index("checklist_items_checklist_idx").on(t.checklistId),
    index("checklist_items_requirement_idx").on(t.requirementVersionId),
    index("checklist_items_order_idx").on(t.checklistId, t.displayOrder),
    uniqueIndex("checklist_items_guid_key").on(t.checklistId, t.sourceGuid),
  ],
);

export const checklistsRelations = relations(checklists, ({ one, many }) => ({
  standardVersion: one(standardVersions, {
    fields: [checklists.standardVersionId],
    references: [standardVersions.id],
  }),
  document: one(standardDocuments, {
    fields: [checklists.documentId],
    references: [standardDocuments.id],
  }),
  items: many(checklistItems),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  checklist: one(checklists, {
    fields: [checklistItems.checklistId],
    references: [checklists.id],
  }),
  requirementVersion: one(requirementVersions, {
    fields: [checklistItems.requirementVersionId],
    references: [requirementVersions.id],
  }),
}));

export type Checklist = typeof checklists.$inferSelect;
export type NewChecklist = typeof checklists.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type NewChecklistItem = typeof checklistItems.$inferInsert;
