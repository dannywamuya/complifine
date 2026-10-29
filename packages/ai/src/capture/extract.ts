/**
 * Fills a template from normalised text or a photo.
 *
 * The model proposes values with a confidence and a source snippet. This
 * module then runs the same validator a typed row uses. A date that is not a
 * date, or a pest name that is not on the list, is blanked — the raw text
 * stays on `source` so the reviewer can see what was read.
 */

import { z } from "zod";
import {
  coerceValues,
  fieldOptions,
  validateEntry,
  validateHeader,
  type FormDefinition,
  type FormField,
  type FormValues,
} from "@complifine/core";
import type { CaptureGenerator, NormalisedInput } from "./types.ts";

const proposedField = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  source: z.string().nullable(),
});

export function extractionSchema(definition: FormDefinition) {
  return z.object({
    header: z.array(proposedField),
    entries: z.array(
      z.object({
        item: z.string().nullable(),
        fields: z.array(proposedField),
      }),
    ),
  });
}

export interface FieldMark {
  readonly confidence: number;
  readonly source?: string;
}

export interface ExtractedDraft {
  readonly header: FormValues;
  readonly headerExtraction: Record<string, FieldMark>;
  readonly entries: readonly {
    readonly data: FormValues;
    readonly extraction: Record<string, FieldMark>;
  }[];
}

interface Proposed {
  readonly key: string;
  readonly value: string | number | boolean | null;
  readonly confidence: number;
  readonly source: string | null;
}

export async function extractDraft(
  definition: FormDefinition,
  input: NormalisedInput,
  generate: CaptureGenerator,
): Promise<ExtractedDraft> {
  const keys = [
    ...definition.headerFields.map((field) => field.key),
    ...definition.entryFields.map((field) => field.key),
    ...(definition.fixedItems?.length ? ["item"] : []),
  ];
  const raw = await generate({
    instructions:
      "Fill this record from the source. Use only the field keys listed. " +
      "confidence is 0 to 1. source is the short snippet you read. " +
      "Leave value null when the source does not say. Never invent a date or a name. " +
      `Field keys: ${keys.join(", ")}.`,
    schema: extractionSchema(definition),
    text: input.text,
    images: input.images,
  });
  return interpretExtraction(definition, raw);
}

/** Applies template rules to a model's object. Invalid values become null. */
export function interpretExtraction(definition: FormDefinition, raw: unknown): ExtractedDraft {
  const parsed = extractionSchema(definition).safeParse(raw);
  if (!parsed.success) {
    return { header: {}, headerExtraction: {}, entries: [] };
  }

  const headerProposed = align(definition.headerFields, parsed.data.header, definition);
  const header = settle(definition, headerProposed.values, headerProposed.marks, "header");

  const entries = parsed.data.entries.map((entry) => {
    const aligned = align(definition.entryFields, entry.fields, definition);
    if (definition.fixedItems?.length) {
      const item = matchFixed(entry.item, definition);
      aligned.values.item = item.value;
      if (item.source || item.value === null) {
        aligned.marks.item = { confidence: item.confidence, ...(item.source ? { source: item.source } : {}) };
      } else if (item.value) {
        aligned.marks.item = { confidence: item.confidence };
      }
    }
    return settle(definition, aligned.values, aligned.marks, "entry");
  });

  return {
    header: header.data,
    headerExtraction: header.extraction,
    entries: entries.filter((entry) =>
      Object.values(entry.data).some((value) => value !== null && value !== undefined && value !== ""),
    ),
  };
}

/**
 * Keeps values that pass the template schema. A value that does not is stored
 * as null with confidence 0, so a draft can be incomplete and a person can
 * fill the gap. Confirm runs the schema again and refuses until it passes.
 */
function settle(
  definition: FormDefinition,
  values: FormValues,
  marks: Record<string, FieldMark>,
  kind: "header" | "entry",
): { data: FormValues; extraction: Record<string, FieldMark> } {
  const check = kind === "header" ? validateHeader(definition, values) : validateEntry(definition, values);
  if (check.ok) return { data: check.data, extraction: marks };
  const blanked = { ...values };
  const extraction = { ...marks };
  for (const issue of check.issues) {
    blanked[issue.field] = null;
    const existing = extraction[issue.field];
    extraction[issue.field] = { confidence: 0, ...(existing?.source ? { source: existing.source } : {}) };
  }
  const retry = kind === "header" ? validateHeader(definition, blanked) : validateEntry(definition, blanked);
  if (retry.ok) return { data: retry.data, extraction };
  const fields = kind === "header" ? definition.headerFields : definition.entryFields;
  return { data: coerceValues(fields, blanked, kind === "entry" && Boolean(definition.fixedItems?.length)), extraction };
}

function align(fields: readonly FormField[], proposed: readonly Proposed[], definition: FormDefinition) {
  const values: FormValues = {};
  const marks: Record<string, FieldMark> = {};
  const byKey = new Map(proposed.map((field) => [field.key, field]));
  for (const field of fields) {
    const found = byKey.get(field.key);
    if (!found || found.value === null || found.value === "") continue;
    const resolved = resolveValue(field, found.value, definition);
    values[field.key] = resolved.value;
    if (resolved.value !== null) {
      marks[field.key] = {
        confidence: clamp(found.confidence),
        ...(found.source ? { source: found.source } : {}),
      };
    } else if (found.source || typeof found.value === "string") {
      marks[field.key] = {
        confidence: 0,
        source: found.source ?? String(found.value),
      };
    }
  }
  return { values, marks };
}

function resolveValue(field: FormField, value: string | number | boolean, definition: FormDefinition): { value: unknown } {
  if (field.type === "select") {
    const options = fieldOptions(field, definition) ?? [];
    if (typeof value !== "string") return { value: null };
    if (options.length === 0 || field.allowOther) return { value };
    const match = matchOption(value, options);
    return { value: match };
  }
  if (field.type === "date") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value: null };
    return { value };
  }
  if (field.type === "time") {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return { value: null };
    return { value };
  }
  if (field.type === "number") {
    const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
    return { value: Number.isFinite(n) ? n : null };
  }
  if (field.type === "boolean") {
    if (typeof value === "boolean") return { value };
    if (typeof value === "string") {
      return { value: ["true", "yes", "1", "y", "ndio"].includes(value.trim().toLowerCase()) };
    }
    return { value: null };
  }
  return { value: typeof value === "string" ? value.trim() : String(value) };
}

function matchOption(value: string, options: readonly string[]): string | null {
  const needle = value.trim().toLowerCase();
  const exact = options.find((option) => option.toLowerCase() === needle);
  if (exact) return exact;
  const fuzzy = options.find((option) => {
    const hay = option.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  });
  return fuzzy ?? null;
}

function matchFixed(item: string | null, definition: FormDefinition): { value: string | null; confidence: number; source?: string } {
  if (!item) return { value: null, confidence: 0 };
  const items = definition.fixedItems ?? [];
  const exact = items.find((row) => row.key === item || row.label.toLowerCase() === item.toLowerCase());
  if (exact) return { value: exact.key, confidence: 0.9 };
  const fuzzy = items.find(
    (row) => row.label.toLowerCase().includes(item.toLowerCase()) || item.toLowerCase().includes(row.label.toLowerCase()),
  );
  if (fuzzy) return { value: fuzzy.key, confidence: 0.6, source: item };
  return { value: null, confidence: 0, source: item };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
