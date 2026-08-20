/**
 * The agent's tools.
 *
 * The organising principle: the database answers questions of fact, and the
 * model is only allowed to do the things a database cannot - reading a
 * question, choosing which facts to fetch, and writing prose.
 *
 * So none of these tools asks the model to reason about compliance. Whether
 * FV 20.01 is a Major Must, whether a criterion applies to a producer who does
 * not harvest, how many criteria the Smart edition contains, what changed
 * between Smart and GFS - each is a lookup with one correct answer, decided by
 * imported data and verified by the quality gates. A model asked to infer any
 * of them would be right most of the time, which in compliance is the worst
 * possible failure mode: wrong rarely enough to be trusted.
 *
 * Every tool therefore returns structured, citable rows. `filterChecklist` and
 * `compareEditions` in particular are deterministic resolvers, not prompts:
 * the applicability rules and the cross-edition mapping already exist in the
 * database as reviewed facts.
 */

import { tool } from "ai";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, inArray, or, sql, type Database } from "@complifine/db";
import {
  applicabilityQuestions,
  requirementApplicability,
  requirementRelationships,
  requirementVersions,
  standardDocuments,
  standardSections,
  standardVersions,
} from "@complifine/db";
import {
  AUTHORITY_LEVEL_LABELS,
  DOCUMENT_TYPE_LABELS,
  REQUIREMENT_LEVEL_LABELS,
  REQUIREMENT_LEVELS,
  canonicalizeCriterionNumber,
  parseSectionNumber,
  type AuthorityLevel,
  type DocumentType,
} from "@complifine/core";
import type { Embedder } from "../embed/provider.ts";
import { search } from "../search/hybrid.ts";

export interface ToolContext {
  readonly db: Database;
  readonly embedder: Embedder | null;
  readonly agentRunId?: string;
  /** Called for every tool invocation, for logging and for the UI. */
  readonly onCall?: (call: {
    name: string;
    args: unknown;
    result: unknown;
    durationMs: number;
    error?: string;
  }) => void | Promise<void>;
}

const versionCodeSchema = z
  .enum(["ifa-v6-smart-fv", "ifa-v6-gfs-fv"])
  .describe(
    "Which edition to search. IFA v6 Smart and IFA v6 GFS are parallel, equally valid " +
      "editions with different criteria; omit only when the question is genuinely about both.",
  );

/** Wrap a tool body so every call is timed, logged and never throws at the model. */
function instrument<A, R>(
  context: ToolContext,
  name: string,
  execute: (args: A) => Promise<R>,
): (args: A) => Promise<R | { error: string }> {
  return async (args: A) => {
    const started = performance.now();
    try {
      const result = await execute(args);
      await context.onCall?.({
        name,
        args,
        result,
        durationMs: Math.round(performance.now() - started),
      });
      return result;
    } catch (error) {
      const message = (error as Error).message;
      await context.onCall?.({
        name,
        args,
        result: null,
        durationMs: Math.round(performance.now() - started),
        error: message,
      });
      // Returned rather than thrown: a failed lookup is information the model
      // can act on ("that criterion does not exist"), whereas a thrown error
      // ends the run and produces no answer at all.
      return { error: message };
    }
  };
}

async function versionIdFor(db: Database, code: string): Promise<string> {
  const [version] = await db
    .select({ id: standardVersions.id })
    .from(standardVersions)
    .where(eq(standardVersions.code, code));
  if (!version) throw new Error(`Unknown version "${code}".`);
  return version.id;
}

// ---------------------------------------------------------------------------

export function buildTools(context: ToolContext) {
  const { db, embedder } = context;

  return {
    // -----------------------------------------------------------------------
    searchRequirements: tool({
      description:
        "Search the Principles & Criteria for farm-practice requirements. " +
        "Use natural language; the search combines exact wording and meaning. " +
        "This is the right first step for questions about what a producer must do on the farm. " +
        "For questions about the certification process itself (audits, certificates, transfers), " +
        "use searchGeneralRegulations instead.",
      inputSchema: z.object({
        query: z.string().min(2).describe("What to look for, in natural language."),
        versionCode: versionCodeSchema.optional(),
        limit: z.number().int().min(1).max(20).default(8),
        normativeOnly: z
          .boolean()
          .default(false)
          .describe(
            "Exclude the guideline, which is explicitly non-binding. Set true when the " +
              "question asks what is REQUIRED rather than what is recommended.",
          ),
      }),
      execute: instrument(context, "searchRequirements", async (args) => {
        const result = await search(db, embedder, args.query, {
          versionCode: args.versionCode,
          chunkTypes: ["requirement"],
          limit: args.limit,
          maxAuthorityLevel: args.normativeOnly ? (3 as AuthorityLevel) : undefined,
          agentRunId: context.agentRunId,
        });

        return {
          strategy: result.strategy,
          hits: result.hits.map((hit) => ({
            criterion: hit.requirementId,
            level: hit.requirementLevel ? REQUIREMENT_LEVEL_LABELS[hit.requirementLevel] : null,
            section: hit.sectionTitle,
            edition: hit.versionCode,
            document: hit.documentTitle,
            authority: AUTHORITY_LEVEL_LABELS[hit.authorityLevel as AuthorityLevel],
            page: hit.sourcePage,
            text: hit.text,
          })),
        };
      }),
    }),

    // -----------------------------------------------------------------------
    getRequirement: tool({
      description:
        "Fetch one criterion in full by its number, e.g. 'FV-Smart 32.10.06' or '32.10.06'. " +
        "Always prefer this over search when the question names a criterion.",
      inputSchema: z.object({
        criterionId: z.string().describe("Criterion number, with or without the edition prefix."),
        versionCode: versionCodeSchema.optional(),
      }),
      execute: instrument(context, "getRequirement", async (args) => {
        const candidates = args.criterionId.match(/^(FV-)/i)
          ? [canonicalizeCriterionNumber(args.criterionId)]
          : ["FV-Smart", "FV-GFS"].map((prefix) =>
              canonicalizeCriterionNumber(`${prefix} ${args.criterionId}`),
            );

        const identifiers = candidates.filter((id): id is string => id !== null);
        if (identifiers.length === 0) {
          throw new Error(
            `"${args.criterionId}" is not a criterion number. They look like "FV-Smart 32.10.06".`,
          );
        }

        const conditions = [inArray(requirementVersions.sourceRequirementId, identifiers)];
        if (args.versionCode) {
          conditions.push(
            eq(requirementVersions.standardVersionId, await versionIdFor(db, args.versionCode)),
          );
        }

        const rows = await db
          .select({
            criterion: requirementVersions.sourceRequirementId,
            level: requirementVersions.level,
            principle: requirementVersions.principleText,
            criteria: requirementVersions.criteriaText,
            page: requirementVersions.sourcePage,
            naExempt: requirementVersions.naExempt,
            phuRelated: requirementVersions.phuRelated,
            edition: standardVersions.code,
            editionName: standardVersions.name,
            section: standardSections.title,
            sectionNumber: standardSections.sourceIdentifier,
            document: standardDocuments.title,
          })
          .from(requirementVersions)
          .innerJoin(
            standardVersions,
            eq(standardVersions.id, requirementVersions.standardVersionId),
          )
          .leftJoin(standardSections, eq(standardSections.id, requirementVersions.sectionId))
          .leftJoin(standardDocuments, eq(standardDocuments.id, requirementVersions.documentId))
          .where(and(...conditions));

        if (rows.length === 0) {
          throw new Error(`No criterion "${args.criterionId}" exists in the knowledge base.`);
        }

        return rows.map((row) => ({
          ...row,
          level: REQUIREMENT_LEVEL_LABELS[row.level],
          naExempt: row.naExempt
            ? "This criterion can never be marked not applicable."
            : undefined,
        }));
      }),
    }),

    // -----------------------------------------------------------------------
    listSections: tool({
      description:
        "List the top-level sections of an edition, with how many criteria each contains. " +
        "Use to orient before drilling in, or to answer 'what does the standard cover'.",
      inputSchema: z.object({ versionCode: versionCodeSchema }),
      execute: instrument(context, "listSections", async (args) => {
        const versionId = await versionIdFor(db, args.versionCode);

        const rows = await db
          .select({
            id: standardSections.id,
            number: standardSections.sourceIdentifier,
            title: standardSections.title,
            criteria: count(requirementVersions.id),
          })
          .from(standardSections)
          .leftJoin(
            requirementVersions,
            eq(requirementVersions.sectionId, standardSections.id),
          )
          .innerJoin(standardDocuments, eq(standardDocuments.id, standardSections.documentId))
          .where(
            and(
              eq(standardSections.standardVersionId, versionId),
              eq(standardSections.depth, 1),
              eq(standardDocuments.documentType, "checklist"),
            ),
          )
          .groupBy(standardSections.id, standardSections.sourceIdentifier, standardSections.title)
          .orderBy(asc(standardSections.sectionOrder));

        return rows;
      }),
    }),

    // -----------------------------------------------------------------------
    getSection: tool({
      description:
        "List every criterion in one section, in document order, with levels. " +
        "Use for 'what does section 32 require' or to count criteria in an area.",
      inputSchema: z.object({
        versionCode: versionCodeSchema,
        sectionNumber: z
          .string()
          .describe("Section number as printed, e.g. 'FV 32', or just '32'."),
      }),
      execute: instrument(context, "getSection", async (args) => {
        const versionId = await versionIdFor(db, args.versionCode);

        // Sections are stored as the publisher prints them ("FV 32", "FV 32.10"),
        // but people say "32", "FV 32" and "section 32" interchangeably, and the
        // P&C table of contents drops the leading zero that the checklist keeps.
        const bare = args.sectionNumber.replace(/^(section\s+)?FV[\s-]*/i, "").trim();
        const parsed = parseSectionNumber(`FV ${bare}`);
        const candidates = [...new Set([bare, `FV ${bare}`, parsed?.formatted].filter(Boolean))];

        const [section] = await db
          .select({
            id: standardSections.id,
            title: standardSections.title,
            number: standardSections.sourceIdentifier,
          })
          .from(standardSections)
          .innerJoin(standardDocuments, eq(standardDocuments.id, standardSections.documentId))
          .where(
            and(
              eq(standardSections.standardVersionId, versionId),
              eq(standardDocuments.documentType, "checklist"),
              inArray(standardSections.sourceIdentifier, candidates as string[]),
            ),
          );

        if (!section) throw new Error(`No section "${args.sectionNumber}" in ${args.versionCode}.`);

        // Criteria hang off either the section or one of its subsections, so
        // asking for section 32 must reach criteria filed under 32.10 too.
        const criteria = await db
          .select({
            criterion: requirementVersions.sourceRequirementId,
            level: requirementVersions.level,
            principle: requirementVersions.principleText,
            page: requirementVersions.sourcePage,
          })
          .from(requirementVersions)
          .where(
            and(
              eq(requirementVersions.standardVersionId, versionId),
              or(
                eq(requirementVersions.sectionId, section.id),
                eq(requirementVersions.subsectionId, section.id),
              ),
            ),
          )
          .orderBy(asc(requirementVersions.sortKey));

        return {
          section: `${section.number ?? ""} ${section.title}`.trim(),
          criteriaCount: criteria.length,
          criteria: criteria.map((row) => ({
            ...row,
            level: REQUIREMENT_LEVEL_LABELS[row.level],
          })),
        };
      }),
    }),

    // -----------------------------------------------------------------------
    getApplicability: tool({
      description:
        "List the scoping questions for an edition: the yes/no questions that determine " +
        "which criteria apply to a given producer, with the publisher's own justification " +
        "wording for each exclusion.",
      inputSchema: z.object({ versionCode: versionCodeSchema }),
      execute: instrument(context, "getApplicability", async (args) => {
        const versionId = await versionIdFor(db, args.versionCode);

        const rows = await db
          .select({
            number: applicabilityQuestions.sourceNumber,
            question: applicabilityQuestions.questionText,
            justification: applicabilityQuestions.justificationTemplate,
            exemptingAnswer: applicabilityQuestions.exemptingAnswer,
            affectedCriteria: count(requirementApplicability.id),
          })
          .from(applicabilityQuestions)
          .leftJoin(
            requirementApplicability,
            eq(requirementApplicability.questionId, applicabilityQuestions.id),
          )
          .where(eq(applicabilityQuestions.standardVersionId, versionId))
          .groupBy(
            applicabilityQuestions.id,
            applicabilityQuestions.sourceNumber,
            applicabilityQuestions.questionText,
            applicabilityQuestions.justificationTemplate,
            applicabilityQuestions.exemptingAnswer,
          )
          .orderBy(asc(applicabilityQuestions.displayOrder));

        return rows;
      }),
    }),

    // -----------------------------------------------------------------------
    filterChecklist: tool({
      description:
        "Work out which criteria apply to a specific producer, given their answers to the " +
        "scoping questions. Returns counts by level and the excluded criteria with the " +
        "official justification for each. This is a deterministic calculation over the " +
        "publisher's own applicability rules - use it rather than reasoning about scope yourself.",
      inputSchema: z.object({
        versionCode: versionCodeSchema,
        answers: z
          .array(
            z.object({
              questionNumber: z.number().int().describe("The scoping question's number."),
              answer: z.enum(["yes", "no"]),
            }),
          )
          .describe("Answers given. Unanswered questions are treated as 'yes', i.e. in scope."),
      }),
      execute: instrument(context, "filterChecklist", async (args) => {
        const versionId = await versionIdFor(db, args.versionCode);
        return resolveChecklist(db, versionId, args.answers);
      }),
    }),

    // -----------------------------------------------------------------------
    compareEditions: tool({
      description:
        "Compare IFA v6 Smart with IFA v6 GFS: which criteria exist in only one edition, " +
        "and which are graded more strictly in GFS. Backed by a reviewed mapping, not inference.",
      inputSchema: z.object({
        criterionId: z
          .string()
          .optional()
          .describe("Compare one criterion. Omit for the whole-edition summary."),
      }),
      execute: instrument(context, "compareEditions", async (args) => {
        const relationships = await crossEditionMap(db);

        if (args.criterionId) {
          const bare = args.criterionId.replace(/^FV[\s-]?(Smart|GFS)\s*/i, "").trim();
          const matches = relationships.filter(
            (row) => row.smart.endsWith(bare) || row.gfs.endsWith(bare),
          );

          if (matches.length === 0) {
            return {
              criterion: args.criterionId,
              finding:
                "This criterion has no counterpart in the other edition - it exists in one " +
                "edition only, or the number does not exist at all.",
            };
          }

          return matches.map((row) => ({
            smart: row.smart,
            gfs: row.gfs,
            smartLevel: REQUIREMENT_LEVEL_LABELS[row.smartLevel],
            gfsLevel: REQUIREMENT_LEVEL_LABELS[row.gfsLevel],
            stricterInGfs: row.levelChanged,
            reworded: (row.similarity ?? 1) < 0.99,
          }));
        }

        const counts = await db
          .select({ edition: standardVersions.code, criteria: count(requirementVersions.id) })
          .from(requirementVersions)
          .innerJoin(
            standardVersions,
            eq(standardVersions.id, requirementVersions.standardVersionId),
          )
          .groupBy(standardVersions.code)
          .orderBy(asc(standardVersions.code));

        return {
          criteriaPerEdition: counts,
          sharedCriteria: relationships.length,
          stricterInGfs: relationships
            .filter((row) => row.levelChanged)
            .map((row) => ({
              criterion: row.gfs,
              smartLevel: REQUIREMENT_LEVEL_LABELS[row.smartLevel],
              gfsLevel: REQUIREMENT_LEVEL_LABELS[row.gfsLevel],
            })),
          reworded: relationships
            .filter((row) => (row.similarity ?? 1) < 0.99)
            .map((row) => ({ smart: row.smart, gfs: row.gfs, similarity: row.similarity })),
        };
      }),
    }),

    // -----------------------------------------------------------------------
    searchGeneralRegulations: tool({
      description:
        "Search the General Regulations only: the rules of the certification system itself - " +
        "audit frequency, unannounced audits, sanctions, certificate validity, transfers " +
        "between certification bodies, producer group QMS rules. Use for questions about " +
        "the certification PROCESS rather than about farm practice.",
      inputSchema: z.object({
        query: z.string().min(2),
        limit: z.number().int().min(1).max(15).default(6),
      }),
      execute: instrument(context, "searchGeneralRegulations", async (args) => {
        const result = await search(db, embedder, args.query, {
          chunkTypes: ["section"],
          limit: args.limit,
          maxAuthorityLevel: 2 as AuthorityLevel,
          agentRunId: context.agentRunId,
        });

        return result.hits.map((hit) => ({
          clause: hit.heading,
          document: hit.documentTitle,
          page: hit.sourcePage,
          text: hit.text,
        }));
      }),
    }),

    // -----------------------------------------------------------------------
    getDocument: tool({
      description:
        "List the source documents behind the knowledge base, with their authority level " +
        "and provenance. Use to answer 'where does this come from' or 'is that binding'.",
      inputSchema: z.object({
        versionCode: versionCodeSchema.optional(),
        documentType: z
          .enum([
            "principles_and_criteria",
            "checklist",
            "general_regulations",
            "guidance",
            "update",
            "transition_tool",
          ])
          .optional(),
      }),
      execute: instrument(context, "getDocument", async (args) => {
        const conditions = [];
        if (args.versionCode) {
          conditions.push(
            eq(standardDocuments.standardVersionId, await versionIdFor(db, args.versionCode)),
          );
        }
        if (args.documentType) {
          conditions.push(eq(standardDocuments.documentType, args.documentType as DocumentType));
        }

        const rows = await db
          .select({
            title: standardDocuments.title,
            type: standardDocuments.documentType,
            authorityLevel: standardDocuments.authorityLevel,
            edition: standardVersions.code,
            filename: standardDocuments.filename,
            sourceUrl: standardDocuments.sourceUrl,
            pages: standardDocuments.pageCount,
            publishedAt: standardDocuments.publishedAt,
            retrievedAt: standardDocuments.retrievedAt,
            sha256: standardDocuments.fileHash,
          })
          .from(standardDocuments)
          .innerJoin(
            standardVersions,
            eq(standardVersions.id, standardDocuments.standardVersionId),
          )
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(standardDocuments.authorityLevel), asc(standardDocuments.slug));

        return rows.map((row) => ({
          ...row,
          type: DOCUMENT_TYPE_LABELS[row.type],
          authority: AUTHORITY_LEVEL_LABELS[row.authorityLevel as AuthorityLevel],
          binding: (row.authorityLevel as AuthorityLevel) <= 3,
        }));
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Cross-edition mapping
// ---------------------------------------------------------------------------

/**
 * The Smart-to-GFS correspondence, as stored.
 *
 * Both sides of the relationship are the same table, so it has to be joined to
 * itself under two aliases. The mapping itself was computed once during
 * ingestion by matching criterion numbers and comparing text, and reviewed;
 * this is a read of that decision, not a recomputation of it.
 */
async function crossEditionMap(db: Database) {
  const smart = alias(requirementVersions, "smart");
  const gfs = alias(requirementVersions, "gfs");

  return db
    .select({
      smart: smart.sourceRequirementId,
      gfs: gfs.sourceRequirementId,
      smartLevel: smart.level,
      gfsLevel: gfs.level,
      levelChanged: requirementRelationships.levelChanged,
      similarity: requirementRelationships.textSimilarity,
      notes: requirementRelationships.notes,
    })
    .from(requirementRelationships)
    .innerJoin(smart, eq(smart.id, requirementRelationships.fromRequirementVersionId))
    .innerJoin(gfs, eq(gfs.id, requirementRelationships.toRequirementVersionId))
    .where(eq(requirementRelationships.relationshipType, "equivalent_to"))
    .orderBy(asc(smart.sortKey));
}

// ---------------------------------------------------------------------------
// The applicability resolver
// ---------------------------------------------------------------------------

export interface ChecklistAnswer {
  readonly questionNumber: number;
  readonly answer: "yes" | "no";
}

export interface ChecklistResolution {
  readonly applicable: number;
  readonly excluded: number;
  readonly byLevel: Record<string, number>;
  readonly exclusions: ReadonlyArray<{
    criterion: string;
    level: string;
    reason: string;
    question: string;
  }>;
  readonly note: string;
}

/**
 * Which criteria apply, given a producer's scoping answers.
 *
 * Pure database work, deliberately. The exclusion rules are the publisher's,
 * imported from the checklist's own `S2PQ_relational` table, and the reason
 * printed for each exclusion is the publisher's own sentence rather than
 * anything generated. That matters because this text ends up in the
 * justification column of a real self-assessment.
 *
 * `NA Exempt` criteria are never excluded regardless of the answers, which is
 * also the publisher's rule and not ours.
 */
export async function resolveChecklist(
  db: Database,
  standardVersionId: string,
  answers: readonly ChecklistAnswer[],
): Promise<ChecklistResolution> {
  const questions = await db
    .select()
    .from(applicabilityQuestions)
    .where(eq(applicabilityQuestions.standardVersionId, standardVersionId));

  const byNumber = new Map(questions.map((question) => [question.sourceNumber, question]));

  const exemptingQuestionIds = answers
    .filter((given) => {
      const question = byNumber.get(given.questionNumber);
      return question !== undefined && question.exemptingAnswer === given.answer;
    })
    .map((given) => byNumber.get(given.questionNumber)!.id);

  const requirements = await db
    .select({
      id: requirementVersions.id,
      criterion: requirementVersions.sourceRequirementId,
      level: requirementVersions.level,
      naExempt: requirementVersions.naExempt,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, standardVersionId))
    .orderBy(asc(requirementVersions.sortKey));

  const links =
    exemptingQuestionIds.length === 0
      ? []
      : await db
          .select({
            requirementVersionId: requirementApplicability.requirementVersionId,
            neverExempt: requirementApplicability.neverExempt,
            question: applicabilityQuestions.questionText,
            justification: applicabilityQuestions.justificationTemplate,
          })
          .from(requirementApplicability)
          .innerJoin(
            applicabilityQuestions,
            eq(applicabilityQuestions.id, requirementApplicability.questionId),
          )
          .where(inArray(requirementApplicability.questionId, exemptingQuestionIds));

  const exclusionByRequirement = new Map<string, { question: string; justification: string | null }>();
  for (const link of links) {
    if (link.neverExempt) continue;
    if (!exclusionByRequirement.has(link.requirementVersionId)) {
      exclusionByRequirement.set(link.requirementVersionId, {
        question: link.question,
        justification: link.justification,
      });
    }
  }

  const byLevel: Record<string, number> = Object.fromEntries(
    REQUIREMENT_LEVELS.map((level) => [REQUIREMENT_LEVEL_LABELS[level], 0]),
  );

  const exclusions: Array<ChecklistResolution["exclusions"][number]> = [];

  for (const requirement of requirements) {
    const exclusion = requirement.naExempt
      ? undefined
      : exclusionByRequirement.get(requirement.id);

    if (exclusion) {
      exclusions.push({
        criterion: requirement.criterion,
        level: REQUIREMENT_LEVEL_LABELS[requirement.level],
        reason:
          exclusion.justification ??
          `Excluded by the scoping question "${exclusion.question}".`,
        question: exclusion.question,
      });
    } else {
      byLevel[REQUIREMENT_LEVEL_LABELS[requirement.level]]! += 1;
    }
  }

  return {
    applicable: requirements.length - exclusions.length,
    excluded: exclusions.length,
    byLevel,
    exclusions,
    note:
      "Applicability comes from the publisher's own scoping tables in the official checklist. " +
      "Criteria flagged NA Exempt always apply and are never excluded. " +
      "A certification body makes the final determination.",
  };
}
