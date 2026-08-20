import { describe, expect, test } from "bun:test";
import {
  formatCitation,
  formatCitationWithAuthority,
  formatSourceLocation,
  type SourceLocation,
} from "../src/citation.ts";
import { AUTHORITY_LEVELS } from "../src/enums.ts";

describe("formatCitation", () => {
  test("renders the canonical requirement citation", () => {
    expect(
      formatCitation({
        sourceIdentifier: "FV-Smart 03.01",
        documentTitle: "IFA v6 Smart P&Cs",
        sourcePage: 7,
      }),
    ).toBe("FV-Smart 03.01 · IFA v6 Smart P&Cs · p.7");
  });

  test("omits the identifier for prose sources such as the general regulations", () => {
    expect(
      formatCitation({ documentTitle: "GLOBALG.A.P. GR Rules for Individual Producers", sourcePage: 12 }),
    ).toBe("GLOBALG.A.P. GR Rules for Individual Producers · p.12");
  });

  test("falls back to a cell reference when there is no page", () => {
    expect(
      formatCitation({
        sourceIdentifier: "FV-Smart 03.01",
        documentTitle: "IFA v6 Smart checklist",
        sourceLocation: "P&Cs!D42",
      }),
    ).toBe("FV-Smart 03.01 · IFA v6 Smart checklist · P&Cs!D42");
  });

  test("prefers a page over a cell reference when both are present", () => {
    expect(
      formatCitation({
        documentTitle: "Doc",
        sourcePage: 3,
        sourceLocation: "Sheet1!A1",
      }),
    ).toBe("Doc · p.3");
  });

  // Page 0 is falsy; using a null check rather than a truthiness check is what
  // keeps a legitimate page from vanishing.
  test("renders page 0 rather than dropping it", () => {
    expect(formatCitation({ documentTitle: "Doc", sourcePage: 0 })).toBe("Doc · p.0");
  });

  test("degrades to just the title when nothing else is known", () => {
    expect(formatCitation({ documentTitle: "Doc" })).toBe("Doc");
  });
});

describe("formatCitationWithAuthority", () => {
  // A reader must never mistake guidance for a requirement.
  test("labels a non-normative source", () => {
    expect(
      formatCitationWithAuthority({
        documentTitle: "IFA v6 guideline for Fruit and Vegetables",
        sourcePage: 40,
        authorityLevel: AUTHORITY_LEVELS.OFFICIAL_GUIDANCE,
      }),
    ).toBe("IFA v6 guideline for Fruit and Vegetables · p.40 [Official guidance]");
  });

  test("labels an AI interpretation explicitly", () => {
    expect(
      formatCitationWithAuthority({
        documentTitle: "Model summary",
        authorityLevel: AUTHORITY_LEVELS.AI_INTERPRETATION,
      }),
    ).toBe("Model summary [AI interpretation]");
  });

  test("omits the label when authority is unknown", () => {
    expect(formatCitationWithAuthority({ documentTitle: "Doc" })).toBe("Doc");
  });
});

describe("formatSourceLocation", () => {
  test("renders a PDF location", () => {
    const loc: SourceLocation = { kind: "pdf", page: 7 };
    expect(formatSourceLocation(loc)).toBe("p.7");
  });

  test("renders a PDF location with its section", () => {
    const loc: SourceLocation = { kind: "pdf", page: 7, section: "FV 03" };
    expect(formatSourceLocation(loc)).toBe("p.7 §FV 03");
  });

  // Cell-level provenance is what makes a spreadsheet import auditable: a
  // reviewer can open the workbook and land on the exact cell.
  test("renders a workbook location down to the cells", () => {
    const loc: SourceLocation = {
      kind: "xlsx",
      sheet: "P&Cs",
      table: "PIs",
      row: 42,
      columns: { number: "J42", principle: "K42", level: "M42" },
    };
    expect(formatSourceLocation(loc)).toBe("P&Cs!J42,K42,M42");
  });

  test("falls back to the row when no columns are recorded", () => {
    const loc: SourceLocation = { kind: "xlsx", sheet: "PI", row: 42 };
    expect(formatSourceLocation(loc)).toBe("PI!42");
  });
});
