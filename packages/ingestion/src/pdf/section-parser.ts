/**
 * Section-aware parsing of long-form PDFs.
 *
 * The General Regulations and the guideline are prose, not tables: numbered
 * clauses of a few sentences each, nested up to four levels. They are still
 * the source of truth for how certification works - what an unannounced audit
 * is, how long a sanction lasts, what happens when a producer group fails an
 * internal audit - so they belong in the knowledge base as retrievable text.
 *
 * Chunking them by character count would cut clauses in half and lose the
 * clause number, which is precisely what a reader needs in order to cite them.
 * So we recover the author's own outline and treat each clause as a unit.
 *
 * ## Why the table of contents drives this
 *
 * Detecting headings by their shape alone does not work on these files. Body
 * text wraps, and a wrapped line routinely begins with a number:
 *
 *     "6 GFS (IFA v6 GFS) edition, the Harmonized Produce Safety Standard..."
 *     "11 producers are audited."
 *     "12 and 13. This person:"
 *
 * Every one of those parses as a numbered heading. Each false positive then
 * swallows the real section that follows it, so the damage is far worse than
 * one bad row.
 *
 * These documents publish their own outline, though, in a table of contents
 * that lists each clause number with its title. That is an authoritative
 * answer to "which lines are headings", supplied by the author, and it is what
 * this parser follows. A line is accepted as a heading when either:
 *
 *   1. it matches the next unconsumed contents entry, by number *and* title; or
 *   2. it is a deeper clause of the section the contents last put us in -
 *      4.1.1 while inside 4.1 - since the contents only lists two levels.
 *
 * Documents with no contents page (the five-page annexes) fall back to shape
 * detection, where the stakes are small and the text is simple.
 */

import { diceCoefficient, normalizeForComparison, normalizeWhitespace } from "@complifine/core";
import type { PdfDocument, PdfPage } from "./extract.ts";

export interface ParsedProseSection {
  /** Clause number as printed, e.g. `4.2.1`. Null for unnumbered headings. */
  readonly number: string | null;
  readonly title: string;
  /** Body text, excluding the heading line and any nested subsections. */
  readonly body: string;
  /**
   * Depth in the resulting tree, which is not always the number of components
   * in the clause number. A document whose section 7 heading is missing from
   * the extracted text still contains clause 7.1, and 7.1 is then genuinely a
   * root of our tree. Reporting it as depth 2 with no parent would describe a
   * tree that does not exist.
   */
  readonly depth: number;
  /** Clause number of the parent, when one was actually found. */
  readonly parentNumber: string | null;
  readonly startPage: number;
  readonly endPage: number;
  /** Sort key derived from the clause number, so `4.10` follows `4.9`. */
  readonly order: number;
  /** Full heading path from the document root, for chunk breadcrumbs. */
  readonly path: readonly string[];
  /** How this heading was identified. Recorded for diagnosis, not display. */
  readonly evidence: "contents" | "subsection" | "shape" | "unnumbered";
}

/**
 * A numbered clause heading: `4.2.1 Sanctions`.
 *
 * The number must NOT be followed by a full stop. That single character is
 * what separates a heading from an ordered list item, and these documents are
 * consistent about it: headings read `4.1.1 Provisional approval`, list items
 * read `1. Sign the license agreement`.
 */
const NUMBERED_HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,3})\s+(\S.{2,110})$/;

/** An unnumbered heading in the caps style used for annexes and registers. */
const CAPS_HEADING = /^([A-Z][A-Z0-9 ,.:'&()/-]{5,80})$/;

/**
 * Is this an unnumbered heading, or just a line that happens to be shouting?
 *
 * The shape alone is not enough. When a long numbered heading wraps, its
 * remainder is left on its own line and can look exactly like a caps heading:
 *
 *     "7.6 Using ICT for a CB audit's off-site stage (Option 1 or Option 2) (based on IAF"
 *     "MD4:2018)"
 *
 * Treating `MD4:2018)` as a heading opens a section that then swallows the
 * body of 7.6, so 7.6 is emitted empty and its subsections are orphaned - one
 * stray line costing an entire chapter.
 *
 * Requiring real words distinguishes the two: a heading is made of words, and
 * a wrapped fragment like this is made of a code.
 */
function isCapsHeading(line: string): boolean {
  if (!CAPS_HEADING.test(line)) return false;
  const words = line.split(/[^A-Z]+/).filter((run) => run.length >= 2);
  // Two words, or one substantial one: "GENERAL" and "ANNEX 1" qualify,
  // "MD4:2018)" and "PHU)" do not.
  return words.length >= 2 || (words.length === 1 && words[0]!.length >= 5);
}

/** A contents entry: a heading, dot leaders, and the page it appears on. */
const CONTENTS_ENTRY = /^(\d{1,2}(?:\.\d{1,2}){0,3})?\s*(.*?)\s*\.{4,}\s*(\d{1,4})$/;

/**
 * Dot leaders. Their presence means the line is a contents entry, because no
 * body text in these documents contains a run of periods.
 */
const DOT_LEADER = /\.{4,}/;

/**
 * A trailing abbreviation rather than the end of a sentence.
 *
 * Headings do not end in a full stop, which is a useful way to reject a
 * paragraph that happens to begin with a figure. Applied naively it also
 * rejects `4.1 CB approval by GLOBALG.A.P.`, a real clause heading in the
 * rules for certification bodies, so the final token is checked first.
 */
const ABBREVIATION_TAIL = /(?:\b[A-Z]\.){2,}$|\b(?:[A-Z]{1,4}|No|Nos|etc|e\.g|i\.e)\.$/;

/** Running headers, footers and page furniture that repeat and are not content. */
const NOISE = [
  /^page\s+\d+\s+of\s+\d+$/i,
  /^\d+\s*\/\s*\d+$/,
  /^code\s?ref[:.]/i,
  /^globalg\.?a\.?p\.?\s+(general|c\/o)/i,
  // The source filename, stamped in the footer of every page:
  // `250401_GG_GR_Rules_for_CBs_v6_0_Apr25_en`.
  /^\d{6}_[A-Za-z0-9_.\-]+$/,
  /^©/,
  /^copyright/i,
  /^www\.globalgap\.org$/i,
  /^\d{1,3}$/,
];

function isNoise(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  return NOISE.some((pattern) => pattern.test(trimmed));
}

/**
 * Is this page part of the table of contents?
 *
 * Counting dot-leader lines rather than testing each line individually,
 * because a long contents entry wraps and its first line carries no leader:
 *
 *   "7.6 Using ICT for a CB audit's off-site stage (Option 1 or Option 2) (based on IAF"
 *   "MD4:2018) .................................................................... 24"
 *
 * Judged line by line, that first line is indistinguishable from a real
 * heading. Judged per page, the page is obviously a contents page.
 */
function isContentsPage(page: PdfPage): boolean {
  return page.text.split("\n").filter((line) => DOT_LEADER.test(line)).length >= 3;
}

/** Does this line read like the end of a sentence rather than a heading? */
function looksLikeProse(title: string): boolean {
  const trimmed = title.trimEnd();
  if (trimmed.endsWith(".") && !ABBREVIATION_TAIL.test(trimmed)) return true;
  // A heading never opens with a lower-case word. Wrapped body text usually
  // does: "producers are audited", "and 13. This person:", "hours)".
  return /^[a-z]/.test(trimmed);
}

/** `4.2.1` -> a key that sorts in reading order, with `4.10` after `4.9`. */
function clauseOrder(number: string | null, fallback: number): number {
  if (!number) return fallback;
  const parts = number.split(".").map((p) => Number.parseInt(p, 10));
  let order = 0;
  for (let i = 0; i < 4; i++) order = order * 100 + (parts[i] ?? 0);
  return order;
}

// ---------------------------------------------------------------------------
// The contents outline
// ---------------------------------------------------------------------------

interface ContentsEntry {
  readonly number: string | null;
  readonly title: string;
}

/**
 * Read the document's own outline off its contents pages.
 *
 * Returns an empty list when the document has no contents, which is the signal
 * to fall back to shape detection.
 */
export function parseContents(pdf: PdfDocument): ContentsEntry[] {
  const entries: ContentsEntry[] = [];

  for (const page of pdf.pages) {
    if (!isContentsPage(page)) continue;

    // A wrapped entry puts its opening words on the preceding line, so lines
    // are accumulated and flushed when the leaders finally arrive.
    let pending = "";

    for (const rawLine of page.text.split("\n")) {
      const line = rawLine.trim();
      if (isNoise(line) || line.length === 0) continue;
      if (/^table of contents$/i.test(line)) continue;

      const candidate = pending ? `${pending} ${line}` : line;

      if (!DOT_LEADER.test(line)) {
        pending = candidate;
        continue;
      }

      pending = "";
      const match = CONTENTS_ENTRY.exec(candidate);
      if (!match) continue;

      const title = normalizeWhitespace(match[2] ?? "");
      if (title.length < 3) continue;

      entries.push({ number: match[1] ?? null, title });
    }
  }

  return entries;
}

/**
 * Does a heading line in the body correspond to this contents entry?
 *
 * Compared loosely because the two are typeset differently: the contents may
 * truncate a long title where the leaders begin, and extraction can wrap
 * either one. The number having already matched, the title only has to
 * corroborate rather than prove.
 */
function titlesAgree(contentsTitle: string, bodyTitle: string): boolean {
  const a = normalizeForComparison(contentsTitle);
  const b = normalizeForComparison(bodyTitle);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  return diceCoefficient(a, b) >= 0.8;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Draft {
  number: string | null;
  title: string;
  evidence: ParsedProseSection["evidence"];
  startPage: number;
  endPage: number;
  lines: string[];
}

export function parseProseSections(pdf: PdfDocument): ParsedProseSection[] {
  const outline = parseContents(pdf);
  const drafts: Draft[] = [];

  // Held in an object rather than a bare `let` so that `open` and `close`,
  // which are closures, do not defeat TypeScript's narrowing: a plain local
  // assigned only from inside a closure narrows to `null` at every read.
  const state: { current: Draft | null } = { current: null };

  /** Index of the next contents entry we expect to meet in the body. */
  let expected = 0;
  /** Clause number of the section the contents last placed us in. */
  let anchor: string | null = null;
  /** Sort key of the last accepted heading, to keep numbering moving forward. */
  let lastOrder = -1;

  const close = (page: number) => {
    if (state.current) {
      state.current.endPage = page;
      drafts.push(state.current);
      state.current = null;
    }
  };

  const open = (
    number: string | null,
    title: string,
    evidence: ParsedProseSection["evidence"],
    page: number,
  ) => {
    close(page);
    state.current = {
      number,
      title: normalizeWhitespace(title),
      evidence,
      startPage: page,
      endPage: page,
      lines: [],
    };
  };

  for (const page of pdf.pages) {
    if (isContentsPage(page)) {
      // Ending the open section at a contents page also stops front matter
      // being appended to whatever heading preceded it.
      close(page.number);
      continue;
    }

    for (const rawLine of page.text.split("\n")) {
      const line = rawLine.trim();
      if (isNoise(line) || DOT_LEADER.test(line)) continue;

      const numbered = NUMBERED_HEADING.exec(line);

      if (numbered && !looksLikeProse(numbered[2]!)) {
        const number = numbered[1]!;
        const title = numbered[2]!;

        // (1) The next contents entry that carries this number and a title
        // that agrees. Searching forward rather than requiring the very next
        // entry, so one heading lost to a mangled page does not derail the
        // rest of the document.
        const match = outline.findIndex(
          (entry, index) =>
            index >= expected && entry.number === number && titlesAgree(entry.title, title),
        );

        if (match !== -1) {
          expected = match + 1;
          anchor = number;
          lastOrder = clauseOrder(number, 0);
          open(number, title, "contents", page.number);
          continue;
        }

        // (2) A deeper clause of the section we are currently inside. The
        // contents only lists two levels, so 4.1.1 and 7.3.3.2 arrive this way.
        const isSubsection =
          anchor !== null &&
          number.startsWith(`${anchor}.`) &&
          clauseOrder(number, 0) > lastOrder;

        // (3) No contents at all: fall back to shape, with numbering required
        // to move forward so that a stray figure cannot open a section.
        const isShapeMatch =
          outline.length === 0 && clauseOrder(number, 0) > lastOrder;

        if (isSubsection || isShapeMatch) {
          lastOrder = clauseOrder(number, 0);
          if (isShapeMatch) anchor = number;
          open(number, title, isSubsection ? "subsection" : "shape", page.number);
          continue;
        }

        // Neither: a wrapped sentence that begins with a number. Body text.
      } else if (isCapsHeading(line)) {
        // An unnumbered heading starts a new part of the document - an annex,
        // a register - which may restart its numbering.
        anchor = null;
        lastOrder = -1;
        const match = outline.findIndex(
          (entry, index) =>
            index >= expected && entry.number === null && titlesAgree(entry.title, line),
        );
        if (match !== -1) expected = match + 1;
        open(null, line, "unnumbered", page.number);
        continue;
      }

      if (state.current) {
        state.current.lines.push(line);
        state.current.endPage = page.number;
      }
      // Text before the first heading is cover matter, deliberately discarded
      // rather than attributed to a section it does not belong to.
    }
  }

  close(pdf.pageCount);

  return resolveHierarchy(drafts);
}

/**
 * Turn the flat list of drafts into a tree, deriving each node's depth from
 * the parent actually present rather than from its clause number.
 */
function resolveHierarchy(drafts: readonly Draft[]): ParsedProseSection[] {
  const numbered = drafts.map((draft) => draft.number).filter((n): n is string => n !== null);
  const hasDescendant = (number: string | null): boolean =>
    number !== null && numbered.some((other) => other.startsWith(`${number}.`));

  const withBody = drafts
    .map((draft) => ({ draft, body: normalizeWhitespace(draft.lines.join(" ")) }))
    // An empty heading is kept only when it is a container. "7 AUDIT PROCESS"
    // is followed straight away by "7.1 Audit scope" and has no prose of its
    // own, but it is the parent of everything in the chapter and carries the
    // chapter title into every descendant's breadcrumb.
    //
    // An empty heading with no descendants is a page-break artefact, and would
    // only produce an empty chunk that pollutes retrieval.
    .filter(({ draft, body }) => body.length > 0 || hasDescendant(draft.number));

  /** Depth and heading of each emitted clause number, for parent lookup. */
  const emitted = new Map<string, { depth: number; heading: string }>();
  const sections: ParsedProseSection[] = [];

  for (const [index, { draft, body }] of withBody.entries()) {
    let parentNumber: string | null = null;
    let depth = 1;
    const path: string[] = [];

    if (draft.number) {
      // Walk up the clause number looking for the closest ancestor that was
      // actually emitted: for 7.6.2 try 7.6, then 7.
      const parts = draft.number.split(".");
      for (let cut = parts.length - 1; cut >= 1; cut--) {
        const candidate = parts.slice(0, cut).join(".");
        const ancestor = emitted.get(candidate);
        if (ancestor) {
          parentNumber = candidate;
          depth = ancestor.depth + 1;
          break;
        }
      }

      // Rebuild the breadcrumb by walking the chain of emitted ancestors.
      let cursor: string | null = parentNumber;
      const ancestors: string[] = [];
      while (cursor) {
        const ancestor = emitted.get(cursor);
        if (!ancestor) break;
        ancestors.unshift(ancestor.heading);
        const segments = cursor.split(".");
        cursor = segments.length > 1 ? segments.slice(0, -1).join(".") : null;
      }
      path.push(...ancestors);
    }

    const heading = draft.number ? `${draft.number} ${draft.title}` : draft.title;
    path.push(heading);

    if (draft.number) emitted.set(draft.number, { depth, heading });

    sections.push({
      number: draft.number,
      title: draft.title,
      body,
      depth,
      parentNumber,
      startPage: draft.startPage,
      endPage: draft.endPage,
      order: clauseOrder(draft.number, 1_000_000 + index),
      path,
      evidence: draft.evidence,
    });
  }

  return sections;
}
