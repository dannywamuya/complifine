import { describe, expect, test } from "bun:test";
import {
  Workbook,
  cellFlag,
  cellNumber,
  cellText,
  columnRange,
  columnToIndex,
  indexToColumn,
  isPlaceholder,
  parseCellRef,
} from "../src/xlsx/workbook.ts";
import { buildWorkbook } from "./fixtures/xlsx.ts";

describe("column arithmetic", () => {
  test("round-trips single and multi-letter columns", () => {
    for (const [column, index] of [
      ["A", 1],
      ["Z", 26],
      ["AA", 27],
      ["AZ", 52],
      ["BA", 53],
      ["ZZ", 702],
    ] as const) {
      expect(columnToIndex(column)).toBe(index);
      expect(indexToColumn(index)).toBe(column);
    }
  });

  test("expands a range inclusively and across the letter boundary", () => {
    expect(columnRange("A", "D")).toEqual(["A", "B", "C", "D"]);
    expect(columnRange("Y", "AB")).toEqual(["Y", "Z", "AA", "AB"]);
    expect(columnRange("C", "C")).toEqual(["C"]);
  });

  test("parses a cell reference", () => {
    expect(parseCellRef("D42")).toEqual({ column: "D", row: 42 });
    expect(parseCellRef("AB1")).toEqual({ column: "AB", row: 1 });
    expect(() => parseCellRef("42D")).toThrow(/Malformed/);
  });
});

describe("Workbook.fromBytes", () => {
  test("reads sheets, shared strings and inline strings", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", value: "hello" },
            { ref: "B1", value: "world", kind: "inline" },
            { ref: "C1", value: 42 },
          ],
        },
      ]),
    );

    const row = wb.requireSheet("Sheet1").byIndex.get(1)!;
    expect(row.cells.get("A")!.value).toBe("hello");
    expect(row.cells.get("B")!.value).toBe("world");
    expect(row.cells.get("C")!.value).toBe(42);
  });

  test("names an unknown sheet in the error, so a renamed sheet is diagnosable", () => {
    const wb = Workbook.fromBytes(buildWorkbook([{ name: "PIs", cells: [] }]));
    expect(() => wb.requireSheet("Criteria")).toThrow(/Available sheets: PIs/);
  });

  // The single most consequential format detail: most of the `PIs` table is
  // INDEX/MATCH formulas, and a reader that only takes literal cells sees an
  // empty sheet.
  test("reads the cached value of a formula cell", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([
        {
          name: "PIs",
          cells: [
            {
              ref: "A1",
              value: "FV-Smart 01.01",
              kind: "formulaString",
              formula: "INDEX(source,MATCH($A2,keys,0))",
            },
          ],
        },
      ]),
    );

    const cell = wb.requireSheet("PIs").byIndex.get(1)!.cells.get("A")!;
    expect(cell.value).toBe("FV-Smart 01.01");
    expect(cell.formula).toBe("INDEX(source,MATCH($A2,keys,0))");
  });

  // Excel splits a shared string into runs when part of it is styled. Reading
  // only the first `<t>` truncates a requirement mid-sentence.
  test("concatenates rich text runs into one value", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([
        {
          name: "Sheet1",
          cells: [
            {
              ref: "A1",
              value: "",
              runs: ["A documented procedure ", "shall be in place ", "and implemented."],
            },
          ],
        },
      ]),
    );

    expect(wb.requireSheet("Sheet1").byIndex.get(1)!.cells.get("A")!.value).toBe(
      "A documented procedure shall be in place and implemented.",
    );
  });

  // Blank cells are omitted from the XML entirely. Addressing by position
  // within the row would shift every value after the gap.
  test("addresses sparse rows by reference, not by position", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", value: "first" },
            // B1 omitted entirely.
            { ref: "C1", value: "third" },
          ],
        },
      ]),
    );

    const row = wb.requireSheet("Sheet1").byIndex.get(1)!;
    expect(row.cells.get("A")!.value).toBe("first");
    expect(row.cells.get("B")).toBeUndefined();
    expect(row.cells.get("C")!.value).toBe("third");
  });

  test("surfaces error cells as their literal text rather than as null", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([
        { name: "Sheet1", cells: [{ ref: "A1", value: "#N/A", kind: "error" }] },
      ]),
    );

    // Deliberate: the normalizer decides what a placeholder means, and it can
    // only do that if the reader does not silently discard it first.
    expect(wb.requireSheet("Sheet1").byIndex.get(1)!.cells.get("A")!.value).toBe("#N/A");
  });

  test("does not coerce a zero-padded criterion number to a float", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([{ name: "Sheet1", cells: [{ ref: "A1", value: "07.04" }] }]),
    );
    expect(wb.requireSheet("Sheet1").byIndex.get(1)!.cells.get("A")!.value).toBe("07.04");
  });
});

describe("Workbook.readTable", () => {
  const workbook = () =>
    Workbook.fromBytes(
      buildWorkbook(
        [
          {
            name: "PIs",
            cells: [
              { ref: "A1", value: "PIGUID" },
              { ref: "B1", value: "Number" },
              { ref: "C1", value: "Principle" },
              { ref: "A2", value: "1Gmd3v6po0V454XQEGKJ0x" },
              { ref: "B2", value: "FV-Smart 01.01" },
              { ref: "C2", value: "A procedure is in place." },
              { ref: "A3", value: "WWdX1Wkk01XzcMWRiIDbo" },
              { ref: "B3", value: "FV-Smart 01.02" },
              // C3 blank.
            ],
          },
        ],
        [{ name: "PIs", sheet: "PIs", ref: "A1:C3", columns: ["PIGUID", "Number", "Principle"] }],
      ),
    );

  test("keys values by the table's declared column headers", () => {
    const [first, second] = workbook().readTable("PIs");

    expect(first!.values.PIGUID).toBe("1Gmd3v6po0V454XQEGKJ0x");
    expect(first!.values.Number).toBe("FV-Smart 01.01");
    expect(first!.values.Principle).toBe("A procedure is in place.");
    expect(second!.values.Principle).toBeNull();
  });

  // Cell-level provenance: every imported field can cite the exact cell it
  // came from, which is what makes a disputed value traceable.
  test("records the source cell reference for every field", () => {
    const [first] = workbook().readTable("PIs");
    expect(first!.refs.PIGUID).toBe("A2");
    expect(first!.refs.Number).toBe("B2");
    expect(first!.rowIndex).toBe(2);
    expect(first!.sheetName).toBe("PIs");
    expect(first!.tableName).toBe("PIs");
  });

  test("skips the header row and stops at the table's last row", () => {
    expect(workbook().readTable("PIs")).toHaveLength(2);
  });

  test("names available tables when one is missing", () => {
    expect(() => workbook().readTable("S2PQ")).toThrow(/Available tables: PIs/);
  });

  test("flags a wholly blank row as empty", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook(
        [
          {
            name: "S",
            cells: [
              { ref: "A1", value: "a" },
              { ref: "A2", value: "x" },
              // Row 3 exists in the range but has no cells.
              { ref: "A4", value: "y" },
            ],
          },
        ],
        [{ name: "T", sheet: "S", ref: "A1:A4", columns: ["a"] }],
      ),
    );

    const rows = wb.readTable("T");
    expect(rows.map((r) => r.values.a)).toEqual(["x", "y"]);
    expect(rows.every((r) => !r.isEmpty)).toBe(true);
  });
});

describe("Workbook.readRange", () => {
  test("takes headers from the first row of the range", () => {
    const wb = Workbook.fromBytes(
      buildWorkbook([
        {
          name: "Instructions",
          cells: [
            { ref: "B10", value: "Question" },
            { ref: "C10", value: "Justification" },
            { ref: "B11", value: "Do you harvest?" },
            { ref: "C11", value: "Determines section 20." },
          ],
        },
      ]),
    );

    const [row] = wb.readRange("Instructions", "B10:C11");
    expect(row!.values.Question).toBe("Do you harvest?");
    expect(row!.values.Justification).toBe("Determines section 20.");
    expect(row!.refs.Question).toBe("B11");
  });
});

describe("cell value normalisation", () => {
  test("treats the workbook's placeholders as nothing", () => {
    for (const placeholder of ["-", "--", "#N/A", "#REF!", "#VALUE!", "N/A", "n/a"]) {
      expect(isPlaceholder(placeholder)).toBe(true);
      expect(cellText(placeholder)).toBeNull();
      expect(cellNumber(placeholder)).toBeNull();
    }
  });

  test("keeps a legitimate hyphenated value", () => {
    expect(cellText("non-conformance")).toBe("non-conformance");
    expect(isPlaceholder("non-conformance")).toBe(false);
  });

  test("trims, and treats whitespace-only as blank", () => {
    expect(cellText("  spaced  ")).toBe("spaced");
    expect(cellText("   ")).toBeNull();
    expect(cellText(null)).toBeNull();
  });

  test("reads numbers written as text", () => {
    expect(cellNumber("42")).toBe(42);
    expect(cellNumber(42)).toBe(42);
    expect(cellNumber("not a number")).toBeNull();
  });

  // The workbooks encode the same flag three different ways.
  test("accepts every spelling of a flag the workbooks use", () => {
    for (const truthy of [1, "1", true, "X", "x", "yes", "true"]) {
      expect(cellFlag(truthy)).toBe(true);
    }
    for (const falsy of [0, "0", false, "", null, "no"]) {
      expect(cellFlag(falsy)).toBe(false);
    }
  });
});
