/**
 * Quality gates.
 *
 * PRD section 56: a knowledge version may not be published until every
 * blocking gate passes. These are the conditions, expressed as executable
 * assertions rather than as a checklist someone is trusted to have worked
 * through.
 *
 * The expected values are not invented. Criterion counts come from the
 * publisher's own Summary of Changes; level distributions and the cross-edition
 * delta were measured directly from the two official workbooks and are asserted
 * so that a future revision cannot change them without someone noticing. A gate
 * that merely restates whatever the data happens to say would be decorative.
 *
 * Gates are split into blocking and advisory. Blocking gates protect
 * correctness: a missing criterion, a wrong level, a requirement absent from
 * the standard. Advisory gates surface things a human should look at but which
 * are not defects - most notably the two disagreeing applicability tables in
 * the source workbook, which is the publisher's inconsistency and not ours to
 * resolve silently.
 */

import { and, count, eq, isNotNull, isNull, sql, type Database } from "@complifine/db";
import {
  applicabilityQuestions,
  checklistItems,
  checklists,
  qualityGateResults,
  requirementApplicability,
  requirementVersions,
  standardDocuments,
  standardSections,
  standards,
  standardVersions,
} from "@complifine/db";
import { REQUIREMENT_LEVEL_LABELS, isGgapEdition, type Edition, type RequirementLevel } from "@complifine/core";
import { verifyStoredFile } from "./storage.ts";
import { SMETA_GATES } from "./smeta/gates.ts";

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

interface EditionExpectation {
  readonly criteriaCount: number;
  readonly levels: Record<RequirementLevel, number>;
  readonly scopingQuestions: number;
  /** Source of these numbers, quoted in gate output. */
  readonly provenance: string;
}

export const EDITION_EXPECTATIONS: Record<Edition, EditionExpectation> = {
  smart: {
    criteriaCount: 190,
    levels: { major_must: 103, minor_must: 67, recommendation: 20 },
    scopingQuestions: 16,
    provenance:
      "GLOBALG.A.P. Summary of Changes IFA v5 to v6 gives 190 criteria for the Smart edition, matching the official Smart checklist workbook. " +
      "The summary's level breakdown (102/68/20) predates publication and disagrees with the workbook by one criterion; the workbook figure is used.",
  },
  gfs: {
    criteriaCount: 191,
    levels: { major_must: 118, minor_must: 53, recommendation: 20 },
    scopingQuestions: 16,
    provenance:
      "GLOBALG.A.P. Summary of Changes IFA v5 to v6 gives 191 criteria for the GFS edition, matching the official GFS checklist workbook. " +
      "As with Smart, the summary's level breakdown (117/54/20) predates publication and differs by one criterion from the workbook.",
  },
};

/**
 * The measured difference between the two editions.
 *
 * GFS is the stricter edition: it carries every Smart criterion, adds one, and
 * escalates fourteen from Minor Must to Major Must. No criterion is ever
 * relaxed in the other direction. Asserting this shape means a future import
 * that quietly loses the escalations - which would understate a GFS producer's
 * obligations - fails rather than publishes.
 */
export const CROSS_EDITION_EXPECTATION = {
  sharedCriteria: 190,
  gfsOnly: ["FV-GFS 33.07.01"],
  smartOnly: [] as string[],
  levelEscalations: 14,
  levelRelaxations: 0,
  minIdenticalPrincipleTexts: 187,
} as const;

/** Mean PDF text coverage below which the import is not trustworthy. */
const MIN_MEAN_COVERAGE = 0.95;
/** Per-requirement coverage below which that requirement is flagged. */
const MIN_REQUIREMENT_COVERAGE = 0.5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GateOutcome {
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly score?: number;
  readonly failures?: unknown[];
}

export interface Gate {
  readonly name: string;
  readonly description: string;
  readonly blocking: boolean;
  run(context: GateContext): Promise<GateOutcome>;
}

export interface GateContext {
  readonly db: Database;
  readonly standardVersionId: string;
  readonly versionCode: string;
  readonly edition: string;
}

export interface GateReport {
  readonly results: ReadonlyArray<GateOutcome & { gate: string; description: string; blocking: boolean }>;
  readonly passed: boolean;
  readonly blockingFailures: number;
  readonly advisoryFailures: number;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

const requirementCount: Gate = {
  name: "requirement-count",
  description: "The version holds exactly the number of criteria the publisher declares",
  blocking: true,
  async run({ db, standardVersionId, edition }) {
    if (!isGgapEdition(edition)) {
      return { passed: true, expected: "n/a", actual: "not a GLOBALG.A.P. edition" };
    }
    const expected = EDITION_EXPECTATIONS[edition];
    const [row] = await db
      .select({ value: count() })
      .from(requirementVersions)
      .where(eq(requirementVersions.standardVersionId, standardVersionId));

    const actual = row?.value ?? 0;
    return {
      passed: actual === expected.criteriaCount,
      expected: `${expected.criteriaCount} criteria (${expected.provenance})`,
      actual: `${actual} criteria`,
    };
  },
};

const levelDistribution: Gate = {
  name: "level-distribution",
  description: "Criteria are graded Major Must / Minor Must / Recommendation in the expected proportions",
  blocking: true,
  async run({ db, standardVersionId, edition }) {
    if (!isGgapEdition(edition)) {
      return { passed: true, expected: "n/a", actual: "not a GLOBALG.A.P. edition" };
    }
    const expected = EDITION_EXPECTATIONS[edition].levels;

    const rows = await db
      .select({ level: requirementVersions.level, value: count() })
      .from(requirementVersions)
      .where(eq(requirementVersions.standardVersionId, standardVersionId))
      .groupBy(requirementVersions.level);

    const actual: Record<string, number> = {};
    for (const row of rows) actual[row.level] = row.value;

    const failures = (Object.keys(expected) as RequirementLevel[])
      .filter((level) => (actual[level] ?? 0) !== expected[level])
      .map((level) => ({
        level: REQUIREMENT_LEVEL_LABELS[level],
        expected: expected[level],
        actual: actual[level] ?? 0,
      }));

    const render = (counts: Record<string, number>) =>
      (Object.keys(expected) as RequirementLevel[])
        .map((level) => `${REQUIREMENT_LEVEL_LABELS[level]}=${counts[level] ?? 0}`)
        .join(", ");

    return {
      passed: failures.length === 0,
      expected: render(expected),
      actual: render(actual),
      failures,
    };
  },
};

const stableKeyUniqueness: Gate = {
  name: "stable-key-uniqueness",
  description: "Every criterion carries a distinct publisher GUID and a distinct criterion number",
  blocking: true,
  async run({ db, standardVersionId }) {
    const duplicates = await db.execute<{ source_requirement_id: string; n: number }>(sql`
      SELECT rv.source_requirement_id, COUNT(*)::int AS n
      FROM requirement_versions rv
      WHERE rv.standard_version_id = ${standardVersionId}
      GROUP BY rv.source_requirement_id
      HAVING COUNT(*) > 1
    `);

    const missingKeys = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n
      FROM requirement_versions rv
      JOIN requirements r ON r.id = rv.requirement_id
      WHERE rv.standard_version_id = ${standardVersionId}
        AND (r.stable_key IS NULL OR r.stable_key = '')
    `);

    const duplicateRows = [...duplicates];
    const missing = missingKeys[0]?.n ?? 0;

    return {
      passed: duplicateRows.length === 0 && missing === 0,
      expected: "0 duplicate criterion numbers, 0 criteria without a publisher GUID",
      actual: `${duplicateRows.length} duplicates, ${missing} without a GUID`,
      failures: duplicateRows,
    };
  },
};

const requirementCompleteness: Gate = {
  name: "requirement-completeness",
  description: "Every criterion has principle text, a level, and a section",
  blocking: true,
  async run({ db, standardVersionId }) {
    const rows = await db.execute<{
      source_requirement_id: string;
      missing_principle: boolean;
      missing_section: boolean;
    }>(sql`
      SELECT rv.source_requirement_id,
             (rv.principle_text IS NULL OR btrim(rv.principle_text) = '') AS missing_principle,
             (rv.section_id IS NULL) AS missing_section
      FROM requirement_versions rv
      WHERE rv.standard_version_id = ${standardVersionId}
        AND ((rv.principle_text IS NULL OR btrim(rv.principle_text) = '') OR rv.section_id IS NULL)
      ORDER BY rv.sort_key
    `);

    const failures = [...rows];
    return {
      passed: failures.length === 0,
      expected: "0 incomplete criteria",
      actual: `${failures.length} incomplete criteria`,
      failures,
    };
  },
};

const pageProvenance: Gate = {
  name: "page-provenance",
  description: "Every criterion cites a page in the authoritative Principles & Criteria PDF",
  blocking: true,
  async run({ db, standardVersionId }) {
    const missing = await db
      .select({ id: requirementVersions.sourceRequirementId })
      .from(requirementVersions)
      .where(
        and(
          eq(requirementVersions.standardVersionId, standardVersionId),
          isNull(requirementVersions.sourcePage),
        ),
      )
      .orderBy(requirementVersions.sortKey);

    const [total] = await db
      .select({ value: count() })
      .from(requirementVersions)
      .where(eq(requirementVersions.standardVersionId, standardVersionId));

    return {
      passed: missing.length === 0,
      expected: "every criterion mapped to a PDF page",
      actual: `${(total?.value ?? 0) - missing.length}/${total?.value ?? 0} mapped`,
      score: total?.value ? 1 - missing.length / total.value : 0,
      failures: missing.map((m) => m.id),
    };
  },
};

const sectionTree: Gate = {
  name: "section-tree",
  description: "The section hierarchy is complete and every subsection has a parent",
  blocking: true,
  async run({ db, standardVersionId }) {
    const orphans = await db
      .select({ id: standardSections.id, title: standardSections.title })
      .from(standardSections)
      .where(
        and(
          eq(standardSections.standardVersionId, standardVersionId),
          eq(standardSections.depth, 2),
          isNull(standardSections.parentId),
        ),
      );

    const [total] = await db
      .select({ value: count() })
      .from(standardSections)
      .where(eq(standardSections.standardVersionId, standardVersionId));

    return {
      passed: orphans.length === 0,
      expected: "0 subsections without a parent",
      actual: `${orphans.length} orphaned of ${total?.value ?? 0} sections`,
      failures: orphans,
    };
  },
};

/**
 * Every long-form document is checked against the outline it publishes itself.
 *
 * The General Regulations state their own structure on their contents page, so
 * "did we parse this document correctly" has an answer written inside the
 * document rather than one we have to assert from outside. Any clause the
 * publisher lists and we did not import is a hole in what the system can
 * retrieve, and holes in a regulations corpus are the kind of defect that only
 * shows up when somebody needed the missing clause.
 */
const contentsCoverage: Gate = {
  name: "contents-coverage",
  description:
    "Every clause listed in a long-form document's own table of contents was imported",
  blocking: true,
  async run({ db, standardVersionId }) {
    const { extractPdf } = await import("./pdf/extract.ts");
    const { parseContents } = await import("./pdf/section-parser.ts");
    const { readStoredFile } = await import("./storage.ts");

    const documents = (
      await db
        .select()
        .from(standardDocuments)
        .where(
          and(
            eq(standardDocuments.standardVersionId, standardVersionId),
            isNotNull(standardDocuments.storageKey),
          ),
        )
    ).filter((d) => d.documentType === "general_regulations" || d.documentType === "guidance");

    const failures: Array<{ document: string; clause: string }> = [];
    let declared = 0;
    let imported = 0;

    for (const document of documents) {
      const pdf = await extractPdf(await readStoredFile(document.storageKey!));
      const numbered = parseContents(pdf).filter((entry) => entry.number !== null);
      if (numbered.length === 0) continue;

      const present = new Set(
        (
          await db
            .select({ identifier: standardSections.sourceIdentifier })
            .from(standardSections)
            .where(eq(standardSections.documentId, document.id))
        )
          .map((row) => row.identifier)
          .filter((identifier): identifier is string => identifier !== null),
      );

      declared += numbered.length;
      for (const entry of numbered) {
        if (present.has(entry.number!)) imported++;
        else failures.push({ document: document.slug, clause: `${entry.number} ${entry.title}` });
      }
    }

    return {
      passed: failures.length === 0,
      expected: "every clause on every contents page imported",
      actual: `${imported}/${declared} across ${documents.length} long-form documents`,
      score: declared === 0 ? 1 : imported / declared,
      failures,
    };
  },
};

const applicabilityIntegrity: Gate = {
  name: "applicability-integrity",
  description: "Scoping questions are complete and every applicability link resolves",
  blocking: true,
  async run({ db, standardVersionId, edition }) {
    if (!isGgapEdition(edition)) {
      return { passed: true, expected: "n/a", actual: "not a GLOBALG.A.P. edition" };
    }
    const expected = EDITION_EXPECTATIONS[edition].scopingQuestions;

    const questions = await db
      .select()
      .from(applicabilityQuestions)
      .where(eq(applicabilityQuestions.standardVersionId, standardVersionId));

    const withoutJustification = questions.filter(
      (q) => !q.justificationTemplate || q.justificationTemplate.trim() === "",
    );

    // A link whose requirement belongs to a different version would silently
    // exclude the wrong criterion.
    const crossVersion = await db.execute<{ n: number }>(sql`
      SELECT COUNT(*)::int AS n
      FROM requirement_applicability ra
      JOIN applicability_questions q ON q.id = ra.question_id
      JOIN requirement_versions rv ON rv.id = ra.requirement_version_id
      WHERE q.standard_version_id = ${standardVersionId}
        AND rv.standard_version_id <> q.standard_version_id
    `);

    const dangling = crossVersion[0]?.n ?? 0;
    const passed =
      questions.length === expected && withoutJustification.length === 0 && dangling === 0;

    return {
      passed,
      expected: `${expected} scoping questions, all with official justification text, 0 cross-version links`,
      actual: `${questions.length} questions, ${withoutJustification.length} missing justification, ${dangling} cross-version links`,
      failures: withoutJustification.map((q) => q.questionText),
    };
  },
};

const applicabilityCorroboration: Gate = {
  name: "applicability-corroboration",
  description:
    "How far the workbook's two applicability tables agree with each other (advisory: the disagreement is the publisher's, and both sides are correct)",
  blocking: false,
  async run({ db, standardVersionId }) {
    const rows = await db.execute<{ evidence: string[]; n: number }>(sql`
      SELECT ra.evidence, COUNT(*)::int AS n
      FROM requirement_applicability ra
      JOIN applicability_questions q ON q.id = ra.question_id
      WHERE q.standard_version_id = ${standardVersionId}
      GROUP BY ra.evidence
    `);

    let both = 0;
    let relationalOnly = 0;
    let columnOnly = 0;

    for (const row of rows) {
      const evidence = row.evidence ?? [];
      if (evidence.length >= 2) both += row.n;
      else if (evidence.includes("s2pq_relational")) relationalOnly += row.n;
      else if (evidence.includes("pi_column")) columnOnly += row.n;
    }

    const total = both + relationalOnly + columnOnly;

    return {
      passed: true,
      expected: "informational",
      actual:
        `${total} links: ${both} corroborated by both source tables, ` +
        `${relationalOnly} only in S2PQ_relational, ${columnOnly} only in the criteria sheet`,
      score: total > 0 ? both / total : 1,
    };
  },
};

const checklistCoverage: Gate = {
  name: "checklist-coverage",
  description: "Every criterion appears on the assessment checklist",
  blocking: true,
  async run({ db, standardVersionId }) {
    const missing = await db.execute<{ source_requirement_id: string }>(sql`
      SELECT rv.source_requirement_id
      FROM requirement_versions rv
      WHERE rv.standard_version_id = ${standardVersionId}
        AND NOT EXISTS (
          SELECT 1 FROM checklist_items ci
          WHERE ci.requirement_version_id = rv.id
        )
      ORDER BY rv.sort_key
    `);

    const [total] = await db
      .select({ value: count() })
      .from(requirementVersions)
      .where(eq(requirementVersions.standardVersionId, standardVersionId));

    const failures = [...missing].map((r) => r.source_requirement_id);

    return {
      passed: failures.length === 0,
      expected: "every criterion on the checklist",
      actual: `${(total?.value ?? 0) - failures.length}/${total?.value ?? 0} covered`,
      failures,
    };
  },
};

const sourceIntegrity: Gate = {
  name: "source-integrity",
  description: "Every preserved source file still hashes to its recorded value",
  blocking: true,
  async run({ db, standardVersionId }) {
    const documents = await db
      .select()
      .from(standardDocuments)
      .where(
        and(
          eq(standardDocuments.standardVersionId, standardVersionId),
          isNotNull(standardDocuments.fileHash),
        ),
      );

    const failures: string[] = [];
    for (const document of documents) {
      if (!document.storageKey || !document.fileHash) continue;
      if (!(await verifyStoredFile(document.storageKey, document.fileHash))) {
        failures.push(document.slug);
      }
    }

    const notFetched = (
      await db
        .select({ slug: standardDocuments.slug, metadata: standardDocuments.metadata })
        .from(standardDocuments)
        .where(
          and(
            eq(standardDocuments.standardVersionId, standardVersionId),
            isNull(standardDocuments.fileHash),
          ),
        )
      // A document the publisher has withdrawn cannot be fetched and must not
      // hold up publication. The manifest records the withdrawal, so this is a
      // known and reviewed absence rather than an oversight.
    ).filter((d) => d.metadata.availability !== "withdrawn");

    return {
      passed: failures.length === 0 && notFetched.length === 0,
      expected: "all registered documents fetched and hash-verified",
      actual:
        `${documents.length - failures.length}/${documents.length} verified` +
        (notFetched.length ? `, ${notFetched.length} never fetched` : ""),
      failures: [
        ...failures.map((slug) => ({ slug, problem: "hash mismatch" })),
        ...notFetched.map((d) => ({ slug: d.slug, problem: "never fetched" })),
      ],
    };
  },
};

const pdfTextAgreement: Gate = {
  name: "pdf-text-agreement",
  description:
    "Requirement text imported from the checklist matches the text printed in the Principles & Criteria PDF",
  blocking: true,
  async run(context) {
    // Recomputed here rather than trusted from the mapping run, so the gate is
    // a genuine independent check that can be re-run at any time against the
    // current database and the preserved PDF.
    const { computeTextAgreement } = await import("./steps/verify-text.ts");
    const report = await computeTextAgreement(context.db, context.standardVersionId);

    const belowThreshold = report.perRequirement.filter(
      (r) => r.coverage < MIN_REQUIREMENT_COVERAGE,
    );

    return {
      passed: report.meanCoverage >= MIN_MEAN_COVERAGE && belowThreshold.length === 0,
      expected: `mean text coverage >= ${MIN_MEAN_COVERAGE}, every criterion >= ${MIN_REQUIREMENT_COVERAGE}`,
      actual: `mean ${report.meanCoverage.toFixed(4)}, ${belowThreshold.length} criteria below the floor`,
      score: report.meanCoverage,
      failures: belowThreshold.slice(0, 25),
    };
  },
};

const crossEditionShape: Gate = {
  name: "cross-edition-shape",
  description:
    "The Smart and GFS editions relate to each other as the publisher's own documentation describes",
  blocking: true,
  async run({ db }) {
    const { linkEditions } = await import("./steps/cross-edition.ts");

    // A no-op job context: this gate reads the relationship, it does not
    // rebuild it, so nothing needs logging to the ingestion event stream.
    const silent = {
      jobId: "gate",
      runId: "gate",
      log: async () => {},
      debug: async () => {},
      info: async () => {},
      warn: async () => {},
      error: async () => {},
      count: () => {},
    };

    const report = await linkEditions(db, silent, {
      smartVersionCode: "ifa-v6-smart-fv",
      gfsVersionCode: "ifa-v6-gfs-fv",
      write: false,
    });

    const expected = CROSS_EDITION_EXPECTATION;
    const failures: Array<{ check: string; expected: unknown; actual: unknown }> = [];

    const assert = (check: string, exp: unknown, act: unknown) => {
      if (JSON.stringify(exp) !== JSON.stringify(act)) failures.push({ check, expected: exp, actual: act });
    };

    assert("shared criteria", expected.sharedCriteria, report.matched);
    assert("GFS-only criteria", [...expected.gfsOnly], [...report.gfsOnly]);
    assert("Smart-only criteria", [...expected.smartOnly], [...report.smartOnly]);
    assert("level escalations", expected.levelEscalations, report.escalations.length);
    // The load-bearing one. GFS is the GFSI-recognised edition and must never
    // be laxer than Smart; a relaxation would mean a GFS producer being told
    // they can do less than a Smart producer, which is backwards.
    assert("level relaxations", expected.levelRelaxations, report.relaxations.length);

    if (report.identicalTexts < expected.minIdenticalPrincipleTexts) {
      failures.push({
        check: "identical principle texts",
        expected: `>= ${expected.minIdenticalPrincipleTexts}`,
        actual: report.identicalTexts,
      });
    }

    return {
      passed: failures.length === 0,
      expected:
        `${expected.sharedCriteria} shared, GFS adds ${expected.gfsOnly.join(", ")}, ` +
        `${expected.levelEscalations} escalations, ${expected.levelRelaxations} relaxations`,
      actual:
        `${report.matched} shared, GFS adds ${report.gfsOnly.join(", ") || "nothing"}, ` +
        `${report.escalations.length} escalations, ${report.relaxations.length} relaxations`,
      failures,
    };
  },
};

export const GATES: readonly Gate[] = [
  requirementCount,
  levelDistribution,
  stableKeyUniqueness,
  requirementCompleteness,
  sectionTree,
  pageProvenance,
  pdfTextAgreement,
  applicabilityIntegrity,
  contentsCoverage,
  applicabilityCorroboration,
  checklistCoverage,
  crossEditionShape,
  sourceIntegrity,
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runGates(
  db: Database,
  standardVersionId: string,
  options: { only?: readonly string[] } = {},
): Promise<GateReport> {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.id, standardVersionId));

  if (!version) throw new Error(`Unknown standard version: ${standardVersionId}`);

  const [standard] = await db
    .select()
    .from(standards)
    .where(eq(standards.id, version.standardId));

  const suite = standard?.code === "smeta" ? SMETA_GATES : GATES;

  const context: GateContext = {
    db,
    standardVersionId,
    versionCode: version.code,
    edition: version.edition,
  };

  const selected = options.only?.length
    ? suite.filter((gate) => options.only!.includes(gate.name))
    : suite;

  const results: Array<GateOutcome & { gate: string; description: string; blocking: boolean }> = [];

  for (const gate of selected) {
    let outcome: GateOutcome;
    try {
      outcome = await gate.run(context);
    } catch (error) {
      // A gate that throws is a failed gate, never a skipped one. Swallowing
      // the error would let a broken check masquerade as a passing one.
      outcome = {
        passed: false,
        expected: gate.description,
        actual: `gate errored: ${(error as Error).message}`,
        failures: [{ error: (error as Error).message }],
      };
    }

    results.push({
      ...outcome,
      gate: gate.name,
      description: gate.description,
      blocking: gate.blocking,
    });

    await db
      .insert(qualityGateResults)
      .values({
        standardVersionId,
        gate: gate.name,
        description: gate.description,
        passed: outcome.passed,
        blocking: gate.blocking,
        expected: outcome.expected,
        actual: outcome.actual,
        score: outcome.score ?? null,
        failures: outcome.failures ?? [],
        checkedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [qualityGateResults.standardVersionId, qualityGateResults.gate],
        set: {
          description: gate.description,
          passed: outcome.passed,
          blocking: gate.blocking,
          expected: outcome.expected,
          actual: outcome.actual,
          score: outcome.score ?? null,
          failures: outcome.failures ?? [],
          checkedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  const blockingFailures = results.filter((r) => !r.passed && r.blocking).length;
  const advisoryFailures = results.filter((r) => !r.passed && !r.blocking).length;

  return {
    results,
    passed: blockingFailures === 0,
    blockingFailures,
    advisoryFailures,
  };
}
