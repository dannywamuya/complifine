/**
 * Document structure: the original hierarchy of the source, kept queryable.
 *
 * The PRD is emphatic (section 22) that we must not flatten a document into a
 * bag of requirements. The section tree is what lets a reviewer answer "show
 * me everything under Plant Protection Products" and what gives long-form
 * prose (General Regulations, guideline) chunk boundaries that follow the
 * author's own outline rather than an arbitrary character count.
 */

import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./_shared.ts";
import { standardDocuments, standardVersions } from "./standards.ts";

export const standardSections = pgTable(
  "standard_sections",
  {
    id: primaryId(),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),
    /**
     * The document this section was read from. Nullable because a section can
     * be shared conceptually across a version's documents (the P&C PDF and the
     * checklist describe the same section tree), and we attribute it to the
     * document that defined it.
     */
    documentId: uuid("document_id").references(() => standardDocuments.id, {
      onDelete: "set null",
    }),

    parentId: uuid("parent_id").references((): any => standardSections.id, {
      onDelete: "cascade",
    }),

    /**
     * The publisher's GUID for this section, from the workbook's `SGUID` and
     * `SSGUID` columns. Present for checklist-derived sections, absent for
     * sections we derive from PDF headings.
     */
    sourceGuid: text("source_guid"),

    /** Human identifier, e.g. `FV 32` or `FV 32.10`. */
    sourceIdentifier: text("source_identifier"),
    title: text("title").notNull(),
    /** Introductory prose attached to the section, from the workbook `Sbody`. */
    body: text("body"),

    /** Depth: 1 for a section, 2 for a subsection. */
    depth: integer("depth").notNull().default(1),
    /**
     * The publisher's own ordering key: 32 for section 32, 3210 for 32.10.
     * Reusing their encoding means imported and derived orderings agree, and
     * an ORDER BY produces exactly the sequence printed in the standard.
     */
    sectionOrder: integer("section_order").notNull(),

    sourcePage: integer("source_page"),

    ...timestamps,
  },
  (t) => [
    index("standard_sections_version_idx").on(t.standardVersionId),
    index("standard_sections_parent_idx").on(t.parentId),
    index("standard_sections_order_idx").on(t.standardVersionId, t.sectionOrder),
    uniqueIndex("standard_sections_guid_key").on(t.standardVersionId, t.sourceGuid),
  ],
);

export const standardSectionsRelations = relations(standardSections, ({ one, many }) => ({
  standardVersion: one(standardVersions, {
    fields: [standardSections.standardVersionId],
    references: [standardVersions.id],
  }),
  document: one(standardDocuments, {
    fields: [standardSections.documentId],
    references: [standardDocuments.id],
  }),
  parent: one(standardSections, {
    fields: [standardSections.parentId],
    references: [standardSections.id],
    relationName: "sectionTree",
  }),
  children: many(standardSections, { relationName: "sectionTree" }),
}));

export type StandardSection = typeof standardSections.$inferSelect;
export type NewStandardSection = typeof standardSections.$inferInsert;
