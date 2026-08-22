/**
 * Parse a dropped SMETA 7.0 Workplace Requirements PDF.
 *
 * The official file is member-gated, so this parser is written against the
 * published structure of Annex 4 (ETI code area + Sedex additions, NC vs CAR)
 * rather than against a scraped rehost. When the operator drops the member
 * PDF, numbered items of the form `0.1`, `1.1`, `1.A.1`, `10.1` become
 * requirements. Items mentioning environment or business ethics are 4-pillar
 * only.
 */

import { normalizeWhitespace } from "@complifine/core";

export interface ParsedWorkplaceRequirement {
  readonly number: string;
  readonly title: string;
  readonly body: string;
  readonly level: "nc" | "car" | "msa";
  readonly pillar: "2-pillar" | "4-pillar";
  readonly etiParent: string | null;
  readonly startPage: number;
}

const WR_HEADING =
  /^((?:\d+[A-Z]?(?:\.[A-Z0-9]+){0,3}))\s+([A-Z].{8,200})$/;

const FOUR_PILLAR_HINT =
  /\b(environment|environmental|business ethics|bribery|corruption|greenhouse)\b/i;

const CAR_HINT = /\bcollaborative action required\b|\b\bCAR\b/i;
const MSA_HINT = /\bmanagement systems assessment\b|\b\bMSA\b/i;

function etiParent(number: string): string | null {
  const match = /^(\d+)/.exec(number);
  if (!match) return null;
  const n = match[1]!;
  if (n === "0" || Number(n) >= 10) return null;
  return n;
}

export function parseWorkplaceRequirements(
  pages: ReadonlyArray<{ number: number; text: string }>,
): ParsedWorkplaceRequirement[] {
  const lines: Array<{ text: string; page: number }> = [];
  for (const page of pages) {
    for (const raw of page.text.split(/\n+/)) {
      const text = normalizeWhitespace(raw);
      if (text) lines.push({ text, page: page.number });
    }
  }

  const items: ParsedWorkplaceRequirement[] = [];
  let current: ParsedWorkplaceRequirement | null = null;

  const flush = (): void => {
    if (current) items.push(current);
    current = null;
  };

  for (const line of lines) {
    const match = WR_HEADING.exec(line.text);
    if (match) {
      flush();
      const number = match[1]!;
      const title = match[2]!;
      current = {
        number,
        title,
        body: title,
        level: CAR_HINT.test(title) ? "car" : MSA_HINT.test(title) ? "msa" : "nc",
        pillar: FOUR_PILLAR_HINT.test(title) ? "4-pillar" : "2-pillar",
        etiParent: etiParent(number),
        startPage: line.page,
      };
      continue;
    }
    if (current) {
      current = {
        ...current,
        body: `${current.body}\n${line.text}`.trim(),
        level: CAR_HINT.test(line.text) ? "car" : current.level,
        pillar: FOUR_PILLAR_HINT.test(line.text) ? "4-pillar" : current.pillar,
      };
    }
  }
  flush();

  return items;
}

export function workplaceStableKey(number: string): string {
  return `smeta-wr:${number}`;
}

export function workplaceSortKey(number: string): number {
  const parts = number.replace(/[A-Z]/g, "").split(".").map((p) => Number.parseInt(p, 10) || 0);
  return (parts[0] ?? 0) * 10_000 + (parts[1] ?? 0) * 100 + (parts[2] ?? 0);
}
