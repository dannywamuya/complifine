/**
 * Turns an uploaded capture into something the extractor can read.
 * Images stay images. Spreadsheets and PDFs become text. Audio is transcribed
 * before it gets here.
 */

import { extractPdf } from "@complifine/ingestion";
import { Workbook, stringifyCell } from "@complifine/ingestion";
import type { NormalisedInput } from "./types.ts";

export async function normaliseCapture(mime: string, bytes: Uint8Array, filename: string): Promise<NormalisedInput> {
  if (mime.startsWith("image/")) return { images: [{ mime, bytes }] };
  if (mime === "text/csv" || filename.toLowerCase().endsWith(".csv")) {
    return { text: new TextDecoder().decode(bytes) };
  }
  if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const pdf = await extractPdf(bytes);
    return { text: pdf.fullText.slice(0, 20_000) };
  }
  if (mime.includes("spreadsheet") || filename.toLowerCase().endsWith(".xlsx")) {
    return { text: workbookText(bytes) };
  }
  return { text: new TextDecoder().decode(bytes).slice(0, 20_000) };
}

function workbookText(bytes: Uint8Array): string {
  const workbook = Workbook.fromBytes(bytes);
  const lines: string[] = [];
  for (const name of workbook.sheetNames) {
    const sheet = workbook.sheet(name);
    if (!sheet) continue;
    lines.push(`# ${name}`);
    for (const row of sheet.rows) {
      const cells = [...row.cells.values()]
        .sort((a, b) => a.column.localeCompare(b.column))
        .map((cell) => stringifyCell(cell.value))
        .filter(Boolean);
      if (cells.length) lines.push(cells.join("\t"));
    }
  }
  return lines.join("\n").slice(0, 20_000);
}
