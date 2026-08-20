/**
 * PDF text extraction.
 *
 * Thin wrapper over unpdf (a serverless-friendly build of pdf.js) that keeps
 * pages separate. Page separation is the whole point: the P&C PDF is the
 * authoritative document, so a requirement's provenance must cite the page an
 * auditor can turn to. Merging pages into one string would throw away the only
 * thing this file is here to produce.
 */

import { extractText, getDocumentProxy } from "unpdf";
import { normalizeTypography, normalizeWhitespace } from "@complifine/core";

export interface PdfPage {
  /** 1-based, matching what a reader sees. */
  readonly number: number;
  /** Text as extracted, with line breaks preserved. */
  readonly text: string;
  /** Whitespace-collapsed text, for matching. */
  readonly flatText: string;
}

export interface PdfDocument {
  readonly pageCount: number;
  readonly pages: readonly PdfPage[];
  /** All pages joined, with form feeds between them. */
  readonly fullText: string;
}

/**
 * pdf.js `VerbosityLevel.ERRORS`. GLOBALG.A.P.'s PDFs embed a TrueType font
 * using an instruction pdf.js does not implement, and at the default verbosity
 * that produces a `Warning: TT: undefined function: 21` line for every page -
 * hundreds of lines that say nothing about the ingest and bury the messages
 * that do. Errors still surface; only the font chatter is silenced.
 */
const ERRORS_ONLY = 0;

export async function extractPdf(bytes: Uint8Array): Promise<PdfDocument> {
  // pdf.js transfers and detaches the buffer it is handed, which breaks any
  // caller that still holds the original - notably the hash verification that
  // runs alongside parsing. Copying is cheaper than the bug.
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: ERRORS_ONLY });
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pages: PdfPage[] = (text as string[]).map((raw, index) => {
    const normalized = normalizeTypography(raw);
    return {
      number: index + 1,
      text: normalized,
      flatText: normalizeWhitespace(normalized),
    };
  });

  return {
    pageCount: totalPages,
    pages,
    fullText: pages.map((p) => p.text).join("\n\f\n"),
  };
}
