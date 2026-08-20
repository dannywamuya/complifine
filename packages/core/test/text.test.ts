import { describe, expect, test } from "bun:test";
import {
  dehyphenate,
  diceCoefficient,
  estimateTokens,
  excerpt,
  levenshteinDistance,
  levenshteinRatio,
  ngramCoverage,
  normalizeForComparison,
  normalizeTypography,
  normalizeWhitespace,
  tokenize,
} from "../src/text.ts";

describe("normalizeTypography", () => {
  test("folds curly quotes and primes to ASCII", () => {
    expect(normalizeTypography("\u201cworkers\u2019 welfare\u201d")).toBe("\"workers' welfare\"");
  });

  test("folds every dash variant to a plain hyphen", () => {
    expect(normalizeTypography("non\u2011conformance \u2013 a \u2014 b")).toBe(
      "non-conformance - a - b",
    );
  });

  test("folds bullets to hyphens so workbook and PDF lists agree", () => {
    expect(normalizeTypography("\u2022 first \u25e6 second")).toBe("- first - second");
  });

  test("drops zero-width characters and soft hyphens entirely", () => {
    expect(normalizeTypography("docu\u00admentation")).toBe("documentation");
    expect(normalizeTypography("zero\u200bwidth\ufeff")).toBe("zerowidth");
  });

  test("converts exotic spaces to plain spaces", () => {
    expect(normalizeTypography("a\u00a0b\u2009c\u202fd")).toBe("a b c d");
  });
});

describe("dehyphenate", () => {
  test("rejoins a word split across a PDF line break", () => {
    expect(dehyphenate("docu-\nmentation")).toBe("documentation");
    expect(dehyphenate("require-\n  ments")).toBe("requirements");
  });

  test("leaves a hyphenated compound on one line alone", () => {
    expect(dehyphenate("up-to-date")).toBe("up-to-date");
  });

  test("does not join across a sentence boundary marked by capitals", () => {
    expect(dehyphenate("total-\nRevenue")).toBe("total-\nRevenue");
  });
});

describe("normalizeForComparison", () => {
  test("makes casing, punctuation and whitespace irrelevant", () => {
    expect(normalizeForComparison("A procedure is in place.")).toBe(
      normalizeForComparison("  a  PROCEDURE is in place  "),
    );
  });

  test("makes a workbook bullet list equal to the PDF's reflowed rendering", () => {
    const workbook = "A system shall demonstrate:\n- How documents are reviewed\n- How approved";
    const pdf = "A system shall demonstrate: \u2022 How documents are reviewed \u2022 How approved";
    expect(normalizeForComparison(workbook)).toBe(normalizeForComparison(pdf));
  });

  test("preserves accented letters as letters rather than deleting them", () => {
    expect(normalizeForComparison("Café")).toBe("café");
  });
});

describe("tokenize", () => {
  test("splits on normalized word boundaries", () => {
    expect(tokenize("GLOBALG.A.P. Number (GGN)")).toEqual(["globalg", "a", "p", "number", "ggn"]);
  });

  test("returns an empty array for punctuation-only input", () => {
    expect(tokenize("---")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });
});

describe("diceCoefficient", () => {
  test("returns 1 for identical text", () => {
    expect(diceCoefficient("hello world", "hello world")).toBe(1);
  });

  test("returns 1 when the only differences are formatting", () => {
    expect(diceCoefficient("Up-to-date.", "up to date")).toBe(1);
  });

  // This is the reconciliation gate in miniature: real criterion text as the
  // workbook stores it versus as pdf.js extracts it from the P&C document.
  test("clears the 0.95 reconciliation threshold on real criterion text", () => {
    const workbook =
      "Documents and records affecting implementation of the requirements shall be managed and controlled.";
    const pdf =
      "Documents and records affecting implementation of the\nrequirements shall be managed and controlled.";
    expect(diceCoefficient(workbook, pdf)).toBeGreaterThan(0.95);
  });

  test("falls well below the threshold for genuinely different criteria", () => {
    expect(
      diceCoefficient(
        "A continuous improvement plan is documented.",
        "The GLOBALG.A.P. Number (GGN) is indicated on all final products.",
      ),
    ).toBeLessThan(0.5);
  });

  test("is symmetric", () => {
    const a = "traceability system records";
    const b = "traceable system record keeping";
    expect(diceCoefficient(a, b)).toBeCloseTo(diceCoefficient(b, a), 10);
  });

  test("handles degenerate input without dividing by zero", () => {
    expect(diceCoefficient("", "")).toBe(1);
    expect(diceCoefficient("a", "")).toBe(0);
    expect(diceCoefficient("", "abc")).toBe(0);
    expect(diceCoefficient("a", "a")).toBe(1);
    expect(diceCoefficient("a", "b")).toBe(0);
  });
});

describe("ngramCoverage", () => {
  // Coverage, not Dice, is the right metric for "is this criterion on this
  // page": the page is far longer than the criterion, which would crush a
  // symmetric score even on a perfect match.
  test("returns 1 when the criterion appears verbatim on a page", () => {
    const criterion = "A continuous improvement plan is documented";
    const page = `
      Code ref.: IFA Smart PCs for FV; v6.0_Sep22; English version Page 6 of 80
      FV-Smart 02 CONTINUOUS IMPROVEMENT PLAN
      FV-Smart 02.01 A continuous improvement plan is documented.
      The producer shall evaluate the farming operation.
    `;
    expect(ngramCoverage(criterion, page)).toBe(1);
  });

  test("is asymmetric", () => {
    const short = "traceability is required";
    const long = "traceability is required for all registered products across the operation";
    expect(ngramCoverage(short, long)).toBe(1);
    expect(ngramCoverage(long, short)).toBeLessThan(1);
  });

  test("returns 0 when the criterion is absent from the page", () => {
    expect(ngramCoverage("plant protection products must be stored", "TABLE OF CONTENTS")).toBe(0);
  });

  test("degrades proportionally when only part of the text is present", () => {
    const coverage = ngramCoverage(
      "alpha bravo charlie delta echo foxtrot",
      "alpha bravo charlie zulu yankee xray",
    );
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
  });

  test("falls back to containment for needles shorter than one n-gram", () => {
    expect(ngramCoverage("traceability", "the traceability system")).toBe(1);
    expect(ngramCoverage("absent", "the traceability system")).toBe(0);
  });

  test("treats an empty needle as trivially covered and an empty haystack as uncovered", () => {
    expect(ngramCoverage("", "anything")).toBe(1);
    expect(ngramCoverage("something here now", "")).toBe(0);
  });
});

describe("levenshtein", () => {
  test("measures edit distance", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("same", "same")).toBe(0);
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  test("is symmetric regardless of argument order", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(levenshteinDistance("sitting", "kitten"));
    // Exercises the internal shorter/longer swap.
    expect(levenshteinDistance("a", "abcdefgh")).toBe(7);
    expect(levenshteinDistance("abcdefgh", "a")).toBe(7);
  });

  test("ratio normalizes to [0, 1] after comparison folding", () => {
    expect(levenshteinRatio("Major Must", "major must")).toBe(1);
    expect(levenshteinRatio("", "")).toBe(1);
    expect(levenshteinRatio("abc", "xyz")).toBe(0);
  });
});

describe("excerpt", () => {
  test("returns short text unchanged and flattened", () => {
    expect(excerpt("A short excerpt.")).toBe("A short excerpt.");
    expect(excerpt("multi\nline\ntext")).toBe("multi line text");
  });

  test("cuts on a word boundary and marks the truncation", () => {
    const out = excerpt("the quick brown fox jumps over the lazy dog", 15);
    expect(out.endsWith("...")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(18);
    expect(out).toBe("the quick brown...");
  });
});

describe("estimateTokens", () => {
  test("approximates four characters per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("normalizeWhitespace", () => {
  test("collapses runs and trims", () => {
    expect(normalizeWhitespace("  a \n\t b  ")).toBe("a b");
  });
});
