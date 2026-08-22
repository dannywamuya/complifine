/**
 * Parse the official ETI Base Code PDF into clauses.
 *
 * Matching is against the publisher's own outline in `eti-clauses.ts`. A line
 * that looks numbered but is not in that outline is body text (the Base Code
 * PDF has wrapping that would otherwise create false headings). Each clause's
 * body is the text between its heading and the next known heading.
 */

import { normalizeWhitespace } from "@complifine/core";
import { ETI_CLAUSES, etiSortKey, etiStableKey, type EtiClause } from "./eti-clauses.ts";

export interface ParsedEtiClause extends EtiClause {
  readonly body: string;
  readonly startPage: number;
  readonly excerpt: string;
}

export interface ParsedEtiBaseCode {
  readonly clauses: readonly ParsedEtiClause[];
  readonly unmatchedHeadings: readonly string[];
}

function collapse(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[“”"']/g, "");
}

/**
 * Locate a clause heading in flattened page text. Titles are matched on the
 * first several significant words so wrapping and punctuation do not hide them.
 */
function headingIndex(haystack: string, clause: EtiClause): number {
  const needle = collapse(clause.title).slice(0, 48);
  const numbered = `${clause.number} ${needle}`;
  const direct = haystack.indexOf(numbered);
  if (direct >= 0) return direct;
  return haystack.indexOf(needle);
}

export function parseEtiBaseCode(
  pages: ReadonlyArray<{ number: number; text: string }>,
): ParsedEtiBaseCode {
  const full = pages.map((p) => p.text).join("\n");
  const flat = collapse(full);
  const unmatchedHeadings: string[] = [];

  const located = ETI_CLAUSES.map((clause) => {
    const index = headingIndex(flat, clause);
    if (index < 0) unmatchedHeadings.push(clause.number);
    return { clause, index };
  });

  const clauses: ParsedEtiClause[] = [];

  for (let i = 0; i < located.length; i++) {
    const current = located[i]!;
    const next = located.slice(i + 1).find((row) => row.index > current.index);
    const start = current.index < 0 ? 0 : current.index;
    const end = next ? next.index : flat.length;
    const slice = current.index < 0 ? "" : flat.slice(start, end);
    const body = slice
      .replace(collapse(current.clause.title), "")
      .replace(new RegExp(`^${current.clause.number}\\s*`), "")
      .trim();

    const startPage =
      pages.find((page) => collapse(page.text).includes(collapse(current.clause.title).slice(0, 32)))
        ?.number ?? 1;

    clauses.push({
      ...current.clause,
      body: body || current.clause.title,
      startPage,
      excerpt: (body || current.clause.title).slice(0, 280),
    });
  }

  return { clauses, unmatchedHeadings };
}

export { etiSortKey, etiStableKey };
