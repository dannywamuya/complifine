export interface FormField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  optionList?: string;
  allowOther?: boolean;
  unit?: string;
  help?: string;
}

export interface FormFixedItem {
  key: string;
  label: string;
  group?: string;
}

export interface FormDefinition {
  layout: "table" | "grid" | "plan" | "policy";
  headerFields: FormField[];
  entryFields: FormField[];
  fixedItems?: FormFixedItem[];
  optionLists?: Record<string, string[]>;
  body?: Record<string, string>;
}

export interface FormTemplateRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  siteTypes: string[];
  cadence: string;
  version: number;
  sourceRef: string | null;
  docRef: string | null;
  approverRole: string | null;
  effectiveDate: string | null;
  definition: FormDefinition;
  headerDefaults: Record<string, unknown>;
  variantId: string | null;
  badge?: "overdue" | "due" | "current" | "none";
}

export interface FormEntry {
  id: string;
  recordedAt: string;
  data: Record<string, unknown>;
  extraction: Record<string, { confidence: number; source?: string }> | null;
}

export interface FormRecordDetail {
  id: string;
  siteId: string;
  templateId: string;
  title?: string;
  cadence?: string;
  status: string;
  origin: string;
  header: Record<string, unknown>;
  headerExtraction: Record<string, { confidence: number; source?: string }> | null;
  sourceDocumentId: string | null;
  freshness: string;
  definition: FormDefinition;
  headerDefaults: Record<string, unknown>;
  entries: FormEntry[];
  rejectionReason: string | null;
}

export interface FormRecordListItem {
  id: string;
  templateId: string;
  title: string;
  cadence: string;
  category: string;
  status: string;
  badge: "draft" | "overdue" | "due" | "current" | "none";
  freshness: string;
  submittedAt: string | null;
  createdAt: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  policy: "Policies and declarations",
  plan: "Plans and risk assessments",
  register: "Registers",
  checklist: "Inspections and checklists",
  finding: "Findings, complaints and recall",
};

export const CADENCE_LABELS: Record<string, string> = {
  once: "Once a year",
  per_event: "When it happens",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Yearly",
};

export function fieldOptions(field: FormField, definition: FormDefinition): string[] {
  if (field.options?.length) return [...field.options];
  if (field.optionList) return definition.optionLists?.[field.optionList] ?? [];
  return [];
}
