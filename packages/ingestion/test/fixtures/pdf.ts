/**
 * Synthetic `PdfDocument`s for testing the parsers that consume them.
 *
 * `extractPdf` is a thin wrapper over pdf.js and is exercised for real by the
 * ingest; what needs testing here is what we do with the text it produces. So
 * these fixtures start from page strings, and reproduce faithfully the three
 * features of GLOBALG.A.P.'s PDFs that a naive parser gets wrong: a four-line
 * running header on every page, a table of contents whose entries are copies of
 * the headings, and clauses that straddle a page break.
 */

import { normalizeTypography, normalizeWhitespace } from "@complifine/core";
import type { PdfDocument, PdfPage } from "../../src/pdf/extract.ts";

export function makePdf(pageTexts: readonly string[]): PdfDocument {
  const pages: PdfPage[] = pageTexts.map((raw, index) => {
    const normalized = normalizeTypography(dedent(raw));
    return {
      number: index + 1,
      text: normalized,
      flatText: normalizeWhitespace(normalized),
    };
  });

  return {
    pageCount: pages.length,
    pages,
    fullText: pages.map((p) => p.text).join("\n\f\n"),
  };
}

/** The running header GLOBALG.A.P. stamps on every page of the regulations. */
export function runningHeader(page: number, total: number): string {
  return [
    "Code ref.: GR - Rules for CBs; v6.0_Apr25; English version",
    "GLOBALG.A.P. general regulations - Rules for certification bodies",
    `Page ${page} of ${total}`,
    "250401_GG_GR_Rules_for_CBs_v6_0_Apr25_en",
  ].join("\n");
}

/** A contents entry, complete with the dot leaders and trailing page number. */
export function tocEntry(label: string, page: number): string {
  const leaders = ".".repeat(Math.max(4, 70 - label.length));
  return `${label} ${leaders} ${page}`;
}

function dedent(text: string): string {
  const lines = text.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
  const indent = Math.min(
    ...lines.filter((l) => l.trim().length > 0).map((l) => /^ */.exec(l)![0].length),
  );
  return lines.map((l) => l.slice(indent)).join("\n");
}
