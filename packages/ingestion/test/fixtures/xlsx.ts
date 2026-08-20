/**
 * A minimal but real .xlsx builder.
 *
 * The workbook reader is tested against files it constructs itself rather than
 * against a checked-in binary, for two reasons. A committed workbook makes the
 * test opaque - you cannot see from the test what shape the input has. And the
 * cases worth testing are the awkward ones (cached formula values, rich text
 * runs, sparse rows, error cells) which are hard to produce on demand in Excel
 * and trivial to produce here.
 *
 * The output is a genuine Office Open XML package, not a mock: it goes through
 * the same `unzipSync` and XML parsing path as the publisher's files.
 */

import { zipSync, strToU8 } from "fflate";

export interface CellSpec {
  /** A1-style reference. */
  readonly ref: string;
  /** Shared string, inline string, number, boolean, error, or formula result. */
  readonly value: string | number | boolean;
  readonly kind?: "shared" | "inline" | "number" | "bool" | "error" | "formulaString";
  /** Formula source, without the leading `=`. Implies a cached value. */
  readonly formula?: string;
  /**
   * Split a shared string into styled runs, reproducing how Excel stores a
   * string whose "P:" prefix is bolded.
   */
  readonly runs?: readonly string[];
}

export interface SheetSpec {
  readonly name: string;
  readonly cells: readonly CellSpec[];
}

export interface TableSpec {
  readonly name: string;
  readonly sheet: string;
  /** e.g. `A1:C4`. */
  readonly ref: string;
  readonly columns: readonly string[];
  readonly headerRowCount?: number;
}

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildWorkbook(
  sheets: readonly SheetSpec[],
  tables: readonly TableSpec[] = [],
): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = new Map<string, number>();
  const intern = (text: string): number => {
    const existing = sharedIndex.get(text);
    if (existing !== undefined) return existing;
    const index = shared.length;
    shared.push(text);
    sharedIndex.set(text, index);
    return index;
  };

  // Shared strings must be interned before the sheet XML that references them
  // is serialised, so cell rendering happens in two passes.
  const renderCell = (cell: CellSpec): string => {
    const kind = cell.kind ?? (typeof cell.value === "number" ? "number" : "shared");
    const formula = cell.formula ? `<f>${escapeXml(cell.formula)}</f>` : "";

    switch (kind) {
      case "inline":
        return `<c r="${cell.ref}" t="inlineStr">${formula}<is><t>${escapeXml(String(cell.value))}</t></is></c>`;
      case "number":
        return `<c r="${cell.ref}">${formula}<v>${cell.value}</v></c>`;
      case "bool":
        return `<c r="${cell.ref}" t="b">${formula}<v>${cell.value ? 1 : 0}</v></c>`;
      case "error":
        return `<c r="${cell.ref}" t="e">${formula}<v>${escapeXml(String(cell.value))}</v></c>`;
      case "formulaString":
        return `<c r="${cell.ref}" t="str">${formula}<v>${escapeXml(String(cell.value))}</v></c>`;
      default: {
        const index = cell.runs
          ? internRuns(cell.runs, shared, sharedIndex)
          : intern(String(cell.value));
        return `<c r="${cell.ref}" t="s">${formula}<v>${index}</v></c>`;
      }
    }
  };

  const sheetXml = sheets.map((sheet) => {
    const byRow = new Map<number, string[]>();
    for (const cell of sheet.cells) {
      const rowNumber = Number.parseInt(/\d+/.exec(cell.ref)![0], 10);
      const list = byRow.get(rowNumber) ?? [];
      list.push(renderCell(cell));
      byRow.set(rowNumber, list);
    }

    const rows = [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, cells]) => `<row r="${index}">${cells.join("")}</row>`)
      .join("");

    return { name: sheet.name, xml: `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>` };
  });

  const files: Record<string, Uint8Array> = {};

  files["[Content_Types].xml"] = strToU8(
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );

  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0"?><workbook><sheets>${sheets
      .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );

  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0"?><Relationships>${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}</Relationships>`,
  );

  sheetXml.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheet.xml);

    const sheetTables = tables.filter((t) => t.sheet === sheets[i]!.name);
    if (sheetTables.length === 0) return;

    files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = strToU8(
      `<?xml version="1.0"?><Relationships>${sheetTables
        .map(
          (t, j) =>
            `<Relationship Id="rIdT${j}" Target="../tables/${t.name}.xml"/>`,
        )
        .join("")}</Relationships>`,
    );

    for (const table of sheetTables) {
      files[`xl/tables/${table.name}.xml`] = strToU8(
        `<?xml version="1.0"?><table name="${escapeXml(table.name)}" displayName="${escapeXml(table.name)}" ` +
          `ref="${table.ref}" headerRowCount="${table.headerRowCount ?? 1}">` +
          `<tableColumns count="${table.columns.length}">${table.columns
            .map((c, k) => `<tableColumn id="${k + 1}" name="${escapeXml(c)}"/>`)
            .join("")}</tableColumns></table>`,
      );
    }
  });

  const entries = shared
    // Run-based entries are already XML; plain ones are literal text.
    .map((entry) => (entry.startsWith("<r>") ? `<si>${entry}</si>` : `<si><t>${escapeXml(entry)}</t></si>`))
    .join("");

  files["xl/sharedStrings.xml"] = strToU8(
    `<?xml version="1.0"?><sst count="${shared.length}" uniqueCount="${shared.length}">${entries}</sst>`,
  );

  return zipSync(files);
}

/**
 * Store a string as several `<r><t>` runs inside one `<si>`, which is how Excel
 * represents partially styled text.
 */
function internRuns(
  runs: readonly string[],
  shared: string[],
  sharedIndex: Map<string, number>,
): number {
  const joined = runs.join("");
  const existing = sharedIndex.get(joined);
  if (existing !== undefined) return existing;

  const index = shared.length;
  shared.push(runs.map((run) => `<r><rPr><b/></rPr><t>${escapeXml(run)}</t></r>`).join(""));
  sharedIndex.set(joined, index);
  return index;
}
