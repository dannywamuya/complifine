import { describe, expect, test } from "bun:test";
import { buildPageMap } from "../src/pdf/page-map.ts";
import { makePdf } from "./fixtures/pdf.ts";

const requirement = (id: string, principle: string, criteria: string | null = null) => ({
  sourceRequirementId: id,
  principleText: principle,
  criteriaText: criteria,
});

describe("buildPageMap", () => {
  test("locates a criterion on the page that states it", () => {
    const pdf = makePdf([
      "FV-Smart 01.01 A procedure is in place to manage and control documents.",
      "FV-Smart 01.02 Records for auditing purposes are up-to-date and available.",
    ]);

    const map = buildPageMap(
      pdf,
      [
        requirement("FV-Smart 01.01", "A procedure is in place to manage and control documents."),
        requirement("FV-Smart 01.02", "Records for auditing purposes are up-to-date and available."),
      ],
      "smart",
    );

    expect(map.locations.get("FV-Smart 01.01")!.page).toBe(1);
    expect(map.locations.get("FV-Smart 01.02")!.page).toBe(2);
    expect(map.locations.get("FV-Smart 01.01")!.coverage).toBe(1);
    expect(map.locations.get("FV-Smart 01.01")!.textMissing).toBe(false);
  });

  // The identifier appears in the table of contents as well as at the
  // definition, so an identifier index alone picks the wrong page. Scoring by
  // text is what breaks the tie.
  test("prefers the page carrying the text over the table of contents", () => {
    const pdf = makePdf([
      "TABLE OF CONTENTS FV-Smart 01.01 Documentation FV-Smart 01.02 Records",
      "FV-Smart 01.01 A documented procedure is in place to manage and control all documents relevant to the standard.",
    ]);

    const map = buildPageMap(
      pdf,
      [
        requirement(
          "FV-Smart 01.01",
          "A documented procedure is in place to manage and control all documents relevant to the standard.",
        ),
      ],
      "smart",
    );

    expect(map.locations.get("FV-Smart 01.01")!.page).toBe(2);
  });

  // A criterion at the foot of a page continues onto the next. Scoring the
  // page alone would penalise the import for the publisher's typesetting.
  test("scores a criterion that straddles a page break against both pages", () => {
    const pdf = makePdf([
      "FV-Smart 04.01 The producer has a documented risk assessment covering all sites and",
      "all products, reviewed annually and after any significant change to the operation.",
    ]);

    const map = buildPageMap(
      pdf,
      [
        requirement(
          "FV-Smart 04.01",
          "The producer has a documented risk assessment covering all sites and all products, " +
            "reviewed annually and after any significant change to the operation.",
        ),
      ],
      "smart",
    );

    const location = map.locations.get("FV-Smart 04.01")!;
    expect(location.page).toBe(1);
    expect(location.coverage).toBeGreaterThan(0.95);
    expect(location.textMissing).toBe(false);
  });

  test("flags an identifier found without its text as a cross-reference", () => {
    const pdf = makePdf([
      "See FV-Smart 20.01 for the requirements applicable to harvest activities.",
    ]);

    const map = buildPageMap(
      pdf,
      [
        requirement(
          "FV-Smart 20.01",
          "Hygiene instructions for harvest are documented, communicated to all workers, " +
            "and visibly displayed at the point of harvest.",
        ),
      ],
      "smart",
    );

    expect(map.locations.get("FV-Smart 20.01")!.textMissing).toBe(true);
  });

  test("matches the criteria text as well as the principle", () => {
    const pdf = makePdf([
      "FV-Smart 01.01 A procedure is in place. Evidence of the procedure and its annual review is available for inspection.",
    ]);

    const map = buildPageMap(
      pdf,
      [
        requirement(
          "FV-Smart 01.01",
          "A procedure is in place.",
          "Evidence of the procedure and its annual review is available for inspection.",
        ),
      ],
      "smart",
    );

    expect(map.locations.get("FV-Smart 01.01")!.coverage).toBe(1);
  });

  // The GFS PDF cross-references Smart numbers in its change notes. Indexing
  // them would attach GFS requirements to pages that discuss the other edition.
  test("ignores identifiers belonging to the other edition", () => {
    const pdf = makePdf([
      "FV-GFS 01.01 A procedure is in place. This replaces FV-Smart 01.01 in the Smart edition.",
    ]);

    const map = buildPageMap(
      pdf,
      [requirement("FV-GFS 01.01", "A procedure is in place.")],
      "gfs",
    );

    expect(map.locations.get("FV-GFS 01.01")!.page).toBe(1);
    expect(map.unmatchedInPdf).toEqual([]);
  });

  // The reconciliation half of the mapper's job: an identifier printed in the
  // standard that the workbook import never produced means a lost criterion.
  test("reports identifiers present in the PDF but absent from the import", () => {
    const pdf = makePdf([
      "FV-Smart 01.01 A procedure is in place.",
      "FV-Smart 01.02 Records are up to date.",
    ]);

    const map = buildPageMap(
      pdf,
      [requirement("FV-Smart 01.01", "A procedure is in place.")],
      "smart",
    );

    expect(map.unmatchedInPdf).toEqual(["FV-Smart 01.02"]);
  });

  test("omits a requirement whose identifier appears nowhere in the PDF", () => {
    const pdf = makePdf(["FV-Smart 01.01 A procedure is in place."]);

    const map = buildPageMap(
      pdf,
      [
        requirement("FV-Smart 01.01", "A procedure is in place."),
        requirement("FV-Smart 99.99", "An invented requirement."),
      ],
      "smart",
    );

    expect(map.locations.has("FV-Smart 99.99")).toBe(false);
    expect(map.pageCount).toBe(1);
  });
});
