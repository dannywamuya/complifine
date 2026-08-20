/**
 * Adapter: official GLOBALG.A.P. checklist workbook -> the universal model.
 *
 * This is the standard-specific translation layer the PRD calls for in section
 * 31. Nothing above it knows what a "PIs" sheet is; nothing below it knows
 * what a `requirement_version` is.
 *
 * The workbook is far better structured than a compliance PDF has any right to
 * be. Behind the printed checklist sit hidden sheets holding a normalised
 * relational model: `PIs` is the criteria table with stable GUIDs, `allsections`
 * is the section tree, `Level` is a lookup table, and `S2PQ` plus
 * `S2PQ_relational` encode the applicability engine. Extraction is therefore
 * deterministic parsing, not AI inference - which is the right answer, because
 * a language model reading a compliance PDF will eventually paraphrase a Major
 * Must and nobody will notice.
 *
 * Column names in `PIs` are the publisher's and two of them are actively
 * misleading:
 *
 *   `L`      holds the level GUID   (not the level)
 *   `LGUID`  holds the level label  (not the GUID)
 *
 * Verified across both editions: resolving `L` through the `Level` table
 * reproduces the `LGUID` label for all 381 criteria with zero mismatches. We
 * resolve through the lookup and treat the cached label as a cross-check,
 * because the label is a cached formula result and the GUID is data.
 */

import {
  canonicalizeCriterionNumber,
  excerpt,
  parseCriterionNumber,
  parseRequirementLevel,
  parseSectionNumber,
  stripSectionNumber,
  type Edition,
  type RequirementLevel,
  type SourceLocation,
} from "@complifine/core";
import {
  Workbook,
  cellFlag,
  cellNumber,
  cellText,
  type TableRecord,
} from "./workbook.ts";

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ParsedSection {
  readonly sourceGuid: string;
  readonly sourceIdentifier: string | null;
  readonly title: string;
  readonly body: string | null;
  readonly depth: number;
  readonly sectionOrder: number;
  /** GUID of the parent section, resolved from the section numbering. */
  readonly parentGuid: string | null;
}

export interface ParsedRequirement {
  readonly stableKey: string;
  readonly sourceRequirementId: string;
  readonly sortKey: number;
  readonly sectionGuid: string | null;
  readonly subsectionGuid: string | null;
  readonly principleGuid: string | null;
  readonly principleText: string;
  readonly criteriaGuid: string | null;
  readonly criteriaText: string | null;
  readonly levelGuid: string | null;
  readonly level: RequirementLevel;
  /** The cached label from the workbook, kept for the cross-check gate. */
  readonly cachedLevelLabel: string | null;
  readonly naExempt: boolean;
  readonly phuRelated: boolean;
  readonly sourceLocation: SourceLocation;
  readonly sourceExcerpt: string;
}

export interface ParsedQuestion {
  readonly sourceGuid: string;
  readonly sourceNumber: number | null;
  readonly questionText: string;
  readonly justificationTemplate: string | null;
  readonly displayOrder: number;
}

export interface ParsedApplicabilityLink {
  readonly requirementStableKey: string;
  readonly questionGuid: string;
  /** Which workbook table asserted this link. */
  readonly evidence: readonly string[];
}

export interface ParsedChecklistItem {
  readonly sourceGuid: string | null;
  readonly sourceIdentifier: string | null;
  readonly questionText: string | null;
  readonly criteriaText: string | null;
  readonly responseOptions: string[] | null;
  readonly isHeader: boolean;
  readonly displayOrder: number;
  readonly sourceLocation: SourceLocation;
}

export interface ParsedChecklist {
  readonly edition: Edition;
  readonly sections: readonly ParsedSection[];
  readonly requirements: readonly ParsedRequirement[];
  readonly questions: readonly ParsedQuestion[];
  readonly applicabilityLinks: readonly ParsedApplicabilityLink[];
  readonly checklistItems: readonly ParsedChecklistItem[];
  readonly diagnostics: ParseDiagnostics;
}

/**
 * Everything the parser noticed but did not treat as fatal.
 *
 * Surfaced rather than logged and forgotten: the reconciliation gates assert
 * on these counts, so a workbook that starts dropping rows fails the build
 * instead of quietly shrinking the knowledge base.
 */
export interface ParseDiagnostics {
  readonly piRowsRead: number;
  readonly piRowsSkipped: number;
  readonly levelLabelMismatches: number;
  readonly unresolvedLevelGuids: number;
  readonly unparseableCriterionNumbers: string[];
  readonly unresolvedSectionGuids: string[];
  /** Links dropped because one end referenced another product's template. */
  readonly danglingRelationalLinks: number;
  readonly linksFromRelational: number;
  readonly linksFromPiColumn: number;
  readonly linksInBoth: number;
}

// ---------------------------------------------------------------------------
// Table and column names
// ---------------------------------------------------------------------------

const TABLES = {
  criteria: "PIs",
  sections: "allsections",
  levels: "Level",
  questions: "S2PQ",
  questionLinks: "S2PQ_relational",
} as const;

const COL = {
  guid: "GUID",
  number: "Number",
  principleGuid: "PGUID",
  principle: "P",
  criteriaGuid: "CGUID",
  criteria: "C",
  /** Holds the level GUID despite the name. */
  levelGuid: "L",
  /** Holds the level label despite the name. */
  levelLabel: "LGUID",
  sectionGuid: "SGUID",
  order: "Order",
  subsectionGuid: "SSGUID",
  naExempt: "NA Exempt",
  phu: "PHU",
  /** Denormalised single applicability link. */
  linkedQuestion: "Column2",
} as const;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseChecklistWorkbook(workbook: Workbook, edition: Edition): ParsedChecklist {
  const levels = readLevelLookup(workbook);
  const { catalogue: sectionCatalogue, nullSentinels } = readSectionCatalogue(workbook);

  const criteriaRows = workbook
    .readTable(TABLES.criteria)
    .filter((row) => !row.isEmpty && cellText(row.values[COL.guid]) !== null);

  // --- requirements --------------------------------------------------------
  const requirements: ParsedRequirement[] = [];
  const unparseableCriterionNumbers: string[] = [];
  const referencedSectionGuids = new Set<string>();
  const unresolvedSectionGuids = new Set<string>();
  let levelLabelMismatches = 0;
  let unresolvedLevelGuids = 0;
  let skipped = 0;

  for (const row of criteriaRows) {
    const stableKey = cellText(row.values[COL.guid]);
    const rawNumber = cellText(row.values[COL.number]);
    const principleText = cellText(row.values[COL.principle]);

    // A row without an identity, a number or a principle is not a criterion.
    // Counted rather than silently dropped so the gate can see it.
    if (!stableKey || !rawNumber || !principleText) {
      skipped++;
      continue;
    }

    const parsedNumber = parseCriterionNumber(rawNumber);
    if (!parsedNumber) {
      unparseableCriterionNumbers.push(rawNumber);
      skipped++;
      continue;
    }

    const levelGuid = cellText(row.values[COL.levelGuid]);
    const cachedLevelLabel = cellText(row.values[COL.levelLabel]);
    const resolvedLabel = levelGuid ? (levels.get(levelGuid) ?? null) : null;

    if (levelGuid && !resolvedLabel) unresolvedLevelGuids++;
    if (resolvedLabel && cachedLevelLabel && resolvedLabel !== cachedLevelLabel) {
      levelLabelMismatches++;
    }

    // Prefer the lookup, fall back to the cached label. Refusing to guess: an
    // unrecognisable level means the row is skipped and the count reported,
    // because defaulting a Major Must to a Recommendation would understate an
    // audit blocker.
    const level = parseRequirementLevel(resolvedLabel ?? cachedLevelLabel);
    if (!level) {
      skipped++;
      continue;
    }

    const sectionGuid = cellText(row.values[COL.sectionGuid]);
    const subsectionGuid = cellText(row.values[COL.subsectionGuid]);
    for (const guid of [sectionGuid, subsectionGuid]) {
      if (!guid || nullSentinels.has(guid)) continue;
      if (sectionCatalogue.has(guid)) referencedSectionGuids.add(guid);
      else unresolvedSectionGuids.add(guid);
    }

    const criteriaText = cellText(row.values[COL.criteria]);

    requirements.push({
      stableKey,
      sourceRequirementId: parsedNumber.formatted,
      sortKey: parsedNumber.sortKey,
      sectionGuid: sectionGuid && sectionCatalogue.has(sectionGuid) ? sectionGuid : null,
      subsectionGuid:
        subsectionGuid && sectionCatalogue.has(subsectionGuid) ? subsectionGuid : null,
      principleGuid: cellText(row.values[COL.principleGuid]),
      principleText,
      criteriaGuid: cellText(row.values[COL.criteriaGuid]),
      criteriaText,
      levelGuid,
      level,
      cachedLevelLabel,
      naExempt: cellFlag(row.values[COL.naExempt]),
      phuRelated: cellFlag(row.values[COL.phu]),
      sourceLocation: {
        kind: "xlsx",
        sheet: row.sheetName,
        table: row.tableName ?? undefined,
        row: row.rowIndex,
        columns: {
          guid: row.refs[COL.guid]!,
          number: row.refs[COL.number]!,
          principle: row.refs[COL.principle]!,
          criteria: row.refs[COL.criteria]!,
          level: row.refs[COL.levelGuid]!,
        },
      },
      sourceExcerpt: excerpt(
        criteriaText ? `${principleText} ${criteriaText}` : principleText,
        280,
      ),
    });
  }

  requirements.sort((a, b) => a.sortKey - b.sortKey);

  // --- sections ------------------------------------------------------------
  const sections = buildSectionTree(sectionCatalogue, referencedSectionGuids);

  // --- applicability -------------------------------------------------------
  const questions = readQuestions(workbook);
  const questionGuids = new Set(questions.map((q) => q.sourceGuid));
  const requirementGuids = new Set(requirements.map((r) => r.stableKey));

  const { links, diagnostics: linkDiagnostics } = readApplicabilityLinks(
    workbook,
    criteriaRows,
    requirementGuids,
    questionGuids,
  );

  // --- checklist items -----------------------------------------------------
  const checklistItems = readChecklistItems(workbook);

  return {
    edition,
    sections,
    requirements,
    questions,
    applicabilityLinks: links,
    checklistItems,
    diagnostics: {
      piRowsRead: criteriaRows.length,
      piRowsSkipped: skipped,
      levelLabelMismatches,
      unresolvedLevelGuids,
      unparseableCriterionNumbers,
      unresolvedSectionGuids: [...unresolvedSectionGuids],
      ...linkDiagnostics,
    },
  };
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

function readLevelLookup(workbook: Workbook): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const row of workbook.readTable(TABLES.levels)) {
    const guid = cellText(row.values["GUID"]);
    const label = cellText(row.values["Level"]);
    if (guid && label) lookup.set(guid, label);
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface CatalogueEntry {
  readonly guid: string;
  readonly rawTitle: string;
  readonly body: string | null;
  readonly order: number | null;
}

/**
 * Read `allsections`, which is the section catalogue for every IFA product,
 * not just this one. 329 entries cover aquaculture, flowers, livestock and the
 * rest; only the 71 with an `FV` prefix concern us, and of those only the ones
 * actually referenced by a criterion get imported.
 */
function readSectionCatalogue(workbook: Workbook): {
  catalogue: Map<string, CatalogueEntry>;
  /**
   * GUIDs that exist in the catalogue but carry the "-" placeholder for both
   * title and body. There is exactly one, and it is the workbook's way of
   * saying "this criterion has no subsection" - 80 of the 190 Smart criteria
   * point at it. Recognising it as a sentinel rather than a missing section is
   * the difference between a clean parse and a spurious warning on nearly half
   * the corpus.
   */
  nullSentinels: Set<string>;
} {
  const catalogue = new Map<string, CatalogueEntry>();
  const nullSentinels = new Set<string>();

  for (const row of workbook.readTable(TABLES.sections)) {
    const guid = cellText(row.values["SGUID"]);
    if (!guid) continue;

    const rawTitle = cellText(row.values["S"]);
    if (!rawTitle) {
      // `cellText` has already folded the "-" placeholder to null.
      nullSentinels.add(guid);
      continue;
    }

    catalogue.set(guid, {
      guid,
      rawTitle,
      body: cellText(row.values["Sbody"]),
      order: cellNumber(row.values["Order"]),
    });
  }

  return { catalogue, nullSentinels };
}

/**
 * Turn the flat catalogue into a two-level tree.
 *
 * Parentage comes from the numbering rather than from a parent column, because
 * the workbook has no parent column: `FV 32.10` belongs under `FV 32` because
 * of what it is called. That is also how the printed standard expresses it.
 */
function buildSectionTree(
  catalogue: Map<string, CatalogueEntry>,
  referenced: ReadonlySet<string>,
): ParsedSection[] {
  const parsed: Array<ParsedSection & { section: number; subsection: number | null }> = [];

  for (const guid of referenced) {
    const entry = catalogue.get(guid);
    if (!entry) continue;

    const number = parseSectionNumber(entry.rawTitle);
    const title = stripSectionNumber(entry.rawTitle) || entry.rawTitle;

    parsed.push({
      sourceGuid: guid,
      sourceIdentifier: number?.formatted ?? null,
      title,
      body: entry.body,
      depth: number?.subsection == null ? 1 : 2,
      // Prefer the derived order over the workbook's `Order`: the latter is
      // the top-level section number even on subsection rows, so sorting by it
      // alone would scramble subsections within a section.
      sectionOrder: number?.order ?? entry.order ?? 0,
      parentGuid: null,
      section: number?.section ?? 0,
      subsection: number?.subsection ?? null,
    });
  }

  // Index top-level sections so subsections can find their parent by number.
  const topLevelByNumber = new Map<number, string>();
  for (const item of parsed) {
    if (item.subsection === null) topLevelByNumber.set(item.section, item.sourceGuid);
  }

  const withParents = parsed.map(
    ({ section, subsection, ...rest }): ParsedSection => ({
      ...rest,
      parentGuid:
        subsection === null ? null : (topLevelByNumber.get(section) ?? null),
    }),
  );

  return withParents.sort((a, b) => a.sectionOrder - b.sectionOrder);
}

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------

function readQuestions(workbook: Workbook): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let order = 0;

  for (const row of workbook.readTable(TABLES.questions)) {
    const guid = cellText(row.values["S2PQGUID"]);
    const text = cellText(row.values["Step 2 questions"]);
    if (!guid || !text) continue;

    questions.push({
      sourceGuid: guid,
      sourceNumber: cellNumber(row.values["Effective Number"]),
      questionText: text,
      // The publisher's own exclusion sentence, e.g. "This point is not
      // applicable because 'Has the producer used subcontractors...' was
      // answered with no." Quoted verbatim rather than paraphrased so the
      // justification an auditor reads is the publisher's wording.
      justificationTemplate: cellText(row.values["Justification"]),
      displayOrder: order++,
    });
  }

  return questions;
}

/**
 * Build the criterion-to-question links from both places the workbook states
 * them, keeping a record of which table vouched for each.
 *
 * Neither source is complete. For IFA v6 Smart, `S2PQ_relational` yields 70
 * links and the `PIs` sheet's denormalised column yields 83; they agree on 58.
 * Inspecting the differences shows both are correct - the relational table
 * covers subsection 32.09 and the column covers 32.04, both plainly plant
 * protection product criteria that should drop out when a producer applies no
 * plant protection products. Choosing either source alone would lose real
 * rules, so we take the union.
 *
 * Rows whose GUIDs belong to another product's template are dropped and
 * counted. They exist because the workbook ships a shared link table.
 */
function readApplicabilityLinks(
  workbook: Workbook,
  criteriaRows: readonly TableRecord[],
  requirementGuids: ReadonlySet<string>,
  questionGuids: ReadonlySet<string>,
): {
  links: ParsedApplicabilityLink[];
  diagnostics: Pick<
    ParseDiagnostics,
    "danglingRelationalLinks" | "linksFromRelational" | "linksFromPiColumn" | "linksInBoth"
  >;
} {
  const fromRelational = new Set<string>();
  const fromColumn = new Set<string>();
  let dangling = 0;

  const key = (requirement: string, question: string) => `${requirement}\u0000${question}`;

  for (const row of workbook.readTable(TABLES.questionLinks)) {
    const requirementGuid = cellText(row.values["PIGUID"]);
    const questionGuid = cellText(row.values["PQGUID"]);
    if (!requirementGuid || !questionGuid) continue;

    if (!requirementGuids.has(requirementGuid) || !questionGuids.has(questionGuid)) {
      dangling++;
      continue;
    }
    fromRelational.add(key(requirementGuid, questionGuid));
  }

  for (const row of criteriaRows) {
    const requirementGuid = cellText(row.values[COL.guid]);
    const questionGuid = cellText(row.values[COL.linkedQuestion]);
    if (!requirementGuid || !questionGuid) continue;
    if (!requirementGuids.has(requirementGuid) || !questionGuids.has(questionGuid)) continue;
    fromColumn.add(key(requirementGuid, questionGuid));
  }

  const links: ParsedApplicabilityLink[] = [];
  let both = 0;

  for (const composite of new Set([...fromRelational, ...fromColumn])) {
    const [requirementStableKey, questionGuid] = composite.split("\u0000") as [string, string];
    const evidence: string[] = [];
    if (fromRelational.has(composite)) evidence.push("s2pq_relational");
    if (fromColumn.has(composite)) evidence.push("pi_column");
    if (evidence.length === 2) both++;

    links.push({ requirementStableKey, questionGuid, evidence });
  }

  return {
    links,
    diagnostics: {
      danglingRelationalLinks: dangling,
      linksFromRelational: fromRelational.size,
      linksFromPiColumn: fromColumn.size,
      linksInBoth: both,
    },
  };
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

/**
 * Read the visible checklist sheet.
 *
 * Unlike the hidden tables, this is the sheet a producer actually fills in, so
 * it carries the assessment framing: the question wording, the permitted
 * answers, and the section header rows that give the form its shape. Header
 * rows are kept rather than filtered because dropping them would lose the
 * grouping an assessor navigates by.
 */
function readChecklistItems(workbook: Workbook): ParsedChecklistItem[] {
  // The visible sheet's table name is generated by Excel and is not stable
  // across revisions, so find it by the columns it declares rather than by
  // name. Addressing it as "Checklist48" would break the day they re-save it.
  const tableName = workbook.tableNames.find((name) => {
    const table = workbook.table(name);
    return (
      table !== null &&
      table.columns.includes("PIGUID") &&
      table.columns.includes("Description/Principle") &&
      table.columns.includes("Level")
    );
  });

  if (!tableName) return [];

  const items: ParsedChecklistItem[] = [];
  let order = 0;

  for (const row of workbook.readTable(tableName)) {
    if (row.isEmpty) continue;

    const requirementGuid = cellText(row.values["PIGUID"]);
    const sectionLabel = cellText(row.values["Section"]);
    const principle = cellText(row.values["Description/Principle"]);
    const criteria = cellText(row.values["Criteria"]);

    if (!requirementGuid && !sectionLabel && !principle) continue;

    // Rows carrying a section label but no criterion GUID are the printed
    // headings that break the form into chapters.
    const isHeader = !requirementGuid;

    // Answer columns are read from the sheet rather than assumed, so a future
    // standard offering different responses needs no code change.
    const responseOptions = isHeader
      ? null
      : (["Yes", "No", "N/A"] as string[]).filter((option) => option in row.values);

    items.push({
      sourceGuid: requirementGuid,
      sourceIdentifier: sectionLabel ? canonicalizeCriterionNumber(sectionLabel) : null,
      questionText: principle,
      criteriaText: criteria,
      responseOptions: responseOptions?.length ? responseOptions : null,
      isHeader,
      displayOrder: order++,
      sourceLocation: {
        kind: "xlsx",
        sheet: row.sheetName,
        table: row.tableName ?? undefined,
        row: row.rowIndex,
      },
    });
  }

  return items;
}
