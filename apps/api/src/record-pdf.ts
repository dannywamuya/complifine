/**
 * Renders a filled record as the paper form it came from: company and document
 * number, the template title, header blanks, a bordered table of the template
 * columns, and signature lines.
 *
 * Text is drawn with DejaVu Sans so Swahili policy text survives. Standard PDF
 * fonts are WinAnsi and would drop those characters.
 */

import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { FormDefinition, FormField, FormValues } from "@complifine/core";

const FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const PORTRAIT = { w: 595.28, h: 841.89 };
const LANDSCAPE = { w: 841.89, h: 595.28 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface RecordPdfInput {
  readonly company: string;
  readonly site: string;
  readonly location: string | null;
  readonly docRef: string | null;
  readonly title: string;
  readonly definition: FormDefinition;
  readonly header: FormValues;
  readonly entries: readonly { data: FormValues }[];
}

export function pdfFilename(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return `${base || "record"}.pdf`;
}

export async function renderRecordPdf(input: RecordPdfInput): Promise<Uint8Array> {
  const regular = loadFace(FONT_REGULAR);
  const bold = loadFace(FONT_BOLD);
  return new FormSheet(input, regular, bold).build();
}

interface Face {
  readonly bytes: Uint8Array;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly bbox: readonly [number, number, number, number];
  glyph(code: number): number;
  advance(gid: number): number;
}

const faces = new Map<string, Face>();

function loadFace(path: string): Face {
  const cached = faces.get(path);
  if (cached) return cached;
  const bytes = new Uint8Array(readFileSync(path));
  const face = parseFace(bytes);
  faces.set(path, face);
  return face;
}

function parseFace(bytes: Uint8Array): Face {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, { offset: number; length: number }>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
    tables.set(tag, { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) });
  }
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  const cmap = tables.get("cmap");
  if (!head || !hhea || !hmtx || !cmap) throw new Error("Font is missing a required table");

  const unitsPerEm = view.getUint16(head.offset + 18);
  const ascent = view.getInt16(hhea.offset + 4);
  const descent = view.getInt16(hhea.offset + 6);
  const bbox = [
    view.getInt16(head.offset + 36),
    view.getInt16(head.offset + 38),
    view.getInt16(head.offset + 40),
    view.getInt16(head.offset + 42),
  ] as const;
  const numberOfHMetrics = view.getUint16(hhea.offset + 34);
  const glyph = cmapLookup(view, cmap.offset);

  return {
    bytes,
    unitsPerEm,
    ascent,
    descent,
    bbox,
    glyph,
    advance(gid: number) {
      const index = gid < numberOfHMetrics ? gid : numberOfHMetrics - 1;
      return view.getUint16(hmtx.offset + index * 4);
    },
  };
}

function cmapLookup(view: DataView, cmapOffset: number): (code: number) => number {
  const subtables: Array<{ platform: number; encoding: number; offset: number }> = [];
  const n = view.getUint16(cmapOffset + 2);
  for (let i = 0; i < n; i++) {
    const at = cmapOffset + 4 + i * 8;
    subtables.push({
      platform: view.getUint16(at),
      encoding: view.getUint16(at + 2),
      offset: cmapOffset + view.getUint32(at + 4),
    });
  }
  const prefer = (platform: number, encoding: number) =>
    subtables.find((row) => row.platform === platform && row.encoding === encoding);
  const chosen =
    prefer(3, 10) ??
    prefer(0, 4) ??
    prefer(3, 1) ??
    prefer(0, 3) ??
    subtables[0];
  if (!chosen) return () => 0;
  const format = view.getUint16(chosen.offset);
  if (format === 12) return cmapFormat12(view, chosen.offset);
  if (format === 4) return cmapFormat4(view, chosen.offset);
  return () => 0;
}

function cmapFormat4(view: DataView, offset: number): (code: number) => number {
  const segCount = view.getUint16(offset + 6) / 2;
  const endPos = offset + 14;
  const startPos = endPos + segCount * 2 + 2;
  const deltaPos = startPos + segCount * 2;
  const rangePos = deltaPos + segCount * 2;
  const ends: number[] = [];
  const starts: number[] = [];
  const deltas: number[] = [];
  const ranges: number[] = [];
  for (let i = 0; i < segCount; i++) {
    ends.push(view.getUint16(endPos + i * 2));
    starts.push(view.getUint16(startPos + i * 2));
    deltas.push(view.getInt16(deltaPos + i * 2));
    ranges.push(view.getUint16(rangePos + i * 2));
  }
  return (code) => {
    let lo = 0;
    let hi = segCount - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (code > ends[mid]!) lo = mid + 1;
      else if (code < starts[mid]!) hi = mid - 1;
      else if (ranges[mid] === 0) return (code + deltas[mid]!) & 0xffff;
      else {
        const pos = rangePos + mid * 2 + ranges[mid]! + (code - starts[mid]!) * 2;
        const gid = view.getUint16(pos);
        return gid === 0 ? 0 : (gid + deltas[mid]!) & 0xffff;
      }
    }
    return 0;
  };
}

function cmapFormat12(view: DataView, offset: number): (code: number) => number {
  const groups = view.getUint32(offset + 12);
  const start: number[] = [];
  const end: number[] = [];
  const glyph: number[] = [];
  for (let i = 0; i < groups; i++) {
    const at = offset + 16 + i * 12;
    start.push(view.getUint32(at));
    end.push(view.getUint32(at + 4));
    glyph.push(view.getUint32(at + 8));
  }
  return (code) => {
    let lo = 0;
    let hi = groups - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (code > end[mid]!) lo = mid + 1;
      else if (code < start[mid]!) hi = mid - 1;
      else return glyph[mid]! + (code - start[mid]!);
    }
    return 0;
  };
}

interface Column {
  readonly label: string;
  readonly weight: number;
  readonly kind: "item" | "no" | "field";
  readonly field?: FormField;
}

interface SheetRow {
  readonly group?: string;
  readonly label: string;
  readonly values: FormValues;
}

class FormSheet {
  private readonly pages: string[] = [];
  private ops: string[] = [];
  private cursor = 0;
  private readonly usedRegular = new Set<number>();
  private readonly usedBold = new Set<number>();
  private readonly regularChars = new Map<number, number>();
  private readonly boldChars = new Map<number, number>();
  private tableHeader: { widths: number[]; cols: Column[] } | null = null;
  private breaking = false;
  private readonly pageW: number;
  private readonly pageH: number;
  private readonly margin = 36;
  private readonly bottom: number;

  constructor(
    private readonly input: RecordPdfInput,
    private readonly regular: Face,
    private readonly bold: Face,
  ) {
    const wide = this.columns().length >= 7;
    const size = wide ? LANDSCAPE : PORTRAIT;
    this.pageW = size.w;
    this.pageH = size.h;
    this.bottom = this.margin;
    this.newPage();
  }

  build(): Uint8Array {
    this.masthead(true);
    this.headerBlanks();
    this.bodyText();
    if (this.signaturePolicy()) this.policySigns();
    else this.table();
    this.signoff();
    if (this.input.definition.layout === "grid" || this.input.definition.layout === "plan") this.comments();
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    return this.encode();
  }

  private columns(): Column[] {
    const definition = this.input.definition;
    const cols: Column[] = [];
    if (definition.fixedItems?.length) {
      const label = /packline|plant|equipment/i.test(this.input.title) ? "Machine part / type" : "Item";
      cols.push({ label, weight: 1.8, kind: "item" });
    }
    else if (definition.entryFields.length) cols.push({ label: "No.", weight: 0.38, kind: "no" });
    for (const field of definition.entryFields) {
      const base =
        field.type === "longtext" ? 1.7 : field.type === "boolean" ? 0.72 : field.type === "date" ? 0.95 : 1;
      const weight = Math.max(base, field.label.length / 14);
      const label = field.key === "signed" ? "Signature" : field.label;
      cols.push({ label, weight, kind: "field", field });
    }
    return cols;
  }

  private rows(): SheetRow[] {
    const definition = this.input.definition;
    const entries = this.input.entries;
    if (definition.fixedItems?.length) {
      const byItem = new Map<string, FormValues[]>();
      for (const entry of entries) {
        const key = String(entry.data.item ?? "");
        const list = byItem.get(key) ?? [];
        list.push(entry.data);
        byItem.set(key, list);
      }
      const out: SheetRow[] = [];
      const seen = new Set<string>();
      for (const item of definition.fixedItems) {
        seen.add(item.key);
        const hits = byItem.get(item.key);
        if (!hits?.length) out.push({ group: item.group, label: item.label, values: {} });
        else for (const values of hits) out.push({ group: item.group, label: item.label, values });
      }
      for (const [key, hits] of byItem) {
        if (seen.has(key)) continue;
        for (const values of hits) out.push({ label: key || "—", values });
      }
      return out;
    }
    if (entries.length === 0) return [{ label: "", values: {} }];
    return entries.map((entry) => ({ label: "", values: entry.data }));
  }

  private newPage() {
    if (this.ops.length) this.pages.push(this.ops.join("\n"));
    this.ops = [];
    this.cursor = this.pageH - this.margin;
  }

  private ensure(height: number) {
    if (this.cursor - height >= this.bottom) return;
    if (this.breaking) return;
    this.breaking = true;
    this.newPage();
    this.masthead(false);
    if (this.tableHeader) this.columnHeader(this.tableHeader.widths, this.tableHeader.cols);
    this.breaking = false;
  }

  private contentWidth(): number {
    return this.pageW - this.margin * 2;
  }

  private masthead(full: boolean) {
    const { company, docRef, title, site, location } = this.input;
    const width = this.contentWidth();
    this.draw(true, 11, this.margin, this.cursor, company || "Producer");
    if (docRef) {
      const ref = docRef;
      const refW = this.measure(false, 8, ref);
      this.draw(false, 8, this.margin + width - refW, this.cursor - 1, ref);
    }
    this.cursor -= 16;
    if (!full) {
      this.draw(true, 9, this.margin, this.cursor, title.toUpperCase());
      this.cursor -= 16;
      return;
    }
    const lines = this.wrap(true, 13, title.toUpperCase(), width - 24);
    for (const line of lines) {
      const lineW = this.measure(true, 13, line);
      this.draw(true, 13, this.margin + (width - lineW) / 2, this.cursor, line);
      this.cursor -= 16;
    }
    this.rule(this.margin, this.cursor + 6, width);
    this.cursor -= 6;
    const place = [site, location].filter(Boolean).join(", ");
    if (place) {
      this.draw(false, 9, this.margin, this.cursor, `Site: ${place}`);
      this.cursor -= 14;
    }
  }

  private headerBlanks() {
    const fields = this.input.definition.headerFields.filter((field) => !isSignoff(field));
    if (!fields.length) return;
    const width = this.contentWidth();
    const colW = width / 2 - 8;
    for (let i = 0; i < fields.length; i += 2) {
      this.ensure(16);
      const left = fields[i]!;
      const right = fields[i + 1];
      this.blank(left, this.margin, colW);
      if (right) this.blank(right, this.margin + width / 2, colW);
      this.cursor -= 16;
    }
    this.cursor -= 4;
  }

  private blank(field: FormField, x: number, width: number) {
    const label = `${field.label}: `;
    this.draw(false, 9, x, this.cursor, label);
    const labelW = this.measure(false, 9, label);
    const value = formatValue(field, this.input.header[field.key]);
    if (value) this.draw(false, 9, x + labelW, this.cursor, value);
    const lineStart = x + labelW;
    const lineEnd = x + width;
    this.ops.push(`${num(lineStart)} ${num(this.cursor - 2)} m ${num(lineEnd)} ${num(this.cursor - 2)} l S`);
  }

  private bodyText() {
    const body = this.input.definition.body;
    if (!body) return;
    const company = String(this.input.header.company ?? this.input.company ?? "").trim();
    const blocks: Array<{ heading?: string; text: string }> = [];
    if (body.en) blocks.push({ text: body.en });
    if (body.sw) blocks.push({ heading: "Kiswahili", text: body.sw });
    for (const [lang, text] of Object.entries(body)) {
      if (lang === "en" || lang === "sw") continue;
      blocks.push({ heading: lang, text });
    }
    const width = this.contentWidth();
    for (const block of blocks) {
      if (block.heading) {
        this.ensure(16);
        this.draw(true, 10, this.margin, this.cursor, block.heading);
        this.cursor -= 14;
      }
      const filled = company ? block.text.replaceAll("[Company]", company) : block.text;
      for (const paragraph of filled.split(/\n+/)) {
        const lines = this.wrap(false, 9, paragraph, width);
        for (const line of lines) {
          this.ensure(12);
          this.draw(false, 9, this.margin, this.cursor, line);
          this.cursor -= 12;
        }
        this.cursor -= 4;
      }
    }
    this.cursor -= 4;
  }

  private signaturePolicy(): boolean {
    const definition = this.input.definition;
    if (definition.layout !== "policy" || definition.fixedItems?.length) return false;
    return (
      definition.entryFields.length > 0 &&
      definition.entryFields.length <= 4 &&
      definition.entryFields.every((field) => field.type === "person" || field.type === "date" || field.type === "text" || field.type === "boolean")
    );
  }

  private policySigns() {
    const fields = this.input.definition.entryFields;
    const entries = this.input.entries.length ? this.input.entries : [{ data: {} }];
    for (const entry of entries) {
      this.ensure(18);
      let x = this.margin;
      const gap = 14;
      const each = (this.contentWidth() - gap * (fields.length - 1)) / fields.length;
      for (const field of fields) {
        const label = `${field.label.toUpperCase()}: `;
        this.draw(true, 8, x, this.cursor, label);
        const labelW = this.measure(true, 8, label);
        const value = formatValue(field, entry.data[field.key]);
        if (value) this.draw(false, 9, x + labelW, this.cursor, value);
        this.ops.push(
          `${num(x + labelW)} ${num(this.cursor - 2)} m ${num(x + each - 4)} ${num(this.cursor - 2)} l S`,
        );
        x += each + gap;
      }
      this.cursor -= 20;
    }
  }

  private table() {
    const cols = this.columns();
    if (!cols.length) return;
    const width = this.contentWidth();
    const weights = cols.reduce((sum, col) => sum + col.weight, 0);
    const widths = cols.map((col) => (width * col.weight) / weights);
    this.ensure(40);
    this.tableHeader = { widths, cols };
    this.columnHeader(widths, cols);
    let group = "";
    const rows = this.rows();
    rows.forEach((row, index) => {
      if (row.group && row.group !== group) {
        group = row.group;
        this.groupRow(group, width);
      }
      const cells = cols.map((col) => this.cell(col, row, index));
      this.dataRow(cells, widths);
    });
    this.tableHeader = null;
    this.cursor -= 8;
  }

  private columnHeader(widths: number[], cols: Column[]) {
    const size = 8;
    const lines = cols.map((col, index) => this.wrap(true, size, col.label.toUpperCase(), widths[index]! - 6));
    const height = Math.max(...lines.map((row) => row.length), 1) * 11 + 6;
    let x = this.margin;
    const top = this.cursor;
    cols.forEach((col, i) => {
      const w = widths[i]!;
      this.box(x, top, w, height, 0.9);
      this.lines(true, size, x + 3, top - 4, lines[i]!);
      x += w;
    });
    this.cursor -= height;
  }

  private groupRow(label: string, width: number) {
    const height = 16;
    this.ensure(height);
    this.box(this.margin, this.cursor, width, height, 0.94);
    this.draw(true, 8, this.margin + 3, this.cursor - 11, label.toUpperCase());
    this.cursor -= height;
  }

  private dataRow(cells: string[], widths: number[]) {
    const size = 8;
    const wrapped = cells.map((cell, i) => this.wrap(false, size, cell, widths[i]! - 6));
    const height = Math.max(...wrapped.map((row) => Math.max(row.length, 1)), 1) * 11 + 6;
    this.ensure(height);
    let x = this.margin;
    const top = this.cursor;
    cells.forEach((_, i) => {
      const w = widths[i]!;
      this.box(x, top, w, height, null);
      this.lines(false, size, x + 3, top - 4, wrapped[i]!);
      x += w;
    });
    this.cursor -= height;
  }

  private signoff() {
    const fields = this.input.definition.headerFields.filter(isSignoff);
    if (!fields.length) return;
    this.cursor -= 6;
    for (const field of fields) {
      this.ensure(18);
      const value = formatValue(field, this.input.header[field.key]);
      const label = `${field.label}: ${value}`.trimEnd();
      this.draw(false, 9, this.margin, this.cursor, label);
      const sign = "Sign:";
      const signX = this.margin + this.contentWidth() * 0.55;
      this.draw(false, 9, signX, this.cursor, sign);
      const signW = this.measure(false, 9, `${sign} `);
      this.ops.push(
        `${num(signX + signW)} ${num(this.cursor - 2)} m ${num(this.margin + this.contentWidth())} ${num(this.cursor - 2)} l S`,
      );
      this.cursor -= 18;
    }
  }

  private comments() {
    this.ensure(28);
    this.cursor -= 4;
    this.draw(false, 9, this.margin, this.cursor, "Comments:");
    this.cursor -= 14;
    this.ops.push(
      `${num(this.margin)} ${num(this.cursor)} m ${num(this.margin + this.contentWidth())} ${num(this.cursor)} l S`,
    );
    this.cursor -= 12;
  }

  private cell(col: Column, row: SheetRow, index: number): string {
    if (col.kind === "item") return row.label;
    if (col.kind === "no") return row.values && Object.keys(row.values).length ? String(index + 1) : "";
    return formatValue(col.field!, row.values[col.field!.key]);
  }

  private box(x: number, top: number, w: number, h: number, fill: number | null) {
    const y = top - h;
    if (fill !== null) this.ops.push(`${num(fill)} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f 0 g`);
    this.ops.push(`0.6 w 0 0 0 RG ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);
  }

  private rule(x: number, y: number, w: number) {
    this.ops.push(`0.8 w 0 0 0 RG ${num(x)} ${num(y)} m ${num(x + w)} ${num(y)} l S`);
  }

  private lines(bold: boolean, size: number, x: number, top: number, lines: string[]) {
    let y = top - size;
    for (const line of lines) {
      if (line) this.draw(bold, size, x, y, line);
      y -= 11;
    }
  }

  private draw(bold: boolean, size: number, x: number, baseline: number, text: string) {
    const hex = this.encodeText(bold, text);
    if (!hex) return;
    const font = bold ? "F2" : "F1";
    this.ops.push(`BT /${font} ${num(size)} Tf 0 0 0 rg 1 0 0 1 ${num(x)} ${num(baseline)} Tm <${hex}> Tj ET`);
  }

  private encodeText(bold: boolean, text: string): string {
    const face = bold ? this.bold : this.regular;
    const used = bold ? this.usedBold : this.usedRegular;
    const chars = bold ? this.boldChars : this.regularChars;
    const gids: number[] = [];
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      let gid = face.glyph(code);
      let stored = code;
      if (!gid && code !== 32) {
        gid = face.glyph(63);
        stored = 63;
      }
      if (!gid) continue;
      gids.push(gid);
      used.add(gid);
      chars.set(gid, stored);
    }
    return gids.map((gid) => gid.toString(16).padStart(4, "0")).join("");
  }

  private measure(bold: boolean, size: number, text: string): number {
    const face = bold ? this.bold : this.regular;
    let width = 0;
    for (const ch of text) {
      const code = ch.codePointAt(0)!;
      let gid = face.glyph(code);
      if (!gid && code !== 32) gid = face.glyph(63);
      if (!gid) continue;
      width += face.advance(gid);
    }
    return (width * size) / face.unitsPerEm;
  }

  private wrap(bold: boolean, size: number, text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        continue;
      }
      let line = "";
      const pushWord = (word: string) => {
        if (this.measure(bold, size, word) <= maxWidth) return word;
        let chunk = "";
        for (const ch of word) {
          const next = chunk + ch;
          if (chunk && this.measure(bold, size, next) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk = next;
        }
        return chunk;
      };
      for (const word of words) {
        const trial = line ? `${line} ${word}` : word;
        if (this.measure(bold, size, trial) <= maxWidth) {
          line = trial;
          continue;
        }
        if (line) lines.push(line);
        line = pushWord(word);
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [""];
  }

  private encode(): Uint8Array {
    const pageCount = this.pages.length;
    const labels = this.pages.map((_, index) => this.encodeText(false, `${index + 1} / ${pageCount}`));
    const objects: Uint8Array[] = new Array(12 + pageCount * 2);
    const regular = this.fontObjects(this.regular, this.usedRegular, this.regularChars, "DejaVuSans");
    const bold = this.fontObjects(this.bold, this.usedBold, this.boldChars, "DejaVuSans-Bold");
    objects[2] = regular.type0;
    objects[3] = regular.cid;
    objects[4] = regular.descriptor;
    objects[5] = regular.file;
    objects[6] = regular.toUnicode;
    objects[7] = bold.type0;
    objects[8] = bold.cid;
    objects[9] = bold.descriptor;
    objects[10] = bold.file;
    objects[11] = bold.toUnicode;

    const kids: string[] = [];
    this.pages.forEach((content, index) => {
      const pageId = 13 + index * 2;
      const contentId = pageId + 1;
      kids.push(`${pageId} 0 R`);
      const numbered = `${content}\nBT /F1 8 Tf 0 0 0 rg 1 0 0 1 ${num(this.pageW - this.margin - 36)} ${num(22)} Tm <${labels[index]}> Tj ET`;
      objects[pageId - 1] = ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.pageW)} ${num(this.pageH)}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 8 0 R >> >> >>`,
      );
      objects[contentId - 1] = stream(`<<`, numbered);
    });
    objects[1] = ascii(`<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>`);
    objects[0] = ascii(`<< /Type /Catalog /Pages 2 0 R >>`);
    return pack(objects);
  }

  private fontObjects(face: Face, used: Set<number>, chars: Map<number, number>, name: string) {
    const gids = [...used].sort((a, b) => a - b);
    const widths = gids.flatMap((gid) => [String(gid), `[${Math.round((face.advance(gid) * 1000) / face.unitsPerEm)}]`]);
    const bf: string[] = [];
    for (let i = 0; i < gids.length; i += 100) {
      const slice = gids.slice(i, i + 100);
      const lines = slice.map((gid) => {
        const code = chars.get(gid) ?? 63;
        return `<${gid.toString(16).padStart(4, "0")}> <${utf16(code)}>`;
      });
      bf.push(`${slice.length} beginbfchar\n${lines.join("\n")}\nendbfchar`);
    }
    const cmap = ` /CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${bf.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
    const fileId = name === "DejaVuSans" ? 6 : 11;
    const descriptorId = name === "DejaVuSans" ? 5 : 10;
    const cidId = name === "DejaVuSans" ? 4 : 9;
    const unicodeId = name === "DejaVuSans" ? 7 : 12;
    const [xMin, yMin, xMax, yMax] = face.bbox;
    return {
      type0: ascii(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${unicodeId} 0 R >>`,
      ),
      cid: ascii(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /CIDToGIDMap /Identity /DW 500 /W [${widths.join(" ")}] >>`,
      ),
      descriptor: ascii(
        `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${xMin} ${yMin} ${xMax} ${yMax}] /ItalicAngle 0 /Ascent ${face.ascent} /Descent ${face.descent} /CapHeight ${Math.round(face.ascent * 0.7)} /StemV 80 /FontFile2 ${fileId} 0 R >>`,
      ),
      file: stream(`<< /Length1 ${face.bytes.length}`, face.bytes),
      toUnicode: stream(`<<`, cmap),
    };
  }
}

function isSignoff(field: FormField): boolean {
  return field.type === "person" || /(^|_)(trainers?|signed)$/i.test(field.key);
}

function formatValue(field: FormField, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (field.type === "boolean") {
    if (raw === true || raw === "true") return "Yes";
    if (raw === false || raw === "false") return "No";
    return "";
  }
  if (field.type === "date") return formatDate(String(raw));
  if (field.type === "number") return field.unit ? `${raw} ${field.unit}` : String(raw);
  return String(raw);
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return value;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function utf16(code: number): string {
  if (code <= 0xffff) return code.toString(16).padStart(4, "0");
  const shifted = code - 0x10000;
  const high = 0xd800 + (shifted >> 10);
  const low = 0xdc00 + (shifted & 0x3ff);
  return `${high.toString(16).padStart(4, "0")}${low.toString(16).padStart(4, "0")}`;
}

function num(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function stream(dict: string, data: Uint8Array | string): Uint8Array {
  const raw = typeof data === "string" ? ascii(data) : data;
  const compressed = deflateSync(raw);
  return concat([
    ascii(`${dict} /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`),
    compressed,
    ascii("\nendstream"),
  ]);
}

function pack(objects: Uint8Array[]): Uint8Array {
  const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]);
  const pieces: Uint8Array[] = [header];
  const offsets: number[] = [0];
  let position = header.length;
  objects.forEach((body, index) => {
    offsets.push(position);
    const head = ascii(`${index + 1} 0 obj\n`);
    const tail = ascii("\nendobj\n");
    pieces.push(head, body, tail);
    position += head.length + body.length + tail.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  pieces.push(ascii(xref));
  return concat(pieces);
}
