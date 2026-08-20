/**
 * Standards, versions and source documents.
 *
 * The top of the compliance knowledge layer. A `standard` is the scheme
 * itself (GLOBALG.A.P. IFA); a `standard_version` is one immutable published
 * edition of it for one product scope (IFA v6 Smart for Fruit and Vegetables);
 * a `standard_document` is a single official file belonging to that version.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  createdAtOnly,
  documentStatusEnum,
  documentTypeEnum,
  editionEnum,
  primaryId,
  timestamps,
  versionStatusEnum,
} from "./_shared.ts";

// ---------------------------------------------------------------------------
// standards
// ---------------------------------------------------------------------------

export const standards = pgTable(
  "standards",
  {
    id: primaryId(),
    /** Stable machine key, e.g. `globalgap-ifa`. Used in URLs and storage paths. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    publisher: text("publisher").notNull(),
    description: text("description"),
    /** Publisher's canonical landing page for the scheme. */
    homepageUrl: text("homepage_url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("standards_code_key").on(t.code)],
);

// ---------------------------------------------------------------------------
// standard_versions
// ---------------------------------------------------------------------------

export const standardVersions = pgTable(
  "standard_versions",
  {
    id: primaryId(),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "restrict" }),

    /** Stable machine key, e.g. `ifa-v6-smart-fv`. */
    code: text("code").notNull(),
    name: text("name").notNull(),

    /**
     * Smart and GFS are parallel, equally valid editions with separate
     * requirement sets and separate GUID namespaces - verified during
     * research: the two workbooks share zero criterion GUIDs. Modelling them
     * as distinct versions rather than variants of one is therefore not a
     * stylistic choice, it is what the source data requires.
     */
    edition: editionEnum("edition").notNull(),
    /** Numeric version as the publisher writes it, e.g. `6.0`, `6.0-GFS`. */
    version: text("version").notNull(),
    /** Product scope slug, e.g. `fruit-and-vegetables`. */
    scope: text("scope").notNull(),

    status: versionStatusEnum("status").notNull().default("draft"),

    /** Date the version becomes usable for certification. */
    effectiveDate: date("effective_date"),
    /** Date after which the version may no longer be audited against. */
    retirementDate: date("retirement_date"),
    /** Date this version became mandatory in place of its predecessor. */
    mandatoryFrom: date("mandatory_from"),

    /** The version this one supersedes, when known. */
    replacesVersionId: uuid("replaces_version_id").references(
      (): any => standardVersions.id,
      { onDelete: "set null" },
    ),
    /** Free-text label for a predecessor not modelled in the database, e.g. `5.4-1-GFS`. */
    replacesLabel: text("replaces_label"),

    /** Set when the version passed every quality gate and was published. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("standard_versions_code_key").on(t.code),
    index("standard_versions_standard_idx").on(t.standardId),
    index("standard_versions_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// standard_documents
// ---------------------------------------------------------------------------

export const standardDocuments = pgTable(
  "standard_documents",
  {
    id: primaryId(),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),

    /** Stable machine key within a version, e.g. `ifa-v6-smart-fv-pcs`. */
    slug: text("slug").notNull(),
    documentType: documentTypeEnum("document_type").notNull(),

    /**
     * Where this document sits in the source hierarchy, 1 (official standard)
     * to 8 (AI interpretation). Stored per document rather than derived from
     * type, because the same type can carry different authority: a checklist
     * from the publisher is level 3, the same checklist annotated by a
     * certification body is level 6.
     */
    authorityLevel: smallint("authority_level").notNull(),

    title: text("title").notNull(),
    /** Publisher's own document code, e.g. `IFA Smart PCs for FV; v6.0_Sep22`. */
    documentCode: text("document_code"),
    language: text("language").notNull().default("en"),

    /** Original filename as published. Not identity - see `fileHash`. */
    filename: text("filename").notNull(),
    sourceUrl: text("source_url"),
    /** Alternate URL for the same bytes, used when the primary host fails. */
    mirrorUrl: text("mirror_url"),

    /**
     * SHA-256 of the file as downloaded. This is the real identity of a source
     * document: filenames are reused across regenerations, so comparing them
     * would miss a silent content change.
     */
    fileHash: text("file_hash"),
    byteSize: bigint("byte_size", { mode: "number" }),
    mimeType: text("mime_type"),
    /** Path within STORAGE_ROOT where the untouched original is preserved. */
    storageKey: text("storage_key"),

    /** `Last-Modified` as reported by the origin, for cheap drift detection. */
    lastModifiedHeader: timestamp("last_modified_header", { withTimezone: true }),
    /** `ETag` as reported by the origin. */
    etag: text("etag"),

    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    /** Publication date printed inside the document. */
    publishedAt: date("published_at"),
    /** Validity date printed inside the document. */
    validFrom: date("valid_from"),

    /** Page count for PDFs, sheet count for workbooks. Null until parsed. */
    pageCount: integer("page_count"),

    status: documentStatusEnum("status").notNull().default("registered"),

    /** Copyright and redistribution terms, so display can be gated per document. */
    licenseNote: text("license_note"),

    /** Type-specific metadata that does not deserve a column. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("standard_documents_slug_key").on(t.slug),
    index("standard_documents_version_idx").on(t.standardVersionId),
    index("standard_documents_type_idx").on(t.documentType),
    index("standard_documents_hash_idx").on(t.fileHash),
    // A version has exactly one authoritative statement of its requirements
    // and one checklist per language. It does NOT have one of everything else:
    // IFA v6 ships six separate General Regulations documents (individual
    // producers, producer groups, plants scope, parallel ownership, flexible
    // distribution, certification bodies), all simultaneously in force. The
    // predicate names the singular types rather than assuming all types are.
    uniqueIndex("standard_documents_singular_key")
      .on(t.standardVersionId, t.documentType, t.language)
      .where(
        sql`status <> 'superseded' AND document_type IN ('principles_and_criteria', 'checklist')`,
      ),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const standardsRelations = relations(standards, ({ many }) => ({
  versions: many(standardVersions),
}));

export const standardVersionsRelations = relations(standardVersions, ({ one, many }) => ({
  standard: one(standards, {
    fields: [standardVersions.standardId],
    references: [standards.id],
  }),
  replaces: one(standardVersions, {
    fields: [standardVersions.replacesVersionId],
    references: [standardVersions.id],
    relationName: "supersession",
  }),
  documents: many(standardDocuments),
}));

export const standardDocumentsRelations = relations(standardDocuments, ({ one }) => ({
  standardVersion: one(standardVersions, {
    fields: [standardDocuments.standardVersionId],
    references: [standardVersions.id],
  }),
}));

export type Standard = typeof standards.$inferSelect;
export type NewStandard = typeof standards.$inferInsert;
export type StandardVersion = typeof standardVersions.$inferSelect;
export type NewStandardVersion = typeof standardVersions.$inferInsert;
export type StandardDocument = typeof standardDocuments.$inferSelect;
export type NewStandardDocument = typeof standardDocuments.$inferInsert;
