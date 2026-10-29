"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { FormTemplateRow } from "@/lib/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Organisation variants may set header defaults, the document reference,
 * the approver, option lists and fixed rows. Columns stay with the library.
 */
export function VariantEditor() {
  const [templates, setTemplates] = useState<FormTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [docRef, setDocRef] = useState("");
  const [approverRole, setApproverRole] = useState("");
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [lists, setLists] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ templates: FormTemplateRow[] }>("/form-templates")
      .then((payload) => {
        setTemplates(payload.templates);
        setTemplateId((current) => current || payload.templates[0]?.id || "");
      })
      .catch(() => setTemplates([]));
  }, []);

  const template = templates.find((row) => row.id === templateId) ?? null;

  useEffect(() => {
    if (!template) return;
    setDocRef(template.docRef ?? "");
    setApproverRole(template.approverRole ?? "");
    const next: Record<string, string> = {};
    for (const field of template.definition.headerFields) {
      const value = template.headerDefaults[field.key];
      next[field.key] = value === null || value === undefined ? "" : String(value);
    }
    setDefaults(next);
    const optionText: Record<string, string> = {};
    for (const [name, values] of Object.entries(template.definition.optionLists ?? {})) {
      optionText[name] = values.join("\n");
    }
    setLists(optionText);
  }, [template]);

  async function save() {
    if (!template) return;
    setBusy(true);
    const optionLists = Object.fromEntries(
      Object.entries(lists).map(([name, text]) => [
        name,
        text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ]),
    );
    const headerDefaults = Object.fromEntries(
      Object.entries(defaults).filter(([, value]) => value.trim() !== ""),
    );
    const body = { docRef: docRef || null, approverRole: approverRole || null, headerDefaults, optionLists };
    try {
      const saved = template.variantId
        ? await api<FormTemplateRow>(`/form-templates/${template.variantId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await api<FormTemplateRow>(`/form-templates/${template.id}/variant`, {
            method: "POST",
            body: JSON.stringify(body),
          });
      setTemplates((current) => current.map((row) => (row.id === template.id ? { ...row, ...saved, id: template.id } : row)));
      toast.success("Saved for this company");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the variant");
    } finally {
      setBusy(false);
    }
  }

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No record templates are loaded yet.</p>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Set the document number, who approves it, and the lists this company uses. The columns of a record stay the same for every company.
      </p>
      <div className="space-y-1.5">
        <Label>Record</Label>
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Document reference</Label>
          <Input value={docRef} onChange={(event) => setDocRef(event.target.value)} placeholder="GG/FARM/REC08" />
        </div>
        <div className="space-y-1.5">
          <Label>Approved by</Label>
          <Input value={approverRole} onChange={(event) => setApproverRole(event.target.value)} placeholder="Farm manager" />
        </div>
      </div>
      {template && template.definition.headerFields.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Header defaults</p>
          {template.definition.headerFields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Input
                value={defaults[field.key] ?? ""}
                onChange={(event) => setDefaults((current) => ({ ...current, [field.key]: event.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : null}
      {Object.keys(lists).length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Option lists</p>
          {Object.entries(lists).map(([name, text]) => (
            <div key={name} className="space-y-1.5">
              <Label>{name}</Label>
              <Textarea value={text} rows={4} onChange={(event) => setLists((current) => ({ ...current, [name]: event.target.value }))} />
            </div>
          ))}
        </div>
      ) : null}
      <Button type="button" disabled={busy || !template} onClick={() => void save()}>
        Save variant
      </Button>
    </div>
  );
}
