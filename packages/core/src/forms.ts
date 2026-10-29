/**
 * Form template definitions and the validators built from them.
 *
 * A template's `definition` is data, not code, so the same register can be
 * shipped in the library, varied per organisation, rendered by the web app,
 * and filled by the capture pipeline. Every one of those paths validates an
 * entry with `entrySchema`, which is why it lives here and not in the API: an
 * AI draft and a hand-typed row are held to exactly the same rules.
 */

import { z } from "zod";
import { FORM_CADENCE_VALID_DAYS, type FormCadence } from "./enums.ts";

export const FORM_FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "date",
  "time",
  "select",
  "boolean",
  "person",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/** How the record page lays out entries. */
export const FORM_LAYOUTS = ["table", "grid", "plan", "policy"] as const;
export type FormLayout = (typeof FORM_LAYOUTS)[number];

export interface FormField {
  readonly key: string;
  readonly label: string;
  readonly type: FormFieldType;
  readonly required?: boolean;
  /** Inline choices for a `select`. */
  readonly options?: readonly string[];
  /** Name of an entry in `optionLists`; organisation variants may replace the list. */
  readonly optionList?: string;
  /** Accept a value outside the list (stored as typed). Defaults to false. */
  readonly allowOther?: boolean;
  readonly unit?: string;
  readonly help?: string;
}

export interface FormFixedItem {
  readonly key: string;
  readonly label: string;
  readonly group?: string;
}

export interface FormDefinition {
  readonly layout: FormLayout;
  readonly headerFields: readonly FormField[];
  readonly entryFields: readonly FormField[];
  /**
   * Rows that exist before anyone writes: plan considerations, grid items,
   * checklist questions. When present, every entry names one in `item`.
   */
  readonly fixedItems?: readonly FormFixedItem[];
  readonly optionLists?: Readonly<Record<string, readonly string[]>>;
  /** Policy or rule text shown above acknowledgement rows. Keyed by language. */
  readonly body?: Readonly<Record<string, string>>;
}

/** Fields an organisation variant may change. Columns are never on this list. */
export interface FormVariantOverrides {
  readonly headerDefaults?: Readonly<Record<string, unknown>>;
  readonly optionLists?: Readonly<Record<string, readonly string[]>>;
  readonly fixedItems?: readonly FormFixedItem[];
  readonly body?: Readonly<Record<string, string>>;
}

export type FormValues = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Applies a variant's overrides to a library definition. */
export function mergeDefinition(base: FormDefinition, overrides?: FormVariantOverrides | null): FormDefinition {
  if (!overrides) return base;
  return {
    ...base,
    optionLists: { ...base.optionLists, ...overrides.optionLists },
    fixedItems: overrides.fixedItems ?? base.fixedItems,
    body: overrides.body ? { ...base.body, ...overrides.body } : base.body,
  };
}

export function fieldOptions(field: FormField, definition: FormDefinition): readonly string[] | null {
  if (field.options) return field.options;
  if (field.optionList) return definition.optionLists?.[field.optionList] ?? [];
  return null;
}

function fieldSchema(field: FormField, definition: FormDefinition): z.ZodType {
  let base: z.ZodType;
  switch (field.type) {
    case "number":
      base = z.number().finite();
      break;
    case "date":
      base = z.string().regex(DATE, "Use YYYY-MM-DD");
      break;
    case "time":
      base = z.string().regex(TIME, "Use HH:MM");
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "select": {
      const options = fieldOptions(field, definition) ?? [];
      base =
        field.allowOther || options.length === 0
          ? z.string().trim().min(1)
          : z.string().refine((value) => options.includes(value), {
              message: `Choose one of: ${options.slice(0, 8).join(", ")}${options.length > 8 ? "…" : ""}`,
            });
      break;
    }
    default:
      base = z.string().trim().min(1);
  }
  return field.required ? base : base.nullable().optional();
}

function objectSchema(fields: readonly FormField[], definition: FormDefinition) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) shape[field.key] = fieldSchema(field, definition);
  return shape;
}

/** Validator for one entry row. Unknown keys are rejected so nothing is stored that no column shows. */
export function entrySchema(definition: FormDefinition) {
  const shape = objectSchema(definition.entryFields, definition);
  if (definition.fixedItems?.length) {
    const keys = definition.fixedItems.map((item) => item.key);
    shape.item = z.string().refine((value) => keys.includes(value), { message: "Unknown row" });
  }
  return z.object(shape).strict();
}

export function headerSchema(definition: FormDefinition) {
  return z.object(objectSchema(definition.headerFields, definition)).strict();
}

/**
 * Coerces form input (strings from inputs, blanks) into the shape the
 * validator expects. Blank strings become null so an untouched optional field
 * is "not recorded", never the empty string.
 */
export function coerceValues(fields: readonly FormField[], values: FormValues, keepItem = false): FormValues {
  const out: FormValues = {};
  for (const field of fields) {
    const raw = values[field.key];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
      out[field.key] = null;
      continue;
    }
    if (field.type === "number" && typeof raw === "string") {
      const n = Number(raw.replace(/,/g, ""));
      out[field.key] = Number.isFinite(n) ? n : raw;
    } else if (field.type === "boolean" && typeof raw === "string") {
      out[field.key] = ["true", "yes", "1", "y", "ndio"].includes(raw.trim().toLowerCase());
    } else {
      out[field.key] = typeof raw === "string" ? raw.trim() : raw;
    }
  }
  if (keepItem && values.item !== undefined) out.item = values.item;
  return out;
}

export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

export function validateEntry(
  definition: FormDefinition,
  values: FormValues,
): { ok: true; data: FormValues } | { ok: false; issues: FieldIssue[] } {
  const coerced = coerceValues(definition.entryFields, values, Boolean(definition.fixedItems?.length));
  const parsed = entrySchema(definition).safeParse(coerced);
  if (parsed.success) return { ok: true, data: parsed.data as FormValues };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      field: String(issue.path[0] ?? ""),
      message: issue.message,
    })),
  };
}

export function validateHeader(
  definition: FormDefinition,
  values: FormValues,
): { ok: true; data: FormValues } | { ok: false; issues: FieldIssue[] } {
  const coerced = coerceValues(definition.headerFields, values);
  const parsed = headerSchema(definition).safeParse(coerced);
  if (parsed.success) return { ok: true, data: parsed.data as FormValues };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      field: String(issue.path[0] ?? ""),
      message: issue.message,
    })),
  };
}

/** When evidence produced by a record on this cadence stops being current. */
export function cadenceExpiry(cadence: FormCadence, validFrom: Date): Date | null {
  const days = FORM_CADENCE_VALID_DAYS[cadence];
  if (days === null) return null;
  return new Date(validFrom.getTime() + days * 24 * 60 * 60 * 1000);
}
