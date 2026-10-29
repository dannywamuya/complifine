"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import { ListPager, pageOf } from "@/components/list-pager";
import { requirementCodes, RequirementList, type RequirementRef } from "@/components/requirements";
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

interface GapRow {
  status: string;
  criterion?: string;
  level?: string;
  controlTitle?: string;
  evidenceTypeId?: string;
  evidenceTypeTitle?: string;
  templateId?: string | null;
}

interface EvidenceKind {
  id: string;
  title: string;
  status: "missing" | "expired" | "present";
  requirements: RequirementRef[];
}

const STATUS_RANK: Record<EvidenceKind["status"], number> = { missing: 0, expired: 1, present: 2 };

const STATUS_LABEL: Record<EvidenceKind["status"], string> = {
  missing: "Missing",
  expired: "Overdue",
  present: "On file",
};

export default function AddEvidencePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AddEvidence />
    </Suspense>
  );
}

function AddEvidence() {
  const router = useRouter();
  const search = useSearchParams();
  const { site, org } = useSite();
  const [version, setVersion] = useState("");
  const [kinds, setKinds] = useState<EvidenceKind[]>([]);
  const [picked, setPicked] = useState<EvidenceKind | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const code = org?.scopes[0]?.code ?? "";
    setVersion((current) => current || code);
  }, [org]);

  useEffect(() => {
    if (!site || !version) return;
    setLoaded(false);
    api<{ rows: GapRow[] }>(`/sites/${site.id}/evidence-gap?versionCode=${encodeURIComponent(version)}`)
      .then((payload) => {
        const next = groupEvidence(payload.rows);
        setKinds(next);
        const preset = search.get("type");
        setPicked(preset ? (next.find((kind) => kind.id === preset) ?? null) : null);
      })
      .catch(() => {
        setKinds([]);
        setPicked(null);
      })
      .finally(() => setLoaded(true));
  }, [site, version, search]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="space-y-2">
        <Link href="/app/records" className="text-xs text-muted-foreground hover:underline">
          Records
        </Link>
        <h1 className="font-heading text-3xl font-medium tracking-tight">Add evidence</h1>
        <p className="text-sm text-muted-foreground">
          {picked ? "This file applies to the requirements below." : "Choose the file you are adding."}
        </p>
      </header>
      {(org?.scopes.length ?? 0) > 1 && !picked ? (
        <Select value={version} onValueChange={setVersion}>
          <SelectTrigger className="w-full sm:w-64">
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
      ) : null}
      {!site ? <p className="text-sm text-muted-foreground">Add a site under Company first.</p> : null}
      {site && !loaded ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {site && loaded && !picked ? <KindStep kinds={kinds} onPick={setPicked} /> : null}
      {site && picked ? (
        <FileStep
          kind={picked}
          siteId={site.id}
          onBack={() => {
            setPicked(null);
            router.replace("/app/records/evidence");
          }}
          onDone={() => router.push("/app/records")}
        />
      ) : null}
    </div>
  );
}

type KindSort = "title" | "urgency";

function KindStep({ kinds, onPick }: { kinds: EvidenceKind[]; onPick: (kind: EvidenceKind) => void }) {
  const [query, setQuery] = useState("");
  const [urgency, setUrgency] = useState("all");
  const [sortKey, setSortKey] = useState<KindSort>("urgency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const ordered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = kinds.filter((kind) => {
      if (urgency !== "all" && kind.status !== urgency) return false;
      if (!needle) return true;
      const haystack = `${kind.title} ${kind.requirements.map((row) => row.criterion).join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
    const direction = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => direction * compareKinds(a, b, sortKey) || a.title.localeCompare(b.title));
    return rows;
  }, [kinds, query, urgency, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [query, urgency, sortKey, sortDir]);

  const view = pageOf(ordered, page);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search, e.g. water, invoice, FV"
          className="col-span-2 h-8 sm:col-span-1"
        />
        <Select value={urgency} onValueChange={setUrgency}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Urgency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All urgencies</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
            <SelectItem value="expired">Overdue</SelectItem>
            <SelectItem value="present">On file</SelectItem>
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
            <SelectItem value="urgency:asc">Most urgent</SelectItem>
            <SelectItem value="urgency:desc">Least urgent</SelectItem>
            <SelectItem value="title:asc">Evidence A–Z</SelectItem>
            <SelectItem value="title:desc">Evidence Z–A</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {view.rows.length > 0 ? (
        <ul className="divide-y rounded-xl border">
          {view.rows.map((kind) => (
            <li key={kind.id}>
              <button
                type="button"
                onClick={() => onPick(kind)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{kind.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {requirementCodes(kind.requirements) || "No linked requirement"}
                  </span>
                </span>
                {kind.status === "present" ? null : (
                  <Badge variant={kind.status === "missing" || kind.status === "expired" ? "destructive" : "secondary"}>
                    {STATUS_LABEL[kind.status]}
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {kinds.length === 0 ? "Nothing to file here. Forms are added with New record." : "No matching evidence."}
        </p>
      )}
      <ListPager page={view.page} pages={view.pages} total={view.total} start={view.start} onPage={setPage} />
    </div>
  );
}

function FileStep({
  kind,
  siteId,
  onBack,
  onDone,
}: {
  kind: EvidenceKind;
  siteId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("siteId", siteId);
      body.set("file", file);
      const document = await api<{ id: string }>("/documents", { method: "POST", body });
      await api("/evidence", {
        method: "POST",
        body: JSON.stringify({ siteId, evidenceTypeId: kind.id, documentId: document.id }),
      });
      toast.success("Evidence filed");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not file that evidence");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{kind.title}</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Change
        </Button>
      </div>
      <RequirementList requirements={kind.requirements} />
      <div className="space-y-1.5">
        <Label htmlFor="evidence-file">File</Label>
        <Input id="evidence-file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </div>
      <Button type="button" disabled={busy || !file} onClick={() => void save()}>
        {busy ? "Filing…" : "File evidence"}
      </Button>
    </div>
  );
}

function compareKinds(a: EvidenceKind, b: EvidenceKind, key: KindSort): number {
  if (key === "title") return a.title.localeCompare(b.title);
  return STATUS_RANK[a.status] - STATUS_RANK[b.status];
}

function groupEvidence(rows: GapRow[]): EvidenceKind[] {
  const grouped = new Map<string, EvidenceKind>();
  for (const row of rows) {
    if (!row.evidenceTypeId || row.templateId) continue;
    if (row.status !== "missing" && row.status !== "expired" && row.status !== "present") continue;
    const status = row.status;
    let kind = grouped.get(row.evidenceTypeId);
    if (!kind) {
      kind = {
        id: row.evidenceTypeId,
        title: row.evidenceTypeTitle ?? "Evidence",
        status,
        requirements: [],
      };
      grouped.set(row.evidenceTypeId, kind);
    } else if (STATUS_RANK[status] < STATUS_RANK[kind.status]) {
      kind.status = status;
    }
    if (!row.criterion) continue;
    const known = kind.requirements.some(
      (item) => item.criterion === row.criterion && item.controlTitle === row.controlTitle,
    );
    if (!known) {
      kind.requirements.push({
        criterion: row.criterion,
        level: row.level,
        controlTitle: row.controlTitle,
      });
    }
  }
  for (const kind of grouped.values()) {
    kind.requirements.sort((a, b) => a.criterion.localeCompare(b.criterion));
  }
  return [...grouped.values()];
}
