"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import {
  CADENCE_LABELS,
  CATEGORY_LABELS,
  fieldOptions,
  type FormDefinition,
  type FormField,
  type FormFixedItem,
  type FormTemplateRow,
} from "@/lib/records";
import { RecordField } from "@/components/record-editor";
import { requirementCodes, RequirementList, requirementsByTemplate, type RequirementRef } from "@/components/requirements";
import { ListPager, pageOf } from "@/components/list-pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewRecordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <NewRecord />
    </Suspense>
  );
}

function NewRecord() {
  const router = useRouter();
  const search = useSearchParams();
  const { site, choose, org } = useSite();
  const [templates, setTemplates] = useState<FormTemplateRow[]>([]);
  const [requirements, setRequirements] = useState<Map<string, RequirementRef[]> | null>(null);
  const [version, setVersion] = useState("");
  const [picked, setPicked] = useState<FormTemplateRow | null>(null);

  useEffect(() => {
    const siteParam = search.get("site");
    if (siteParam) choose(siteParam);
  }, [search, choose]);

  useEffect(() => {
    const code = org?.scopes[0]?.code ?? "";
    setVersion((current) => current || code);
  }, [org]);

  useEffect(() => {
    if (!site) return;
    api<{ templates: FormTemplateRow[] }>(`/form-templates?siteType=${site.siteType}&siteId=${site.id}`)
      .then((payload) => {
        setTemplates(payload.templates);
        const preset = search.get("template");
        if (preset) setPicked(payload.templates.find((row) => row.id === preset) ?? null);
      })
      .catch(() => setTemplates([]));
  }, [site, search]);

  useEffect(() => {
    if (!site || !version) return;
    api<{ rows: Array<{ criterion?: string; level?: string; controlTitle?: string; templateId?: string | null }> }>(
      `/sites/${site.id}/evidence-gap?versionCode=${encodeURIComponent(version)}`,
    )
      .then((payload) => setRequirements(requirementsByTemplate(payload.rows)))
      .catch(() => setRequirements(new Map()));
  }, [site, version]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="space-y-2">
        <Link href="/app/records" className="text-xs text-muted-foreground hover:underline">
          Records
        </Link>
        <h1 className="font-heading text-3xl font-medium tracking-tight">New record</h1>
        <p className="text-sm text-muted-foreground">
          {picked ? "This record applies to the requirements below." : "Choose what you are recording."}
        </p>
      </header>
      {!site ? <p className="text-sm text-muted-foreground">Add a site under Company first.</p> : null}
      {site && !picked ? (
        <KindStep templates={templates} requirements={requirements} onPick={setPicked} />
      ) : null}
      {site && picked ? (
        <FillStep
          template={picked}
          requirements={requirements ? (requirements.get(picked.id) ?? []) : null}
          siteId={site.id}
          onBack={() => setPicked(null)}
          onDone={(recordId) => router.push(`/app/records/${picked.id}/${recordId}`)}
        />
      ) : null}
    </div>
  );
}

const CATEGORY_RANK: Record<string, number> = {
  policy: 0,
  plan: 1,
  register: 2,
  checklist: 3,
  finding: 4,
};

const CADENCE_RANK: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  annual: 4,
  once: 5,
  per_event: 6,
};

const BADGE_RANK: Record<string, number> = { overdue: 0, due: 1, current: 2, none: 3 };

type KindSort = "title" | "category" | "cadence" | "urgency";

function KindStep({
  templates,
  requirements,
  onPick,
}: {
  templates: FormTemplateRow[];
  requirements: Map<string, RequirementRef[]> | null;
  onPick: (template: FormTemplateRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cadence, setCadence] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [sortKey, setSortKey] = useState<KindSort>("category");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const categories = useMemo(() => {
    const present = new Set(templates.map((template) => template.category));
    return Object.keys(CATEGORY_RANK).filter((key) => present.has(key));
  }, [templates]);

  const cadences = useMemo(() => {
    const present = new Set(templates.map((template) => template.cadence));
    return Object.keys(CADENCE_RANK).filter((key) => present.has(key));
  }, [templates]);

  const ordered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = templates.filter((template) => {
      const codes = requirements?.get(template.id)?.map((row) => row.criterion).join(" ") ?? "";
      if (needle && !template.title.toLowerCase().includes(needle) && !codes.toLowerCase().includes(needle)) return false;
      if (category !== "all" && template.category !== category) return false;
      if (cadence !== "all" && template.cadence !== cadence) return false;
      if (urgency !== "all" && (template.badge ?? "none") !== urgency) return false;
      return true;
    });
    const direction = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => direction * compareTemplates(a, b, sortKey) || a.title.localeCompare(b.title));
    return rows;
  }, [templates, requirements, query, category, cadence, urgency, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [query, category, cadence, urgency, sortKey, sortDir]);

  const view = pageOf(ordered, page);
  const grouped = sortKey === "category";
  const groups: Array<{ category: string; rows: FormTemplateRow[] }> = [];
  for (const template of view.rows) {
    const key = grouped ? template.category : "all";
    const last = groups[groups.length - 1];
    if (last?.category === key) last.rows.push(template);
    else groups.push({ category: key, rows: [template] });
  }

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search, e.g. toilet, spray, FV"
        className="col-span-2 h-8 sm:col-span-1"
      />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {categories.map((key) => (
            <SelectItem key={key} value={key}>
              {CATEGORY_LABELS[key] ?? key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={cadence} onValueChange={setCadence}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Frequency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All frequencies</SelectItem>
          {cadences.map((key) => (
            <SelectItem key={key} value={key}>
              {CADENCE_LABELS[key] ?? key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={urgency} onValueChange={setUrgency}>
        <SelectTrigger className="h-8 w-full">
          <SelectValue placeholder="Urgency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All urgencies</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="due">Due soon</SelectItem>
          <SelectItem value="current">Current</SelectItem>
          <SelectItem value="none">Not due</SelectItem>
        </SelectContent>
      </Select>
      <Select value={`${sortKey}:${sortDir}`} onValueChange={(value) => {
        const [column, dir] = value.split(":") as [KindSort, "asc" | "desc"];
        setSortKey(column);
        setSortDir(dir);
      }}>
        <SelectTrigger className="col-span-2 h-8 w-full sm:col-span-1">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="category:asc">Type</SelectItem>
          <SelectItem value="category:desc">Type, reversed</SelectItem>
          <SelectItem value="cadence:asc">Frequency, soonest</SelectItem>
          <SelectItem value="cadence:desc">Frequency, latest</SelectItem>
          <SelectItem value="urgency:asc">Most urgent</SelectItem>
          <SelectItem value="urgency:desc">Least urgent</SelectItem>
          <SelectItem value="title:asc">Record A–Z</SelectItem>
          <SelectItem value="title:desc">Record Z–A</SelectItem>
        </SelectContent>
      </Select>
    </div>
      {groups.map((group) => (
        <section key={group.category} className="space-y-2">
          {grouped ? <h2 className="text-sm font-medium">{CATEGORY_LABELS[group.category] ?? group.category}</h2> : null}
          <ul className="divide-y rounded-xl border">
            {group.rows.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => onPick(template)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span>
                    <span className="block text-sm font-medium">{template.title}</span>
                    <span className="block text-xs text-muted-foreground">{templateDetail(template, requirements, grouped)}</span>
                  </span>
                  {template.badge === "overdue" ? <Badge variant="destructive">Overdue</Badge> : null}
                  {template.badge === "due" ? <Badge variant="secondary">Due soon</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {ordered.length === 0 ? <p className="text-sm text-muted-foreground">No matching record.</p> : null}
      <ListPager page={view.page} pages={view.pages} total={view.total} start={view.start} onPage={setPage} />
    </div>
  );
}

function templateDetail(
  template: FormTemplateRow,
  requirements: Map<string, RequirementRef[]> | null,
  grouped: boolean,
): string {
  const cadence = CADENCE_LABELS[template.cadence] ?? template.cadence;
  const type = grouped ? "" : `${CATEGORY_LABELS[template.category] ?? template.category} · `;
  const codes = requirements ? requirementCodes(requirements.get(template.id) ?? []) : "";
  return codes ? `${type}${cadence} · ${codes}` : `${type}${cadence}`;
}

function compareTemplates(a: FormTemplateRow, b: FormTemplateRow, key: KindSort): number {
  const category = (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9);
  const cadence = (CADENCE_RANK[a.cadence] ?? 9) - (CADENCE_RANK[b.cadence] ?? 9);
  const urgency = (BADGE_RANK[a.badge ?? "none"] ?? 9) - (BADGE_RANK[b.badge ?? "none"] ?? 9);
  if (key === "title") return a.title.localeCompare(b.title);
  if (key === "cadence") return cadence || urgency || category;
  if (key === "urgency") return urgency || cadence || category;
  return category || cadence || urgency;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function seedValue(field: FormField, definition: FormDefinition): unknown {
  if (field.type === "date") return today();
  if (field.type === "boolean") return true;
  if (field.type === "select") {
    const options = fieldOptions(field, definition);
    return options.find((option) => option === "OK" || option === "Yes") ?? "";
  }
  return "";
}

function blankRow(definition: FormDefinition, item?: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (item) row.item = item;
  for (const field of definition.entryFields) row[field.key] = seedValue(field, definition);
  return row;
}

function FillStep({
  template,
  requirements,
  siteId,
  onBack,
  onDone,
}: {
  template: FormTemplateRow;
  requirements: RequirementRef[] | null;
  siteId: string;
  onBack: () => void;
  onDone: (recordId: string) => void;
}) {
  const definition = template.definition;
  const fixed = definition.fixedItems ?? [];
  const sharedKeys = fixed.length > 1
    ? definition.entryFields
        .filter((field) => field.type === "date" || field.type === "person" || field.key.endsWith("_by"))
        .map((field) => field.key)
    : [];
  const itemFields = definition.entryFields.filter((field) => !sharedKeys.includes(field.key));
  const [header, setHeader] = useState<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = { ...template.headerDefaults };
    for (const field of definition.headerFields) {
      if (next[field.key] === undefined || next[field.key] === null || next[field.key] === "") {
        next[field.key] = seedValue(field, definition);
      }
    }
    return next;
  });
  const [shared, setShared] = useState<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = {};
    for (const key of sharedKeys) {
      const field = definition.entryFields.find((row) => row.key === key);
      if (field) next[key] = seedValue(field, definition);
    }
    return next;
  });
  const [rows, setRows] = useState<Record<string, unknown>[]>(() =>
    fixed.length
      ? fixed.map((item) => blankRow(definition, item.key))
      : [blankRow(definition)],
  );
  const [busy, setBusy] = useState(false);

  function setRow(index: number, key: string, value: unknown) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  async function save() {
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/form-records", {
        method: "POST",
        body: JSON.stringify({ siteId, templateId: template.id, header }),
      });
      try {
        const payload = rows.map((row) => ({ ...row, ...shared }));
        for (const data of payload) {
          await api(`/form-records/${created.id}/entries`, {
            method: "POST",
            body: JSON.stringify({ data }),
          });
        }
        await api(`/form-records/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "submitted", header }),
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Saved as a draft. Finish it on the next page.");
      }
      onDone(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the record");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{template.title}</h2>
          {template.description ? <p className="text-sm text-muted-foreground">{template.description}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Change
        </Button>
      </div>
      {requirements ? <RequirementList requirements={requirements} /> : null}

      {definition.body ? (
        <div className="max-h-40 overflow-y-auto rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {definition.body.en ?? Object.values(definition.body)[0]}
        </div>
      ) : null}

      <FieldGrid
        definition={definition}
        fields={[
          ...definition.headerFields.map((field) => ({
            field,
            value: header[field.key],
            onChange: (value: unknown) => setHeader((current) => ({ ...current, [field.key]: value })),
          })),
          ...definition.entryFields
            .filter((field) => sharedKeys.includes(field.key))
            .map((field) => ({
              field,
              value: shared[field.key],
              onChange: (value: unknown) => setShared((current) => ({ ...current, [field.key]: value })),
            })),
        ]}
      />

      {fixed.length > 0 ? (
        <Checklist
          definition={definition}
          items={fixed}
          fields={itemFields}
          rows={rows}
          onChange={setRow}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="rounded-xl border p-4">
              <FieldGrid
                definition={definition}
                fields={definition.entryFields.map((field) => ({
                  field,
                  value: row[field.key],
                  onChange: (value: unknown) => setRow(index, field.key, value),
                }))}
              />
              {rows.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove row
                </Button>
              ) : null}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setRows((current) => [...current, blankRow(definition)])}>
            Add another row
          </Button>
        </div>
      )}

      <Button type="button" disabled={busy} onClick={() => void save()}>
        Save record
      </Button>
    </div>
  );
}

function fieldClass(field: FormField, single: boolean): string {
  if (!single && field.type === "longtext") return "space-y-1.5 sm:col-span-2";
  return "space-y-1.5";
}

function FieldGrid({
  definition,
  fields,
}: {
  definition: FormDefinition;
  fields: Array<{ field: FormField; value: unknown; onChange: (value: unknown) => void }>;
}) {
  if (fields.length === 0) return null;
  const single = fields.length === 1;
  return (
    <div className={single ? "grid gap-x-4 gap-y-3" : "grid gap-x-4 gap-y-3 sm:grid-cols-2"}>
      {fields.map(({ field, value, onChange }) => (
        <Field
          key={field.key}
          field={field}
          definition={definition}
          value={value}
          onChange={onChange}
          className={fieldClass(field, single)}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  definition,
  value,
  onChange,
  className,
}: {
  field: FormField;
  definition: FormDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  className?: string;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label>
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
        {field.required ? " *" : ""}
      </Label>
      <RecordField bare field={field} definition={definition} value={value} onChange={onChange} />
      {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
    </div>
  );
}

function Checklist({
  definition,
  items,
  fields,
  rows,
  onChange,
}: {
  definition: FormDefinition;
  items: FormFixedItem[];
  fields: FormField[];
  rows: Record<string, unknown>[];
  onChange: (index: number, key: string, value: unknown) => void;
}) {
  const columns =
    fields.length === 0
      ? "minmax(0,1fr)"
      : `minmax(12rem,1.5fr) repeat(${fields.length}, minmax(8.5rem,1fr))`;
  let previousGroup = "";

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="min-w-[36rem]">
        <div
          className="grid items-end gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground"
          style={{ gridTemplateColumns: columns }}
        >
          <span>Item</span>
          {fields.map((field) => (
            <span key={field.key}>
              {field.label}
              {field.unit ? ` (${field.unit})` : ""}
              {field.required ? " *" : ""}
            </span>
          ))}
        </div>
        {items.map((item, index) => {
          const group = item.group && item.group !== previousGroup ? item.group : null;
          if (item.group) previousGroup = item.group;
          return (
            <div key={item.key} className="border-b last:border-b-0">
              {group ? <div className="border-b bg-muted/20 px-4 py-2 text-xs font-medium">{group}</div> : null}
              <div className="grid items-center gap-3 px-4 py-2" style={{ gridTemplateColumns: columns }}>
                <span className="text-sm">{item.label}</span>
                {fields.map((field) => (
                  <RecordField
                    key={field.key}
                    bare
                    field={field}
                    definition={definition}
                    value={rows[index]?.[field.key]}
                    onChange={(value) => onChange(index, field.key, value)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
