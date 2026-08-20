/**
 * A purpose-built reader for the Office Open XML spreadsheet format.
 *
 * Why not a general-purpose library: the GLOBALG.A.P. checklists carry their
 * structure in defined *tables* (`xl/tables/*.xml`) - `PIs`, `S2PQ`,
 * `S2PQ_relational`, `allsections`, `Level`. Reading those definitions lets us
 * address data by table name and column header rather than by hard-coded cell
 * ranges, so the parser keeps working when the publisher inserts a row or
 * shifts a block. Most spreadsheet libraries do not expose table definitions
 * at all, which would force exactly the brittle range-based addressing we want
 * to avoid.
 *
 * Three format details this reader gets right, each of which silently corrupts
 * a naive import of these particular files:
 *
 *   - **Cached formula values.** Most cells in `PIs` are formulas. The value
 *     lives in `<v>` next to `<f>`; reading only literal cells yields nulls for
 *     the majority of the sheet.
 *   - **Rich text runs.** A shared string may be split across several `<r><t>`
 *     runs when part of it is styled. Taking the first `<t>` truncates the
 *     text mid-sentence.
 *   - **Sparse rows.** Blank cells are omitted entirely rather than emitted as
 *     empty, so cells must be addressed by their `r` reference, never by
 *     position within the row.
 */

import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// Cell values
// ---------------------------------------------------------------------------

export type CellValue = string | number | boolean | null;

export interface Cell {
  /** A1-style reference, e.g. `D42`. */
  readonly ref: string;
  /** Column letters, e.g. `D`. */
  readonly column: string;
  /** 1-based row number. */
  readonly row: number;
  readonly value: CellValue;
  /** Formula source when the cell is computed, without the leading `=`. */
  readonly formula: string | null;
}

export interface Row {
  readonly index: number;
  readonly cells: ReadonlyMap<string, Cell>;
}

export interface Sheet {
  readonly name: string;
  readonly rows: readonly Row[];
  /** Rows keyed by 1-based index, for random access. */
  readonly byIndex: ReadonlyMap<number, Row>;
}

/** A defined table (`ListObject`) within a sheet. */
export interface Table {
  readonly name: string;
  readonly displayName: string;
  readonly sheetName: string;
  /** e.g. `A1:W191`. */
  readonly ref: string;
  readonly startColumn: string;
  readonly startRow: number;
  readonly endColumn: string;
  readonly endRow: number;
  /** Header names in column order, as written in the header row. */
  readonly columns: readonly string[];
  /** Number of header rows; 0 when the table declares none. */
  readonly headerRowCount: number;
}

// ---------------------------------------------------------------------------
// Column reference arithmetic
// ---------------------------------------------------------------------------

/** `A` -> 1, `Z` -> 26, `AA` -> 27. */
export function columnToIndex(column: string): number {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 64);
  }
  return index;
}

/** 1 -> `A`, 27 -> `AA`. */
export function indexToColumn(index: number): string {
  let column = "";
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    n = Math.floor((n - 1) / 26);
  }
  return column;
}

/** Split `D42` into `{ column: "D", row: 42 }`. */
export function parseCellRef(ref: string): { column: string; row: number } {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) throw new Error(`Malformed cell reference: ${ref}`);
  return { column: match[1]!, row: Number.parseInt(match[2]!, 10) };
}

/** Every column letter in an inclusive range, e.g. `A`..`D`. */
export function columnRange(start: string, end: string): string[] {
  const from = columnToIndex(start);
  const to = columnToIndex(end);
  const columns: string[] = [];
  for (let i = from; i <= to; i++) columns.push(indexToColumn(i));
  return columns;
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  // Text nodes need a predictable key; OOXML nests `<t>` inside `<is>`/`<r>`.
  textNodeName: "#text",
  // Never coerce. A criterion number like `07.04` must not become 7.04, and a
  // GUID that happens to be all digits must not become a float.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  // Sheets and rows are repeated elements; forcing arrays removes the
  // "one element or many?" branch from every call site.
  isArray: (name) => ["sheet", "row", "c", "si", "r", "tableColumn", "Relationship"].includes(name),
});

type XmlNode = Record<string, any>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Concatenate every `<t>` descendant.
 *
 * Shared strings split into runs whenever part of the string carries different
 * formatting, which is common in these workbooks where a leading "P:" or "C:"
 * is bolded. Only the concatenation is the real value.
 */
function collectText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");

  const record = node as XmlNode;
  let out = "";
  for (const [key, value] of Object.entries(record)) {
    // Skip attributes and the phonetic-hint elements Excel adds for CJK text.
    if (key.startsWith("@") || key === "rPh" || key === "phoneticPr") continue;
    if (key === "#text") {
      out += String(value);
    } else if (key === "t" || key === "r") {
      out += collectText(value);
    } else if (typeof value === "object") {
      out += collectText(value);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

export class Workbook {
  private constructor(
    private readonly sheets: Map<string, Sheet>,
    private readonly tables: Map<string, Table>,
    /** Original sheet order, as displayed in Excel. */
    readonly sheetNames: readonly string[],
  ) {}

  static async fromFile(path: string): Promise<Workbook> {
    const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
    return Workbook.fromBytes(bytes);
  }

  static fromBytes(bytes: Uint8Array): Workbook {
    const files = unzipSync(bytes);
    const decoder = new TextDecoder("utf-8");
    const read = (name: string): string | null => {
      const entry = files[name];
      return entry ? decoder.decode(entry) : null;
    };

    // --- shared strings --------------------------------------------------
    const sharedStrings: string[] = [];
    const sharedXml = read("xl/sharedStrings.xml");
    if (sharedXml) {
      const parsed = parser.parse(sharedXml) as XmlNode;
      for (const si of asArray(parsed.sst?.si)) {
        sharedStrings.push(collectText(si));
      }
    }

    // --- sheet name to part path ------------------------------------------
    const workbookXml = read("xl/workbook.xml");
    if (!workbookXml) throw new Error("Not an xlsx file: xl/workbook.xml is missing");

    const relsXml = read("xl/_rels/workbook.xml.rels");
    const relTargets = new Map<string, string>();
    if (relsXml) {
      const parsedRels = parser.parse(relsXml) as XmlNode;
      for (const rel of asArray(parsedRels.Relationships?.Relationship)) {
        relTargets.set(String(rel["@Id"]), String(rel["@Target"]));
      }
    }

    const parsedWorkbook = parser.parse(workbookXml) as XmlNode;
    const sheetOrder: string[] = [];
    const sheetPaths = new Map<string, string>();
    for (const sheet of asArray(parsedWorkbook.workbook?.sheets?.sheet)) {
      const name = String(sheet["@name"]);
      const relId = String(sheet["@r:id"] ?? sheet["@id"] ?? "");
      const target = relTargets.get(relId);
      if (!target) continue;
      // Targets are relative to xl/ and may be written as `/xl/worksheets/...`.
      const path = target.startsWith("/")
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, "")}`;
      sheetOrder.push(name);
      sheetPaths.set(name, path);
    }

    // --- sheets -----------------------------------------------------------
    const sheets = new Map<string, Sheet>();
    const sheetPathToName = new Map<string, string>();
    for (const [name, path] of sheetPaths) {
      sheetPathToName.set(path, name);
      const xml = read(path);
      if (!xml) continue;
      sheets.set(name, parseSheet(name, xml, sharedStrings));
    }

    // --- tables -----------------------------------------------------------
    // A table part is linked from its sheet's rels, which is the only way to
    // know which sheet a table belongs to.
    const tables = new Map<string, Table>();
    for (const [path, sheetName] of sheetPathToName) {
      const relPath = path.replace(/worksheets\/([^/]+)$/, "worksheets/_rels/$1.rels");
      const sheetRelsXml = read(relPath);
      if (!sheetRelsXml) continue;

      const parsedSheetRels = parser.parse(sheetRelsXml) as XmlNode;
      for (const rel of asArray(parsedSheetRels.Relationships?.Relationship)) {
        const target = String(rel["@Target"] ?? "");
        if (!target.includes("tables/")) continue;

        const tablePath = `xl/${target.replace(/^\.\.\//, "").replace(/^\.\//, "")}`;
        const tableXml = read(tablePath);
        if (!tableXml) continue;

        const parsedTable = parser.parse(tableXml) as XmlNode;
        const node = parsedTable.table;
        if (!node) continue;

        const ref = String(node["@ref"]);
        const [startRef, endRef] = ref.split(":");
        const start = parseCellRef(startRef!);
        const end = parseCellRef(endRef ?? startRef!);
        const name = String(node["@name"]);

        tables.set(name, {
          name,
          displayName: String(node["@displayName"] ?? name),
          sheetName,
          ref,
          startColumn: start.column,
          startRow: start.row,
          endColumn: end.column,
          endRow: end.row,
          columns: asArray(node.tableColumns?.tableColumn).map((c: XmlNode) =>
            decodeEntities(String(c["@name"])),
          ),
          headerRowCount: Number.parseInt(String(node["@headerRowCount"] ?? "1"), 10),
        });
      }
    }

    return new Workbook(sheets, tables, sheetOrder);
  }

  sheet(name: string): Sheet | null {
    return this.sheets.get(name) ?? null;
  }

  requireSheet(name: string): Sheet {
    const sheet = this.sheet(name);
    if (!sheet) {
      throw new Error(
        `Sheet "${name}" not found. Available sheets: ${this.sheetNames.join(", ")}`,
      );
    }
    return sheet;
  }

  table(name: string): Table | null {
    return this.tables.get(name) ?? null;
  }

  requireTable(name: string): Table {
    const table = this.table(name);
    if (!table) {
      throw new Error(
        `Table "${name}" not found. Available tables: ${this.tableNames.join(", ")}`,
      );
    }
    return table;
  }

  get tableNames(): string[] {
    return [...this.tables.keys()];
  }

  /**
   * Read a defined table as a list of records keyed by column header.
   *
   * This is the primary entry point for the checklist adapter. Addressing by
   * header name rather than column letter is what makes the import survive the
   * publisher inserting a column, which they have done between revisions.
   */
  readTable(name: string): TableRecord[] {
    const table = this.requireTable(name);
    const sheet = this.requireSheet(table.sheetName);
    const columns = columnRange(table.startColumn, table.endColumn);

    // Header row count is usually 1; when 0 the table's first row is data and
    // the column names come from the table definition alone.
    const firstDataRow = table.startRow + table.headerRowCount;

    const records: TableRecord[] = [];
    for (let rowIndex = firstDataRow; rowIndex <= table.endRow; rowIndex++) {
      const row = sheet.byIndex.get(rowIndex);
      if (!row) continue;

      const values: Record<string, CellValue> = {};
      const refs: Record<string, string> = {};
      let hasValue = false;

      for (let i = 0; i < columns.length; i++) {
        const column = columns[i]!;
        // Fall back to the letter when the table declares fewer columns than
        // its range spans, which happens in hand-edited workbooks.
        const header = table.columns[i] ?? column;
        const cell = row.cells.get(column);
        values[header] = cell?.value ?? null;
        refs[header] = `${column}${rowIndex}`;
        if (cell?.value != null && cell.value !== "") hasValue = true;
      }

      records.push({
        rowIndex,
        sheetName: table.sheetName,
        tableName: table.name,
        values,
        refs,
        isEmpty: !hasValue,
      });
    }

    return records;
  }

  /**
   * Read an arbitrary rectangular range as records, taking column names from
   * the first row. Used for blocks that Excel never promoted to a real table.
   */
  readRange(sheetName: string, ref: string): TableRecord[] {
    const sheet = this.requireSheet(sheetName);
    const [startRef, endRef] = ref.split(":");
    const start = parseCellRef(startRef!);
    const end = parseCellRef(endRef ?? startRef!);
    const columns = columnRange(start.column, end.column);

    const headerRow = sheet.byIndex.get(start.row);
    const headers = columns.map(
      (column) => stringifyCell(headerRow?.cells.get(column)?.value) || column,
    );

    const records: TableRecord[] = [];
    for (let rowIndex = start.row + 1; rowIndex <= end.row; rowIndex++) {
      const row = sheet.byIndex.get(rowIndex);
      if (!row) continue;

      const values: Record<string, CellValue> = {};
      const refs: Record<string, string> = {};
      let hasValue = false;

      for (let i = 0; i < columns.length; i++) {
        const column = columns[i]!;
        const header = headers[i]!;
        const cell = row.cells.get(column);
        values[header] = cell?.value ?? null;
        refs[header] = `${column}${rowIndex}`;
        if (cell?.value != null && cell.value !== "") hasValue = true;
      }

      records.push({
        rowIndex,
        sheetName,
        tableName: null,
        values,
        refs,
        isEmpty: !hasValue,
      });
    }

    return records;
  }
}

export interface TableRecord {
  readonly rowIndex: number;
  readonly sheetName: string;
  readonly tableName: string | null;
  readonly values: Readonly<Record<string, CellValue>>;
  /** Cell reference for each column, so any field can cite its exact origin. */
  readonly refs: Readonly<Record<string, string>>;
  readonly isEmpty: boolean;
}

// ---------------------------------------------------------------------------
// Sheet parsing
// ---------------------------------------------------------------------------

function parseSheet(name: string, xml: string, sharedStrings: string[]): Sheet {
  const parsed = parser.parse(xml) as XmlNode;
  const rowNodes = asArray(parsed.worksheet?.sheetData?.row);

  const rows: Row[] = [];
  const byIndex = new Map<number, Row>();

  for (const rowNode of rowNodes) {
    const rowIndex = Number.parseInt(String(rowNode["@r"]), 10);
    const cells = new Map<string, Cell>();

    for (const cellNode of asArray(rowNode.c)) {
      const ref = String(cellNode["@r"] ?? "");
      if (!ref) continue;
      const { column, row } = parseCellRef(ref);

      const type = cellNode["@t"] ? String(cellNode["@t"]) : "n";
      const formulaNode = cellNode.f;
      const formula =
        formulaNode == null
          ? null
          : typeof formulaNode === "object"
            ? (collectText(formulaNode) || null)
            : String(formulaNode);

      const value = readCellValue(cellNode, type, sharedStrings);

      cells.set(column, { ref, column, row, value, formula });
    }

    const parsedRow: Row = { index: rowIndex, cells };
    rows.push(parsedRow);
    byIndex.set(rowIndex, parsedRow);
  }

  return { name, rows, byIndex };
}

function readCellValue(
  cellNode: XmlNode,
  type: string,
  sharedStrings: string[],
): CellValue {
  // Inline strings live in `<is>` rather than `<v>`.
  if (type === "inlineStr") {
    const text = collectText(cellNode.is);
    return text === "" ? null : text;
  }

  const raw = cellNode.v;
  if (raw == null) return null;

  // The `<v>` of a formula cell is its cached result. Reading it is what makes
  // the majority of the `PIs` table visible at all: those columns are INDEX/
  // MATCH lookups, and without the cache they would all be null.
  const text = typeof raw === "object" ? collectText(raw) : String(raw);
  if (text === "") return null;

  switch (type) {
    case "s": {
      const index = Number.parseInt(text, 10);
      return sharedStrings[index] ?? null;
    }
    case "str":
      // Formula result that is a string.
      return decodeEntities(text);
    case "b":
      return text === "1" || text.toLowerCase() === "true";
    case "e":
      // Error values (`#N/A`, `#REF!`) are placeholders in these workbooks, not
      // data. Surfaced as their literal text so the normalizer can drop them
      // deliberately rather than having them silently become null here.
      return text;
    default: {
      const num = Number(text);
      return Number.isFinite(num) ? num : text;
    }
  }
}

/**
 * fast-xml-parser decodes standard entities in text nodes, but attribute
 * values (which is where table column names live) come through raw.
 */
function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Value normalisation
// ---------------------------------------------------------------------------

/**
 * Placeholders these workbooks use to mean "nothing here".
 *
 * Importing any of these as text would create requirements whose principle is
 * literally "#N/A", which is exactly the class of silent corruption the
 * reconciliation gates exist to catch - better to never create it.
 */
const PLACEHOLDERS = new Set([
  "-",
  "--",
  "#N/A",
  "#REF!",
  "#VALUE!",
  "#DIV/0!",
  "#NAME?",
  "#NULL!",
  "#NUM!",
  "n/a",
  "N/A",
]);

export function isPlaceholder(value: CellValue): boolean {
  return typeof value === "string" && PLACEHOLDERS.has(value.trim());
}

/**
 * The accessors below take `CellValue | undefined` rather than `CellValue`.
 *
 * `undefined` is what indexing `row.values` by a column name yields when the
 * workbook does not have that column at all, which is different from a blank
 * cell but means the same thing to every caller here: no value. Accepting it
 * keeps the difference from leaking into thirty call sites as a non-null
 * assertion, which would suppress a genuinely useful error elsewhere.
 */

/** Cell value as a string, or `null` for blanks and placeholders. */
export function cellText(value: CellValue | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value).trim();
  if (text === "" || PLACEHOLDERS.has(text)) return null;
  return text;
}

/** Cell value as a string, never null. Blanks become the empty string. */
export function stringifyCell(value: CellValue | undefined): string {
  return cellText(value) ?? "";
}

/** Cell value as a number, or null when it is not numeric. */
export function cellNumber(value: CellValue | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = String(value).trim();
  if (text === "" || PLACEHOLDERS.has(text)) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

/**
 * Cell value as a boolean flag.
 *
 * The workbooks encode flags as the numbers 0 and 1, as the strings "0" and
 * "1", and occasionally as "X" for "excluded from this edition". All three
 * mean the same thing to us.
 */
export function cellFlag(value: CellValue | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "x" || text === "yes";
}
