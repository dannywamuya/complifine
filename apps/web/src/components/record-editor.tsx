"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { fieldOptions, type FormDefinition, type FormEntry, type FormField, type FormRecordDetail } from "@/lib/records";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function shade(confidence: number | undefined): string {
  if (confidence === undefined) return "";
  if (confidence < 0.75) return "bg-amber-100 dark:bg-amber-950/40";
  return "";
}

function lowConfidence(record: FormRecordDetail): string[] {
  const items: string[] = [];
  for (const [key, mark] of Object.entries(record.headerExtraction ?? {})) {
    if (mark.confidence < 0.75) items.push(`Header ${key}${mark.source ? `: ${mark.source}` : ""}`);
  }
  record.entries.forEach((entry, index) => {
    for (const [key, mark] of Object.entries(entry.extraction ?? {})) {
      if (mark.confidence < 0.75) items.push(`Row ${index + 1} ${key}${mark.source ? `: ${mark.source}` : ""}`);
    }
  });
  return items;
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function RecordField({
  field,
  definition,
  value,
  onChange,
  bare = false,
}: {
  field: FormField;
  definition: FormDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Checklist cells already have a column heading, so the control stands alone. */
  bare?: boolean;
}) {
  const options = fieldOptions(field, definition);
  if (field.type === "boolean") {
    return (
      <label className="flex h-8 items-center gap-2 text-sm">
        <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
        {bare ? <span className="sr-only">{field.label}</span> : field.label}
      </label>
    );
  }
  if (field.type === "longtext") {
    return (
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
      />
    );
  }
  if (field.type === "select" && options.length > 0 && !field.allowOther) {
    return (
      <Select value={typeof value === "string" ? value : ""} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "time" ? "time" : "text";
  return (
    <Input
      className="w-full"
      type={inputType}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(event) => onChange(event.target.value)}
      list={options.length ? `list-${field.key}` : undefined}
    />
  );
}

export function RecordEditor({
  record,
  role,
  onChange,
}: {
  record: FormRecordDetail;
  role: string | null;
  onChange: (next: FormRecordDetail) => void;
}) {
  const locked = record.status === "verified" || record.status === "submitted";
  const canVerify = role === "owner" || role === "compliance_manager";
  const definition = record.definition;
  const [header, setHeader] = useState<Record<string, unknown>>(record.header ?? {});
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [showSourceImage, setShowSourceImage] = useState(true);

  const itemLabel = useMemo(() => {
    const map = new Map((definition.fixedItems ?? []).map((item) => [item.key, item.label]));
    return (key: string) => map.get(key) ?? key;
  }, [definition.fixedItems]);

  async function saveHeader() {
    setBusy(true);
    try {
      await api(`/form-records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ header }),
      });
      toast.success("Header saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the header");
    } finally {
      setBusy(false);
    }
  }

  async function addEntry() {
    setBusy(true);
    try {
      const created = await api<FormEntry>(`/form-records/${record.id}/entries`, {
        method: "POST",
        body: JSON.stringify({ data: draft }),
      });
      onChange({ ...record, entries: [...record.entries, created] });
      setDraft({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That row is not valid");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(entryId: string) {
    await api(`/form-records/${record.id}/entries/${entryId}`, { method: "DELETE" });
    onChange({ ...record, entries: record.entries.filter((entry) => entry.id !== entryId) });
  }

  async function confirmCapture() {
    setBusy(true);
    try {
      const next = await api<FormRecordDetail>(`/form-records/${record.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ header }),
      });
      onChange({ ...record, ...next, definition, entries: record.entries });
      toast.success("Confirmed. This now counts as evidence.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not confirm the draft");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    try {
      await api(`/form-records/${record.id}`, { method: "DELETE" });
      toast.success("Draft discarded. The source file is still on file.");
      window.location.href = "/app/records";
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not discard the draft");
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    setBusy(true);
    try {
      const next = await api<FormRecordDetail>(`/form-records/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onChange({ ...record, ...next, definition, entries: record.entries });
      toast.success(status === "submitted" ? "Submitted. This now counts as evidence." : "Updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the record");
    } finally {
      setBusy(false);
    }
  }

  const columns = definition.entryFields.filter((field) => field.key !== "item");
  const checks = lowConfidence(record);
  const sourceHref = record.sourceDocumentId ? `/api/documents/${record.sourceDocumentId}/file` : null;

  return (
    <div className="space-y-8">
      {checks.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          <p className="font-medium">Check these</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {checks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {sourceHref ? (
        <div className="space-y-2">
          <a href={sourceHref} target="_blank" rel="noreferrer" className="text-sm underline">
            Open the source
          </a>
          {/* Photos of paper registers are the common case; other types fall back to the link. */}
          {showSourceImage ? (
            <img
              src={sourceHref}
              alt=""
              className="max-h-72 rounded-xl border object-contain"
              onError={() => setShowSourceImage(false)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{record.status}</Badge>
        {record.freshness === "stale" ? <Badge variant="destructive">Out of date</Badge> : null}
        {record.origin === "capture" ? <Badge variant="outline">From capture</Badge> : null}
      </div>

      {definition.body ? (
        <div className="space-y-4 rounded-2xl border bg-muted/40 p-4 text-sm leading-relaxed">
          {Object.entries(definition.body).map(([lang, text]) => (
            <div key={lang}>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{lang}</p>
              <p className="whitespace-pre-wrap">{text}</p>
            </div>
          ))}
        </div>
      ) : null}

      {definition.headerFields.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Record header</h2>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {definition.headerFields.map((field) => (
              <div key={field.key} className={field.type === "longtext" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                <Label>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <RecordField
                  bare
                  field={field}
                  definition={definition}
                  value={header[field.key]}
                  onChange={(value) => setHeader((current) => ({ ...current, [field.key]: value }))}
                />
                {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
              </div>
            ))}
          </div>
          {locked ? null : (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveHeader()}>
              Save header
            </Button>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">{definition.layout === "policy" ? "Acknowledgements" : "Rows"}</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                {definition.fixedItems?.length ? <th className="px-3 py-2 font-medium">Item</th> : null}
                {columns.map((field) => (
                  <th key={field.key} className="px-3 py-2 font-medium">
                    {field.label}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {record.entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  {definition.fixedItems?.length ? (
                    <td className="px-3 py-2">{itemLabel(String(entry.data.item ?? ""))}</td>
                  ) : null}
                  {columns.map((field) => (
                    <td
                      key={field.key}
                      className={`px-3 py-2 ${shade(entry.extraction?.[field.key]?.confidence)}`}
                      title={entry.extraction?.[field.key]?.source}
                    >
                      {display(entry.data[field.key])}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {locked ? null : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => void removeEntry(entry.id)}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {record.entries.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={columns.length + 2}>
                    No rows yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {locked ? null : (
          <div className="grid gap-x-4 gap-y-3 rounded-2xl border p-4 sm:grid-cols-2">
            {definition.fixedItems?.length ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Item</Label>
                <Select value={typeof draft.item === "string" ? draft.item : ""} onValueChange={(value) => setDraft((current) => ({ ...current, item: value }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a row" />
                  </SelectTrigger>
                  <SelectContent>
                    {definition.fixedItems.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.group ? `${item.group} — ${item.label}` : item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {columns.map((field) => (
              <div key={field.key} className={field.type === "longtext" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                <Label>
                  {field.label}
                  {field.unit ? ` (${field.unit})` : ""}
                  {field.required ? " *" : ""}
                </Label>
                <RecordField
                  bare
                  field={field}
                  definition={definition}
                  value={draft[field.key]}
                  onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Button type="button" disabled={busy} onClick={() => void addEntry()}>
                Add row
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {record.status === "draft" || record.status === "rejected" ? (
          record.origin === "capture" ? (
            <>
              <Button type="button" disabled={busy} onClick={() => void confirmCapture()}>
                Confirm
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void discard()}>
                Discard
              </Button>
            </>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void setStatus("submitted")}>
              Submit
            </Button>
          )
        ) : null}
        {record.status === "submitted" && canVerify ? (
          <>
            <Button type="button" disabled={busy} onClick={() => void setStatus("verified")}>
              Verify
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void setStatus("rejected")}>
              Send back
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
