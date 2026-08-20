/**
 * Applicability: which requirements apply to which producer.
 *
 * This is normally the hardest part of a compliance product to get right,
 * because it is usually inference. Here it is not. GLOBALG.A.P. ships its own
 * applicability engine inside the official checklist workbook:
 *
 *   - the `S2PQ` table holds 16 scoping questions plus, for each, the exact
 *     justification sentence to print when a criterion is excluded;
 *   - the `S2PQ_relational` table maps question GUIDs to criterion GUIDs
 *     (250 links for Smart, 145 for GFS).
 *
 * So the rules below are imported facts, not derived ones, and they carry the
 * publisher's own wording for why something does not apply - which is exactly
 * what an auditor expects to see written in the justification column.
 */

import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  applicabilitySourceEnum,
  primaryId,
  scopingAnswerEnum,
  timestamps,
} from "./_shared.ts";
import { standardVersions } from "./standards.ts";
import { requirementVersions } from "./requirements.ts";

// ---------------------------------------------------------------------------
// applicability_questions
// ---------------------------------------------------------------------------

export const applicabilityQuestions = pgTable(
  "applicability_questions",
  {
    id: primaryId(),
    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),

    /** The publisher's `S2PQGUID`. */
    sourceGuid: text("source_guid").notNull(),
    /** The publisher's display number for the question, from `Effective Number`. */
    sourceNumber: integer("source_number"),

    /** e.g. "Has the producer been registered for parallel ownership?" */
    questionText: text("question_text").notNull(),

    /**
     * The publisher's own justification sentence, printed verbatim when a
     * criterion is excluded because of this question. Storing it means our
     * exclusion rationale is quotable from the source rather than paraphrased.
     */
    justificationTemplate: text("justification_template"),

    /**
     * The answer that causes linked criteria to become not applicable.
     *
     * In the official workbook this is always "no": the questions are phrased
     * so that answering no removes the requirement ("Has the producer used
     * subcontractors?" -> no -> the subcontractor criteria drop out). Stored
     * per question anyway rather than assumed globally, because a future
     * standard could phrase one the other way and a silent wrong default here
     * would exclude requirements that actually apply.
     */
    exemptingAnswer: scopingAnswerEnum("exempting_answer").notNull().default("no"),

    displayOrder: integer("display_order").notNull().default(0),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("applicability_questions_guid_key").on(t.standardVersionId, t.sourceGuid),
    index("applicability_questions_version_idx").on(t.standardVersionId),
  ],
);

// ---------------------------------------------------------------------------
// requirement_applicability
// ---------------------------------------------------------------------------

export const requirementApplicability = pgTable(
  "requirement_applicability",
  {
    id: primaryId(),
    requirementVersionId: uuid("requirement_version_id")
      .notNull()
      .references(() => requirementVersions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => applicabilityQuestions.id, { onDelete: "cascade" }),

    /**
     * Provenance of the rule. Official rules come from the workbook and are
     * authoritative; anything we or a model add is marked differently so it can
     * never be mistaken for the publisher's position.
     */
    source: applicabilitySourceEnum("source").notNull().default("globalgap_official"),

    /**
     * When true, this link cannot exclude the requirement even if the question
     * is answered the exempting way. Mirrors the workbook's `NA Exempt` flag,
     * which marks criteria that always apply.
     */
    neverExempt: boolean("never_exempt").notNull().default(false),

    /**
     * Which of the workbook's two link tables asserted this rule.
     *
     * The official checklist states applicability twice and incompletely in
     * both places: `S2PQ_relational` is a many-to-many table, and the `PIs`
     * sheet carries a single denormalised link per criterion. Neither is a
     * superset - for IFA v6 Smart the two overlap on 58 links while
     * contributing 12 and 25 of their own respectively, and spot-checking the
     * differences shows both sets are correct (they cover adjacent
     * subsections of the same plant protection product chapter).
     *
     * So we import the union and record which table vouched for each link,
     * rather than picking a winner and silently losing real rules. A
     * non-blocking quality gate reports the disagreement for review.
     */
    evidence: text("evidence").array().notNull().default(sql`ARRAY[]::text[]`),

    notes: text("notes"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("requirement_applicability_key").on(t.requirementVersionId, t.questionId),
    index("requirement_applicability_requirement_idx").on(t.requirementVersionId),
    index("requirement_applicability_question_idx").on(t.questionId),
  ],
);

export const applicabilityQuestionsRelations = relations(
  applicabilityQuestions,
  ({ one, many }) => ({
    standardVersion: one(standardVersions, {
      fields: [applicabilityQuestions.standardVersionId],
      references: [standardVersions.id],
    }),
    links: many(requirementApplicability),
  }),
);

export const requirementApplicabilityRelations = relations(
  requirementApplicability,
  ({ one }) => ({
    requirementVersion: one(requirementVersions, {
      fields: [requirementApplicability.requirementVersionId],
      references: [requirementVersions.id],
    }),
    question: one(applicabilityQuestions, {
      fields: [requirementApplicability.questionId],
      references: [applicabilityQuestions.id],
    }),
  }),
);

export type ApplicabilityQuestion = typeof applicabilityQuestions.$inferSelect;
export type NewApplicabilityQuestion = typeof applicabilityQuestions.$inferInsert;
export type RequirementApplicability = typeof requirementApplicability.$inferSelect;
export type NewRequirementApplicability = typeof requirementApplicability.$inferInsert;
