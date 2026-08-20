/**
 * Requirements: identity separated from wording.
 *
 * `requirements` is the thing that persists across editions of a standard.
 * `requirement_versions` is what a specific published version says about it.
 * The PRD calls this out (section 43) and it is the single most important
 * modelling decision in the knowledge layer: without it, "what changed in v6?"
 * is unanswerable, because there is nothing stable to compare across versions.
 *
 * We key identity on GLOBALG.A.P.'s own GUID rather than a key we invent. That
 * GUID appears in the `PIs` table of the official checklist workbook, survives
 * renumbering, and is the publisher's own answer to "is this the same
 * requirement". Inventing our own key would mean re-deriving identity on every
 * import and getting it subtly wrong.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
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
import type { SourceLocation } from "@complifine/core";
import {
  primaryId,
  relationshipOriginEnum,
  relationshipTypeEnum,
  requirementLevelEnum,
  requirementStatusEnum,
  timestamps,
} from "./_shared.ts";
import { standards, standardDocuments, standardVersions } from "./standards.ts";
import { standardSections } from "./structure.ts";

// ---------------------------------------------------------------------------
// requirements - stable identity
// ---------------------------------------------------------------------------

export const requirements = pgTable(
  "requirements",
  {
    id: primaryId(),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "restrict" }),

    /**
     * The publisher's GUID, e.g. `1Gmd3v6po0V454XQEGKJ0x`.
     *
     * Scoped to the standard, not the version, so that when IFA v6.1 reuses a
     * GUID we recognise it as the same requirement and create a new
     * requirement_version rather than a duplicate identity.
     *
     * Note this does NOT unify the Smart and GFS editions: research confirmed
     * their GUID namespaces are completely disjoint (zero overlap across 190
     * and 191 criteria). Cross-edition correspondence is expressed as an
     * explicit relationship instead, which is honest about the fact that it is
     * our inference rather than the publisher's assertion.
     */
    stableKey: text("stable_key").notNull(),

    /** Most recent human number, denormalised for readable listings and search. */
    latestSourceIdentifier: text("latest_source_identifier"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("requirements_stable_key").on(t.standardId, t.stableKey),
    index("requirements_latest_identifier_idx").on(t.latestSourceIdentifier),
  ],
);

// ---------------------------------------------------------------------------
// requirement_versions - what a given published version says
// ---------------------------------------------------------------------------

export const requirementVersions = pgTable(
  "requirement_versions",
  {
    id: primaryId(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),
    /** The document this wording was extracted from. */
    documentId: uuid("document_id").references(() => standardDocuments.id, {
      onDelete: "set null",
    }),

    /** Human criterion number, e.g. `FV-Smart 03.01`. Canonicalised on import. */
    sourceRequirementId: text("source_requirement_id").notNull(),
    /** Numeric sort key derived from the number: section*10000 + sub*100 + ordinal. */
    sortKey: integer("sort_key").notNull(),

    sectionId: uuid("section_id").references(() => standardSections.id, {
      onDelete: "set null",
    }),
    subsectionId: uuid("subsection_id").references(() => standardSections.id, {
      onDelete: "set null",
    }),

    /**
     * Principle and criteria are stored separately because the source treats
     * them as different things and the distinction is operationally load
     * bearing: the principle states the outcome that must be achieved, the
     * criteria states how compliance is demonstrated. An auditor assesses
     * against the criteria; a manager plans against the principle. Merging
     * them into one `text` field would destroy that.
     */
    principleGuid: text("principle_guid"),
    principleText: text("principle_text").notNull(),
    criteriaGuid: text("criteria_guid"),
    criteriaText: text("criteria_text"),

    levelGuid: text("level_guid"),
    level: requirementLevelEnum("level").notNull(),

    /**
     * `NA Exempt` in the workbook: the criterion may never be marked not
     * applicable, regardless of scoping answers.
     */
    naExempt: boolean("na_exempt").notNull().default(false),
    /** `PHU` in the workbook: relates to a product handling unit. */
    phuRelated: boolean("phu_related").notNull().default(false),

    /** Page in the authoritative P&C PDF. Backfilled by the PDF page mapper. */
    sourcePage: integer("source_page"),
    /** Structured location within the source, for cell-level auditability. */
    sourceLocation: jsonb("source_location").$type<SourceLocation>(),
    /** Verbatim snippet captured at import, so a reviewer can spot-check. */
    sourceExcerpt: text("source_excerpt"),

    status: requirementStatusEnum("status").notNull().default("extracted"),

    effectiveDate: date("effective_date"),
    retirementDate: date("retirement_date"),

    /**
     * SHA-256 of the normalised principle + criteria + level. Lets a re-import
     * detect that nothing changed and skip the write, which keeps `updated_at`
     * meaningful and makes re-running ingestion genuinely idempotent.
     */
    contentHash: text("content_hash").notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("requirement_versions_identity_key").on(
      t.standardVersionId,
      t.sourceRequirementId,
    ),
    uniqueIndex("requirement_versions_requirement_key").on(
      t.standardVersionId,
      t.requirementId,
    ),
    index("requirement_versions_version_idx").on(t.standardVersionId),
    index("requirement_versions_level_idx").on(t.standardVersionId, t.level),
    index("requirement_versions_section_idx").on(t.sectionId),
    index("requirement_versions_sort_idx").on(t.standardVersionId, t.sortKey),
    index("requirement_versions_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// requirement_relationships
// ---------------------------------------------------------------------------

export const requirementRelationships = pgTable(
  "requirement_relationships",
  {
    id: primaryId(),
    fromRequirementVersionId: uuid("from_requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),
    toRequirementVersionId: uuid("to_requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),

    relationshipType: relationshipTypeEnum("relationship_type").notNull(),

    /**
     * How we know. `source_declared` means the publisher said so;
     * `deterministic_match` means an algorithm with stated rules derived it;
     * `ai_proposed` means a model suggested it and it is not yet trustworthy.
     * The PRD requires (section 44) that AI-generated relationships stay
     * visibly proposed until reviewed, which this column enforces.
     */
    origin: relationshipOriginEnum("origin").notNull(),
    confidence: doublePrecision("confidence"),

    /** Dice similarity of the two principle texts, when computed. */
    textSimilarity: doublePrecision("text_similarity"),
    /** True when the two sides carry different requirement levels. */
    levelChanged: boolean("level_changed").notNull().default(false),

    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("requirement_relationships_key").on(
      t.fromRequirementVersionId,
      t.toRequirementVersionId,
      t.relationshipType,
    ),
    index("requirement_relationships_from_idx").on(t.fromRequirementVersionId),
    index("requirement_relationships_to_idx").on(t.toRequirementVersionId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const requirementsRelations = relations(requirements, ({ one, many }) => ({
  standard: one(standards, {
    fields: [requirements.standardId],
    references: [standards.id],
  }),
  versions: many(requirementVersions),
}));

export const requirementVersionsRelations = relations(
  requirementVersions,
  ({ one, many }) => ({
    requirement: one(requirements, {
      fields: [requirementVersions.requirementId],
      references: [requirements.id],
    }),
    standardVersion: one(standardVersions, {
      fields: [requirementVersions.standardVersionId],
      references: [standardVersions.id],
    }),
    document: one(standardDocuments, {
      fields: [requirementVersions.documentId],
      references: [standardDocuments.id],
    }),
    section: one(standardSections, {
      fields: [requirementVersions.sectionId],
      references: [standardSections.id],
      relationName: "requirementSection",
    }),
    subsection: one(standardSections, {
      fields: [requirementVersions.subsectionId],
      references: [standardSections.id],
      relationName: "requirementSubsection",
    }),
    outgoingRelationships: many(requirementRelationships, { relationName: "fromRequirement" }),
    incomingRelationships: many(requirementRelationships, { relationName: "toRequirement" }),
  }),
);

export const requirementRelationshipsRelations = relations(
  requirementRelationships,
  ({ one }) => ({
    from: one(requirementVersions, {
      fields: [requirementRelationships.fromRequirementVersionId],
      references: [requirementVersions.id],
      relationName: "fromRequirement",
    }),
    to: one(requirementVersions, {
      fields: [requirementRelationships.toRequirementVersionId],
      references: [requirementVersions.id],
      relationName: "toRequirement",
    }),
  }),
);

export type Requirement = typeof requirements.$inferSelect;
export type NewRequirement = typeof requirements.$inferInsert;
export type RequirementVersion = typeof requirementVersions.$inferSelect;
export type NewRequirementVersion = typeof requirementVersions.$inferInsert;
export type RequirementRelationship = typeof requirementRelationships.$inferSelect;
export type NewRequirementRelationship = typeof requirementRelationships.$inferInsert;
