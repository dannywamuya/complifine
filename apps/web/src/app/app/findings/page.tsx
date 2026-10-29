"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RequirementLink {
  id: string;
  criterion: string;
  level: string;
  principle: string;
}

interface FindingRow {
  id: string;
  description: string;
  severity: string;
  status: string;
  dueDate: string | null;
  requirement: RequirementLink | null;
}

export default function FindingsPage() {
  const { siteId, org } = useSite();
  const [rows, setRows] = useState<FindingRow[]>([]);
  const [requirements, setRequirements] = useState<RequirementLink[]>([]);
  const [description, setDescription] = useState("");
  const [requirementId, setRequirementId] = useState("none");
  const [query, setQuery] = useState("");
  const canClose = org?.role === "owner" || org?.role === "compliance_manager";
  const version = org?.scopes[0]?.code ?? "";

  useEffect(() => {
    if (!siteId) return;
    api<{ findings: FindingRow[] }>(`/findings?siteId=${siteId}`)
      .then((payload) => setRows(payload.findings))
      .catch(() => setRows([]));
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !version) return;
    api<{ requirements: RequirementLink[] }>(
      `/sites/${siteId}/requirements?versionCode=${encodeURIComponent(version)}`,
    )
      .then((payload) => setRequirements(payload.requirements))
      .catch(() => setRequirements([]));
  }, [siteId, version]);

  const choices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = needle
      ? requirements.filter(
          (row) =>
            row.criterion.toLowerCase().includes(needle) || row.principle.toLowerCase().includes(needle),
        )
      : requirements;
    const shown = matched.slice(0, 40);
    const selected = requirements.find((row) => row.id === requirementId);
    if (selected && !shown.some((row) => row.id === selected.id)) return [selected, ...shown];
    return shown;
  }, [requirements, query, requirementId]);

  async function add() {
    if (!siteId || !description.trim()) return;
    try {
      const created = await api<FindingRow>("/findings", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          description: description.trim(),
          ...(requirementId !== "none" ? { requirementVersionId: requirementId } : {}),
        }),
      });
      setRows((current) => [created, ...current]);
      setDescription("");
      setRequirementId("none");
      setQuery("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open the finding");
    }
  }

  async function close(id: string) {
    try {
      const updated = await api<FindingRow>(`/findings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      setRows((current) => current.map((row) => (row.id === id ? updated : row)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not close");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div id="tour-findings" className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-medium tracking-tight">Findings</h1>
        <p className="text-sm text-muted-foreground">
          Non-conformances and the requirement they failed. A viewer cannot close one.
        </p>
      </header>
      <div className="flex flex-col gap-2">
        <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was found" />
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a requirement, e.g. FV"
          />
          <Select value={requirementId} onValueChange={setRequirementId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Requirement not complied with" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No linked requirement</SelectItem>
              {choices.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.criterion}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => void add()}>
            Open
          </Button>
        </div>
      </div>
      </div>
      <ul className="divide-y rounded-2xl border">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1">
              {row.requirement ? (
                <Link
                  href={`/app/criteria/${encodeURIComponent(row.requirement.criterion)}`}
                  className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                >
                  {row.requirement.criterion}
                  <LevelBadge level={row.requirement.level} />
                </Link>
              ) : (
                <p className="text-xs text-muted-foreground">No linked requirement</p>
              )}
              {row.requirement?.principle ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">{row.requirement.principle}</p>
              ) : null}
              <p className="text-sm">{row.description}</p>
              <p className="text-xs text-muted-foreground">{row.severity}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{row.status}</Badge>
              {canClose && row.status !== "closed" ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void close(row.id)}>
                  Close
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-4 py-6 text-sm text-muted-foreground">No open findings.</li> : null}
      </ul>
    </div>
  );
}
