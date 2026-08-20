/**
 * Parsing and formatting of GLOBALG.A.P. identifiers.
 *
 * Two identifier systems coexist and both matter:
 *
 *   1. Human criterion numbers - `FV-Smart 32.10.06`. Stable within an edition,
 *      readable, what auditors and producers actually say out loud, and what
 *      appears in the P&C PDF. Used for citations and for the exact-match path
 *      in search.
 *
 *   2. Publisher GUIDs - `1Gmd3v6po0V454XQEGKJ0x`. Opaque 20-22 character
 *      identifiers GLOBALG.A.P. assigns in the checklist workbook. These are
 *      the real primary keys: they survive renumbering, and the same GUID
 *      appearing in the Smart and GFS workbooks is the publisher telling us
 *      those are the same underlying requirement.
 */

import { EDITION_ID_PREFIX, type Edition } from "./enums.ts";

// ---------------------------------------------------------------------------
// Criterion numbers
// ---------------------------------------------------------------------------

export interface CriterionNumber {
  /** Canonical form, e.g. `FV-Smart 32.10.06`. */
  readonly formatted: string;
  readonly edition: Edition;
  /** Section number, e.g. 32. */
  readonly section: number;
  /** Subsection number when the criterion is nested, e.g. 10. Null at depth 2. */
  readonly subsection: number | null;
  /** Ordinal within its parent, e.g. 6. */
  readonly ordinal: number;
  /** Sortable numeric key: section * 10000 + subsection * 100 + ordinal. */
  readonly sortKey: number;
}

/**
 * Matches criterion numbers in free text.
 *
 * Tolerances, each earned from real source data:
 *   - `Smart` / `SMART` / `smart`  - the PDF headings shout, the tables don't.
 *   - `FV-Smart` / `FV Smart`      - hyphen is dropped in some PDF extractions.
 *   - `01.01` / `1.1`              - the P&C table of contents drops leading zeros.
 *   - optional third group         - depth varies by section.
 *
 * The trailing `(?!\d)` stops `01.01` inside `01.011` from matching.
 */
const CRITERION_PATTERN =
  /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?(?!\d)/gi;

/** Single-match variant, anchored so `parseCriterionNumber` rejects trailing junk. */
const CRITERION_EXACT =
  /^\s*FV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?\s*$/i;

function buildCriterion(
  editionRaw: string,
  a: string,
  b: string,
  c: string | undefined,
): CriterionNumber {
  const edition: Edition = editionRaw.toLowerCase() === "gfs" ? "gfs" : "smart";
  const section = Number.parseInt(a, 10);

  // Depth is implied by group count: `32.10.06` nests, `03.01` does not.
  const hasSubsection = c !== undefined;
  const subsection = hasSubsection ? Number.parseInt(b, 10) : null;
  const ordinal = Number.parseInt(hasSubsection ? c : b, 10);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const formatted = hasSubsection
    ? `${EDITION_ID_PREFIX[edition]} ${pad(section)}.${pad(subsection!)}.${pad(ordinal)}`
    : `${EDITION_ID_PREFIX[edition]} ${pad(section)}.${pad(ordinal)}`;

  return {
    formatted,
    edition,
    section,
    subsection,
    ordinal,
    sortKey: section * 10_000 + (subsection ?? 0) * 100 + ordinal,
  };
}

/** Parse a string that should be exactly one criterion number. Null if it isn't. */
export function parseCriterionNumber(raw: string | null | undefined): CriterionNumber | null {
  if (!raw) return null;
  const m = CRITERION_EXACT.exec(raw);
  if (!m) return null;
  return buildCriterion(m[1]!, m[2]!, m[3]!, m[4]);
}

/**
 * Find every criterion number mentioned in a block of text.
 *
 * Used for two things: detecting when a user's search query is really an ID
 * lookup, and building the criterion-to-page map from the P&C PDF.
 */
export function extractCriterionNumbers(text: string): CriterionNumber[] {
  const found: CriterionNumber[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(CRITERION_PATTERN)) {
    const parsed = buildCriterion(m[1]!, m[2]!, m[3]!, m[4]);
    if (!seen.has(parsed.formatted)) {
      seen.add(parsed.formatted);
      found.push(parsed);
    }
  }
  return found;
}

/**
 * Normalize any spelling of a criterion number to its canonical form, so
 * `fv smart 3.1` and `FV-Smart 03.01` resolve to the same database row.
 */
export function canonicalizeCriterionNumber(raw: string): string | null {
  return parseCriterionNumber(raw)?.formatted ?? null;
}

// ---------------------------------------------------------------------------
// Section numbers
// ---------------------------------------------------------------------------

export interface SectionNumber {
  readonly formatted: string;
  readonly section: number;
  readonly subsection: number | null;
  /** Matches the `Order` column in the workbook: 32 for a section, 3210 for 32.10. */
  readonly order: number;
}

/**
 * Section headings appear in three shapes across the sources:
 *   `FV 01 INTERNAL DOCUMENTATION`     - checklist `allsections` table
 *   `FV 32.10 Mixing and handling`     - checklist subsection rows
 *   `FV-SMART 1 INTERNAL DOCUMENTATION`- P&C PDF table of contents
 */
const SECTION_PATTERN = /^\s*FV(?:[\s-]?(?:Smart|GFS))?\s+(\d{1,2})(?:\.(\d{1,2}))?\b/i;

export function parseSectionNumber(raw: string | null | undefined): SectionNumber | null {
  if (!raw) return null;
  const m = SECTION_PATTERN.exec(raw);
  if (!m) return null;
  const section = Number.parseInt(m[1]!, 10);
  const subsection = m[2] !== undefined ? Number.parseInt(m[2], 10) : null;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    formatted:
      subsection === null ? `FV ${pad(section)}` : `FV ${pad(section)}.${pad(subsection)}`,
    section,
    subsection,
    // Mirrors the workbook's own encoding so imported and derived orders agree.
    order: subsection === null ? section : section * 100 + subsection,
  };
}

/** Strip the leading number from a heading, leaving the title. */
export function stripSectionNumber(heading: string): string {
  return heading.replace(SECTION_PATTERN, "").trim();
}

// ---------------------------------------------------------------------------
// Publisher GUIDs
// ---------------------------------------------------------------------------

/**
 * GLOBALG.A.P. GUIDs are base62-ish strings of 20-22 characters, e.g.
 * `1Gmd3v6po0V454XQEGKJ0x`, `WWdX1Wkk01XzcMWRiIDbo`. Validating the shape
 * catches the common import bug of writing a placeholder (`-`, `#N/A`) or a
 * concatenated composite key into a GUID column.
 */
const GUID_PATTERN = /^[0-9A-Za-z]{20,22}$/;

export function isPublisherGuid(value: string | null | undefined): value is string {
  return typeof value === "string" && GUID_PATTERN.test(value);
}

/**
 * The workbook builds composite keys by string concatenation, e.g. the
 * `PIGUID & "NO"` column and the section:subsection join key. Splitting a
 * known suffix back off lets us verify those relations during reconciliation.
 */
export function stripGuidSuffix(value: string, suffix: string): string | null {
  if (!value.endsWith(suffix)) return null;
  const head = value.slice(0, -suffix.length);
  return isPublisherGuid(head) ? head : null;
}
