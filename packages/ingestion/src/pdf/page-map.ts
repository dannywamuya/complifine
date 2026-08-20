/**
 * Map every criterion to the page of the authoritative P&C PDF that states it.
 *
 * Why this matters: the structured import comes from the checklist workbook,
 * which is authority level 3. The P&C PDF is level 1. Citing a requirement as
 * "the checklist says so" is weaker than citing the standard, and a producer
 * challenged in an audit needs the page number of the standard itself.
 *
 * The mapper does double duty. Locating each criterion in the PDF also proves
 * that every criterion imported from the workbook actually appears in the
 * standard, and that the text matches - which is the reconciliation gate that
 * catches an import silently drifting from the source.
 */

import { extractCriterionNumbers, ngramCoverage, type Edition } from "@complifine/core";
import type { PdfDocument } from "./extract.ts";

export interface CriterionLocation {
  readonly sourceRequirementId: string;
  readonly page: number;
  /**
   * Fraction of the requirement's word trigrams found on that page, in [0, 1].
   *
   * Coverage rather than similarity because a page holds several criteria plus
   * running headers, so the two texts differ enormously in length even when
   * the match is perfect. The question worth asking is "is all of the
   * requirement present here", which is what coverage measures.
   */
  readonly coverage: number;
  /** True when the identifier was found but the text did not follow it. */
  readonly textMissing: boolean;
}

export interface PageMap {
  readonly locations: ReadonlyMap<string, CriterionLocation>;
  /** Identifiers seen in the PDF that the workbook did not produce. */
  readonly unmatchedInPdf: readonly string[];
  readonly pageCount: number;
}

export interface RequirementForMapping {
  readonly sourceRequirementId: string;
  readonly principleText: string;
  readonly criteriaText: string | null;
}

/**
 * Build the criterion-to-page map.
 *
 * Two passes. The first indexes every page by the criterion identifiers
 * printed on it, which is fast and exact. The second scores the requirement's
 * text against each candidate page, which resolves the cases where an
 * identifier appears more than once - the table of contents, a cross-reference
 * from another criterion, or a criterion whose text spans a page break.
 */
export function buildPageMap(
  pdf: PdfDocument,
  requirements: readonly RequirementForMapping[],
  edition: Edition,
): PageMap {
  // --- pass 1: identifier index -------------------------------------------
  const pagesByIdentifier = new Map<string, number[]>();
  const identifiersSeen = new Set<string>();

  for (const page of pdf.pages) {
    for (const criterion of extractCriterionNumbers(page.flatText)) {
      // Skip identifiers from the other edition; the GFS PDF cross-references
      // Smart numbers in its change notes and vice versa.
      if (criterion.edition !== edition) continue;

      identifiersSeen.add(criterion.formatted);
      const pages = pagesByIdentifier.get(criterion.formatted);
      if (pages) pages.push(page.number);
      else pagesByIdentifier.set(criterion.formatted, [page.number]);
    }
  }

  // --- pass 2: score candidates by text ------------------------------------
  const locations = new Map<string, CriterionLocation>();

  for (const requirement of requirements) {
    const candidates = pagesByIdentifier.get(requirement.sourceRequirementId);
    if (!candidates || candidates.length === 0) continue;

    const needle = requirement.criteriaText
      ? `${requirement.principleText} ${requirement.criteriaText}`
      : requirement.principleText;

    let best: { page: number; own: number; span: number } | null = null;

    for (const pageNumber of candidates) {
      const page = pdf.pages[pageNumber - 1];
      if (!page) continue;

      // Two scores per candidate, and the distinction matters.
      //
      // `own` is how much of the requirement is printed on this page. It is
      // what decides which page to cite, because the page that states the
      // requirement is the page that contains it.
      //
      // `span` also counts the page that follows, because a criterion can
      // straddle a page break and the last one on a page would otherwise score
      // badly through no fault of the import. It is used for the reported
      // coverage, not for choosing.
      //
      // Ranking on `span` instead would let a contents entry win: the contents
      // page precedes the body, so it inherits the definition page's text and
      // ties with it at 1.0 - and then cites the wrong page.
      const own = ngramCoverage(needle, page.flatText);
      const nextPage = pdf.pages[pageNumber];
      const span = nextPage
        ? ngramCoverage(needle, `${page.flatText} ${nextPage.flatText}`)
        : own;

      if (!best || own > best.own) best = { page: pageNumber, own, span };
    }

    if (best) {
      const coverage = Math.max(best.own, best.span);
      locations.set(requirement.sourceRequirementId, {
        sourceRequirementId: requirement.sourceRequirementId,
        page: best.page,
        coverage,
        // A page carrying the identifier but almost none of the text is a
        // contents entry or a cross-reference, not the definition.
        textMissing: coverage < 0.5,
      });
    }
  }

  const expected = new Set(requirements.map((r) => r.sourceRequirementId));
  const unmatchedInPdf = [...identifiersSeen].filter((id) => !expected.has(id)).sort();

  return { locations, unmatchedInPdf, pageCount: pdf.pageCount };
}
