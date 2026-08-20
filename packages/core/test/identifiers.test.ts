import { describe, expect, test } from "bun:test";
import {
  canonicalizeCriterionNumber,
  extractCriterionNumbers,
  isPublisherGuid,
  parseCriterionNumber,
  parseSectionNumber,
  stripGuidSuffix,
  stripSectionNumber,
} from "../src/identifiers.ts";

describe("parseCriterionNumber", () => {
  test("parses a depth-2 criterion", () => {
    const c = parseCriterionNumber("FV-Smart 03.01")!;
    expect(c.formatted).toBe("FV-Smart 03.01");
    expect(c.edition).toBe("smart");
    expect(c.section).toBe(3);
    expect(c.subsection).toBeNull();
    expect(c.ordinal).toBe(1);
  });

  test("parses a depth-3 criterion and assigns the middle group to subsection", () => {
    const c = parseCriterionNumber("FV-Smart 32.10.06")!;
    expect(c.section).toBe(32);
    expect(c.subsection).toBe(10);
    expect(c.ordinal).toBe(6);
    expect(c.formatted).toBe("FV-Smart 32.10.06");
  });

  test("parses the GFS edition", () => {
    const c = parseCriterionNumber("FV-GFS 20.01.01")!;
    expect(c.edition).toBe("gfs");
    expect(c.formatted).toBe("FV-GFS 20.01.01");
  });

  // The P&C table of contents drops leading zeros while the body table keeps
  // them; both must resolve to the same database row.
  test("zero-pads so table-of-contents and body forms converge", () => {
    expect(canonicalizeCriterionNumber("FV-Smart 3.1")).toBe("FV-Smart 03.01");
    expect(canonicalizeCriterionNumber("fv smart 3.1")).toBe("FV-Smart 03.01");
    expect(canonicalizeCriterionNumber("FV-SMART 32.10.6")).toBe("FV-Smart 32.10.06");
  });

  test("tolerates the hyphen being dropped or the case shouting", () => {
    expect(canonicalizeCriterionNumber("FV Smart 01.01")).toBe("FV-Smart 01.01");
    expect(canonicalizeCriterionNumber("FV-SMART 01.01")).toBe("FV-Smart 01.01");
  });

  test("is anchored, so a criterion embedded in a sentence is not an exact match", () => {
    expect(parseCriterionNumber("FV-Smart 01.01 A procedure is in place")).toBeNull();
  });

  test("rejects non-criteria", () => {
    expect(parseCriterionNumber("FV 01 INTERNAL DOCUMENTATION")).toBeNull();
    expect(parseCriterionNumber("Major Must")).toBeNull();
    expect(parseCriterionNumber("-")).toBeNull();
    expect(parseCriterionNumber("")).toBeNull();
    expect(parseCriterionNumber(null)).toBeNull();
    expect(parseCriterionNumber(undefined)).toBeNull();
  });
});

describe("criterion sortKey", () => {
  test("produces document order across differing depths", () => {
    const order = ["FV-Smart 32.10.06", "FV-Smart 03.01", "FV-Smart 32.09.01", "FV-Smart 33.01"]
      .map((s) => parseCriterionNumber(s)!)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((c) => c.formatted);

    expect(order).toEqual([
      "FV-Smart 03.01",
      "FV-Smart 32.09.01",
      "FV-Smart 32.10.06",
      "FV-Smart 33.01",
    ]);
  });

  test("sorts a depth-2 criterion before the subsection that shares its numbers", () => {
    const parent = parseCriterionNumber("FV-Smart 20.01")!;
    const child = parseCriterionNumber("FV-Smart 20.01.01")!;
    expect(parent.sortKey).toBeLessThan(child.sortKey);
  });

  test("is numeric, so 9 sorts before 10 rather than after", () => {
    const nine = parseCriterionNumber("FV-Smart 32.09.01")!;
    const ten = parseCriterionNumber("FV-Smart 32.10.01")!;
    expect(nine.sortKey).toBeLessThan(ten.sortKey);
  });
});

describe("extractCriterionNumbers", () => {
  test("finds each distinct criterion once, in order of appearance", () => {
    const page = `
      FV-Smart 01.01 A procedure is in place to manage and control documents.
      See FV-Smart 01.01 for the procedure requirement.
      FV-Smart 01.02 Records for auditing purposes are up-to-date.
      FV-Smart 01.03 The producer completes a self-assessment.
    `;
    expect(extractCriterionNumbers(page).map((c) => c.formatted)).toEqual([
      "FV-Smart 01.01",
      "FV-Smart 01.02",
      "FV-Smart 01.03",
    ]);
  });

  test("returns nothing for a page with no criteria", () => {
    expect(extractCriterionNumbers("TABLE OF CONTENTS ... 4")).toEqual([]);
  });

  // Guards the negative lookahead: without it, `01.011` would yield `01.01`
  // and attach a criterion to the wrong page.
  test("does not match a prefix of a longer number", () => {
    expect(extractCriterionNumbers("FV-Smart 01.011").map((c) => c.formatted)).toEqual([]);
  });

  test("finds criteria of both editions in mixed text", () => {
    const found = extractCriterionNumbers("compare FV-Smart 01.01 against FV-GFS 01.01");
    expect(found.map((c) => c.formatted)).toEqual(["FV-Smart 01.01", "FV-GFS 01.01"]);
  });
});

describe("parseSectionNumber", () => {
  test("parses a top-level section and its workbook order value", () => {
    const s = parseSectionNumber("FV 01 INTERNAL DOCUMENTATION")!;
    expect(s.formatted).toBe("FV 01");
    expect(s.section).toBe(1);
    expect(s.subsection).toBeNull();
    expect(s.order).toBe(1);
  });

  // The workbook encodes subsection order as section*100+subsection; deriving
  // it the same way lets imported and computed orders be compared directly.
  test("parses a subsection with the workbook's composite order", () => {
    const s = parseSectionNumber("FV 32.10 Mixing and handling")!;
    expect(s.formatted).toBe("FV 32.10");
    expect(s.order).toBe(3210);
  });

  test("returns null for a heading with no number", () => {
    expect(parseSectionNumber("GENERAL")).toBeNull();
    expect(parseSectionNumber(null)).toBeNull();
  });
});

describe("stripSectionNumber", () => {
  test("leaves the human title", () => {
    expect(stripSectionNumber("FV 01 INTERNAL DOCUMENTATION")).toBe("INTERNAL DOCUMENTATION");
    expect(stripSectionNumber("FV 32.10 Mixing and handling")).toBe("Mixing and handling");
  });

  test("passes through a heading with no number", () => {
    expect(stripSectionNumber("GENERAL")).toBe("GENERAL");
  });
});

describe("isPublisherGuid", () => {
  // Every one of these is a real GUID read out of the official IFA v6 Smart
  // checklist workbook's `PIs` and `allsections` tables.
  test("accepts real GLOBALG.A.P. GUIDs", () => {
    for (const guid of [
      "1Gmd3v6po0V454XQEGKJ0x",
      "WWdX1Wkk01XzcMWRiIDbo",
      "5LMwK3SiBMvgOtjut0DELI",
      "76Up1Jlz2ogKdKXUH1J3L",
      "oOfpsr1EZQ6CxCOIvBlFe",
      "5nISxpmIvwZJyExTIGOvlS",
      "3WBrxkh802qoM6WUHlCwcx",
    ]) {
      expect(isPublisherGuid(guid)).toBe(true);
    }
  });

  // This is the actual import bug the check exists to catch: the workbook
  // leaves `-` and `#N/A` in cells that look like they should hold a GUID.
  test("rejects the placeholder values the workbook leaves behind", () => {
    expect(isPublisherGuid("-")).toBe(false);
    expect(isPublisherGuid("#N/A")).toBe(false);
    expect(isPublisherGuid("#REF!")).toBe(false);
    expect(isPublisherGuid("")).toBe(false);
    expect(isPublisherGuid(null)).toBe(false);
    expect(isPublisherGuid(undefined)).toBe(false);
  });

  test("rejects strings outside the 20-22 character range", () => {
    expect(isPublisherGuid("tooshort")).toBe(false);
    expect(isPublisherGuid("a".repeat(19))).toBe(false);
    expect(isPublisherGuid("a".repeat(23))).toBe(false);
    expect(isPublisherGuid("a".repeat(20))).toBe(true);
    expect(isPublisherGuid("a".repeat(22))).toBe(true);
  });

  test("rejects a concatenated composite key", () => {
    // 22-char GUID + "NO" is 24 characters, outside the valid range.
    expect(isPublisherGuid("5LMwK3SiBMvgOtjut0DELINO")).toBe(false);
  });
});

describe("stripGuidSuffix", () => {
  // Column H of the `PIs` table is literally `PIGUID & "NO"`. Splitting the
  // suffix back off is how reconciliation verifies that relation.
  test("recovers the GUID from the workbook's PIGUID&NO composite key", () => {
    expect(stripGuidSuffix("5LMwK3SiBMvgOtjut0DELINO", "NO")).toBe("5LMwK3SiBMvgOtjut0DELI");
    expect(stripGuidSuffix("7xlIZC2bfwh0I7BDK4eMO8NO", "NO")).toBe("7xlIZC2bfwh0I7BDK4eMO8");
  });

  test("returns null when the suffix is absent", () => {
    expect(stripGuidSuffix("5LMwK3SiBMvgOtjut0DELI", "NO")).toBeNull();
  });

  test("returns null when what remains is not a valid GUID", () => {
    expect(stripGuidSuffix("shortNO", "NO")).toBeNull();
  });
});
