"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import { NOTIFICATIONS_CHANGED } from "@/components/notification-bell";
import { LevelBadge } from "@/components/level-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RESPONSES = ["not_assessed", "compliant", "partial", "non_compliant", "not_applicable"] as const;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "likely_non_compliant", label: "Likely non-compliant" },
  { id: "at_risk", label: "At risk" },
  { id: "insufficient_evidence", label: "Insufficient evidence" },
  { id: "unanswered", label: "Unanswered" },
] as const;

const EVIDENCE_LABELS: Record<string, string> = {
  present: "Evidence on file",
  stale: "Evidence out of date",
  expired: "Evidence expired",
  missing: "Evidence missing",
  unmapped: "Not in control library",
};

const VERDICT_LABELS: Record<string, string> = {
  likely_compliant: "Likely compliant",
  at_risk: "At risk",
  likely_non_compliant: "Likely non-compliant",
  not_applicable: "Not applicable",
  insufficient_evidence: "Insufficient evidence",
};

interface Citation {
  kind: string;
  id: string;
  label: string;
  href?: string | null;
}

interface RequirementRow {
  id: string;
  criterion: string;
  level: string;
  principle: string | null;
  section: string | null;
  response: string;
  evidenceStatus: string;
  verdict: string | null;
  auditItemId: string | null;
  rationale: string | null;
  recommendation: string | null;
  citedEvidence: Citation[];
  acceptedAt: string | null;
  openFindings: number;
  openFindingId: string | null;
}

interface Report {
  percent: number;
  applicableMusts: number;
  assessed: number;
  evidenceGaps: number;
  openFindings: number;
  overdueActions: number;
  unmapped: number;
  note: string;
}

interface AuditRun {
  id: string;
  status: string;
  progress: { done: number; total: number };
  summary: string | null;
  recommendations: Array<{ requirementVersionId: string; text: string; priority: number }> | null;
  counts: Record<string, number> | null;
  error: string | null;
  finishedAt: string | null;
}

interface Compliance {
  readiness: Report;
  assessment: { id: string; status: string } | null;
  run: AuditRun | null;
  requirements: RequirementRow[];
}

export default function ReadinessPage() {
  const { siteId, org } = useSite();
  const [version, setVersion] = useState("");
  const [data, setData] = useState<Compliance | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const canWrite = org?.role === "owner" || org?.role === "compliance_manager" || org?.role === "site_manager";

  useEffect(() => {
    setVersion((current) => current || org?.scopes[0]?.code || "");
  }, [org]);

  const load = useCallback(() => {
    if (!siteId || !version) return;
    api<Compliance>(`/sites/${siteId}/compliance?versionCode=${encodeURIComponent(version)}`)
      .then(setData)
      .catch(() => setData(null));
  }, [siteId, version]);

  useEffect(() => {
    load();
  }, [load]);

  const running = data?.run?.status === "running" || data?.run?.status === "queued";

  useEffect(() => {
    if (!running || !data?.run) return;
    const runId = data.run.id;
    const timer = setInterval(() => {
      api<{ run: AuditRun }>(`/audit-runs/${runId}`)
        .then((payload) => {
          if (payload.run.id !== runId) return;
          if (payload.run.status === "complete" || payload.run.status === "failed") {
            window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
            load();
            return;
          }
          setData((current) =>
            current?.run?.id === runId ? { ...current, run: { ...current.run, ...payload.run } } : current,
          );
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [running, data?.run?.id, load]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.requirements ?? []).filter((row) => {
      if (filter === "unanswered" && row.response !== "not_assessed") return false;
      if (filter !== "all" && filter !== "unanswered" && row.verdict !== filter) return false;
      if (!needle) return true;
      return (
        row.criterion.toLowerCase().includes(needle) || (row.principle ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, filter, query]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const bySection = new Map<string, RequirementRow[]>();
    for (const row of rows) {
      const section = row.section || "Other";
      if (!bySection.has(section)) order.push(section);
      const list = bySection.get(section) ?? [];
      list.push(row);
      bySection.set(section, list);
    }
    return order.map((section) => ({ section, rows: bySection.get(section)! }));
  }, [rows]);

  async function runAudit() {
    if (!siteId || !version) return;
    setBusy(true);
    try {
      await api(`/sites/${siteId}/audit-runs`, {
        method: "POST",
        body: JSON.stringify({ versionCode: version }),
      });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start the audit");
    } finally {
      setBusy(false);
    }
  }

  async function saveResponse(row: RequirementRow, response: string) {
    if (!siteId || !version) return;
    setData((current) =>
      current
        ? {
            ...current,
            requirements: current.requirements.map((item) => (item.id === row.id ? { ...item, response } : item)),
          }
        : current,
    );
    try {
      let assessmentId = data?.assessment?.status === "draft" ? data.assessment.id : null;
      if (!assessmentId) {
        const created = await api<{ id: string }>("/assessments", {
          method: "POST",
          body: JSON.stringify({ siteId, versionCode: version }),
        });
        assessmentId = created.id;
      }
      await api(`/assessments/${assessmentId}/items`, {
        method: "PATCH",
        body: JSON.stringify({ requirementVersionId: row.id, response }),
      });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
      load();
    }
  }

  async function accept(row: RequirementRow, response?: string) {
    if (!data?.run || !row.auditItemId) return;
    try {
      await api(`/audit-runs/${data.run.id}/items/${row.auditItemId}/accept`, {
        method: "POST",
        body: JSON.stringify(response ? { response } : {}),
      });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not accept");
    }
  }

  async function acceptBulk() {
    if (!data?.run) return;
    setConfirmBulk(false);
    try {
      const result = await api<{ accepted: number }>(`/audit-runs/${data.run.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ verdicts: ["likely_compliant", "not_applicable"] }),
      });
      toast.success(`Accepted ${result.accepted} verdicts into the self-assessment.`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not accept");
    }
  }

  async function openFinding(row: RequirementRow) {
    if (!data?.run || !row.auditItemId) return;
    try {
      await api(`/audit-runs/${data.run.id}/items/${row.auditItemId}/finding`, { method: "POST" });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not open the finding");
    }
  }

  async function complete() {
    if (!data?.assessment || data.assessment.status !== "draft") return;
    try {
      await api(`/assessments/${data.assessment.id}/complete`, { method: "POST" });
      toast.success("Assessment complete. Partial and non-compliant items are now findings.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not complete");
    }
  }

  const report = data?.readiness;
  const run = data?.run;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div id="tour-readiness" className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-medium tracking-tight">Readiness</h1>
        <p className="text-sm text-muted-foreground">
          How much of the applicable Must list is assessed, evidenced and free of open findings. This is not a certificate.
        </p>
      </header>
      {(org?.scopes.length ?? 0) > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={version} onValueChange={setVersion}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Edition" />
            </SelectTrigger>
            <SelectContent>
              {org?.scopes.map((scope) => (
                <SelectItem key={scope.code} value={scope.code}>
                  {scope.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {report ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="font-heading text-5xl font-medium tracking-tight">{report.percent}%</p>
            {canWrite ? (
              <Button type="button" disabled={!siteId || !version || running || busy} onClick={() => void runAudit()}>
                {running ? `Auditing ${run?.progress.done ?? 0} of ${run?.progress.total ?? 0}` : "Run Audit"}
              </Button>
            ) : null}
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>Applicable Musts: {report.applicableMusts}</li>
            <li>Assessed: {report.assessed}</li>
            <li>Evidence gaps: {report.evidenceGaps}</li>
            <li>Open findings: {report.openFindings}</li>
            <li>Overdue corrective actions: {report.overdueActions}</li>
            <li>Not in control library: {report.unmapped}</li>
          </ul>
          <p className="text-sm text-muted-foreground">{report.note}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Choose a site and an edition.</p>
      )}
      </div>
      {run ? (
        <section className="space-y-3 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-medium">AI auditor simulation. Not a certification audit.</h2>
            <Badge variant="secondary">{run.status}</Badge>
          </div>
          {run.status === "failed" ? <p className="text-sm text-destructive">{run.error}</p> : null}
          {run.summary ? <p className="whitespace-pre-wrap text-sm">{run.summary}</p> : null}
          {run.counts ? (
            <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {Object.entries(run.counts).map(([verdict, count]) => (
                <li key={verdict}>
                  {VERDICT_LABELS[verdict] ?? verdict}: {count}
                </li>
              ))}
            </ul>
          ) : null}
          {run.recommendations && run.recommendations.length > 0 ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {run.recommendations.slice(0, 8).map((item) => (
                <li key={`${item.requirementVersionId}-${item.priority}`}>{item.text}</li>
              ))}
            </ol>
          ) : null}
          {run.finishedAt ? (
            <p className="text-xs text-muted-foreground">Last run {new Date(run.finishedAt).toLocaleString()}</p>
          ) : null}
          {canWrite && run.status === "complete" ? (
            <Button type="button" variant="outline" onClick={() => setConfirmBulk(true)}>
              Accept all compliant and not-applicable verdicts
            </Button>
          ) : null}
        </section>
      ) : null}
      <div className="flex flex-col gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a requirement" />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={filter === item.id ? "default" : "outline"}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.section} className="space-y-2">
          <h2 className="text-sm font-medium">{group.section}</h2>
          <ul className="divide-y rounded-2xl border">
            {group.rows.map((row) => (
              <li key={row.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Link
                      href={`/app/criteria/${encodeURIComponent(row.criterion)}`}
                      className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
                    >
                      {row.criterion}
                      <LevelBadge level={row.level} />
                    </Link>
                    {row.principle ? <p className="line-clamp-2 text-xs text-muted-foreground">{row.principle}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{EVIDENCE_LABELS[row.evidenceStatus] ?? row.evidenceStatus}</Badge>
                      {row.verdict ? <Badge variant="secondary">{VERDICT_LABELS[row.verdict] ?? row.verdict}</Badge> : null}
                      {row.openFindingId ? (
                        <Link href="/app/findings" className="text-xs underline">
                          {row.openFindings} open finding{row.openFindings === 1 ? "" : "s"}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <Select
                    value={row.response}
                    onValueChange={(value) => void saveResponse(row, value)}
                    disabled={!canWrite || data?.assessment?.status === "complete"}
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESPONSES.map((response) => (
                        <SelectItem key={response} value={response}>
                          {response.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {row.verdict ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
                    >
                      {openId === row.id ? "Hide rationale" : "Rationale"}
                    </button>
                    {openId === row.id ? (
                      <div className="space-y-2 text-sm">
                        <p>{row.rationale}</p>
                        {row.recommendation ? <p className="text-muted-foreground">{row.recommendation}</p> : null}
                        {row.citedEvidence.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {row.citedEvidence.map((cite) => (
                              <li key={`${cite.kind}:${cite.id}`}>
                                {cite.href ? (
                                  <Link href={cite.href} className="underline">
                                    {cite.label}
                                  </Link>
                                ) : (
                                  cite.label
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                    {canWrite ? (
                      <div className="flex flex-wrap gap-2">
                        {row.verdict !== "insufficient_evidence" ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => void accept(row)}>
                            {row.acceptedAt ? "Accepted" : "Accept"}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="outline" onClick={() => void accept(row, "partial")}>
                            Accept as partial
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={() => void openFinding(row)}>
                          Open finding
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {canWrite && data?.assessment?.status === "draft" ? (
        <Button type="button" onClick={() => void complete()}>
          Complete assessment
        </Button>
      ) : null}
      <Dialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept these verdicts?</DialogTitle>
            <DialogDescription>
              Likely compliant and not applicable verdicts will be written into the self-assessment. You can change any answer afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmBulk(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void acceptBulk()}>
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
