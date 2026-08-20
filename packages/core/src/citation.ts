/**
 * Citation formatting.
 *
 * Every factual claim CompliFine makes must be traceable to a source location
 * a human can open and check. Centralising the format here means the API, the
 * admin UI and the agent all cite identically, and that changing the format is
 * one edit rather than a hunt.
 */

import { AUTHORITY_LEVEL_LABELS, type AuthorityLevel } from "./enums.ts";

export interface CitationInput {
  /** Source identifier, e.g. `FV-Smart 03.01`, or a section number for prose. */
  readonly sourceIdentifier?: string | null;
  /** Human title of the document, e.g. `IFA v6 Smart P&Cs for Fruit and Vegetables`. */
  readonly documentTitle: string;
  readonly sourcePage?: number | null;
  /** Cell or sheet reference for spreadsheet sources, e.g. `P&Cs!D42`. */
  readonly sourceLocation?: string | null;
  readonly authorityLevel?: AuthorityLevel | null;
}

/**
 * Render a one-line citation.
 *
 * Uses a middle dot as separator rather than a comma or pipe: criterion
 * identifiers and document titles both contain commas, and a pipe reads as
 * markup. Example output:
 *
 *   FV-Smart 03.01 · IFA v6 Smart P&Cs · p.7
 */
export function formatCitation(input: CitationInput): string {
  const parts: string[] = [];
  if (input.sourceIdentifier) parts.push(input.sourceIdentifier);
  parts.push(input.documentTitle);
  if (input.sourcePage != null) parts.push(`p.${input.sourcePage}`);
  else if (input.sourceLocation) parts.push(input.sourceLocation);
  return parts.join(" · ");
}

/**
 * Render a citation that also states its authority level.
 *
 * Used whenever a non-normative source is surfaced, so a reader is never left
 * to assume that guidance carries the force of a requirement.
 */
export function formatCitationWithAuthority(input: CitationInput): string {
  const base = formatCitation(input);
  if (input.authorityLevel == null) return base;
  return `${base} [${AUTHORITY_LEVEL_LABELS[input.authorityLevel]}]`;
}

/**
 * Structured location within a source document.
 *
 * Stored as JSON so the shape can differ per document type without schema
 * churn, while still being queryable. PDFs carry page and section; workbooks
 * carry sheet, row and column, which is what makes a spreadsheet import
 * auditable cell by cell.
 */
export type SourceLocation =
  | {
      readonly kind: "pdf";
      readonly page: number;
      readonly section?: string;
      readonly headingPath?: readonly string[];
    }
  | {
      readonly kind: "xlsx";
      readonly sheet: string;
      readonly table?: string;
      readonly row: number;
      readonly columns?: Readonly<Record<string, string>>;
    };

/** Render a `SourceLocation` as the compact reference used in citations. */
export function formatSourceLocation(location: SourceLocation): string {
  if (location.kind === "pdf") {
    return location.section ? `p.${location.page} §${location.section}` : `p.${location.page}`;
  }
  const cells = location.columns
    ? Object.values(location.columns).join(",")
    : String(location.row);
  return `${location.sheet}!${cells}`;
}
