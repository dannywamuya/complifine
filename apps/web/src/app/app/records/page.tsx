"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import { CADENCE_LABELS, CATEGORY_LABELS, type FormRecordListItem, type FormTemplateRow } from "@/lib/records";
import { requirementCodes, requirementsByTemplate, type RequirementRef } from "@/components/requirements";
import { ListPager, pageOf } from "@/components/list-pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CADENCE_RANK: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  annual: 4,
  once: 5,
  per_event: 6,
};

type SortKey = "title" | "cadence" | "when" | "status";
type SortDir = "asc" | "desc";
type TodoSort = "title" | "cadence" | "urgency";
type Urgency = "overdue" | "due" | "missing" | "sent_back" | "draft";

interface TodoItem {
  id: string;
  title: string;
  href: string;
  urgency: Urgency;
  cadence: string;
  category: string;
  evidenceTypeId?: string;
  requirements?: string[];
}

interface GapRow {
  status: string;
  criterion?: string;
  level?: string;
  controlTitle?: string;
  evidenceTypeId?: string;
  evidenceTypeTitle?: string;
  templateId?: string | null;
}

const STATUS_RANK: Record<string, number> = { draft: 0, rejected: 1, submitted: 2, verified: 3 };

export default function RecordsPage() {
  const router = useRouter();
  const { site, siteId, error, org } = useSite();
  const [records, setRecords] = useState<FormRecordListItem[]>([]);
  const [templates, setTemplates] = useState<FormTemplateRow[]>([]);
  const [gap, setGap] = useState<GapRow[]>([]);
  const [version, setVersion] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cadence, setCadence] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("when");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [todoPage, setTodoPage] = useState(1);
  const [todoQuery, setTodoQuery] = useState("");
  const [todoCategory, setTodoCategory] = useState("all");
  const [todoCadence, setTodoCadence] = useState("all");
  const [todoUrgency, setTodoUrgency] = useState("all");
  const [todoSort, setTodoSort] = useState<TodoSort>("urgency");
  const [todoDir, setTodoDir] = useState<SortDir>("asc");

  useEffect(() => {
    const code = org?.scopes[0]?.code ?? "";
    setVersion((current) => current || code);
  }, [org]);

  useEffect(() => {
    if (!site) return;
    api<{ records: FormRecordListItem[] }>(`/sites/${site.id}/form-records`)
      .then((payload) => setRecords(payload.records))
      .catch(() => setRecords([]));
    api<{ templates: FormTemplateRow[] }>(`/form-templates?siteType=${site.siteType}&siteId=${site.id}`)
      .then((payload) => setTemplates(payload.templates))
      .catch(() => setTemplates([]));
  }, [site]);

  useEffect(() => {
    if (!siteId || !version) return;
    api<{ rows: GapRow[] }>(`/sites/${siteId}/evidence-gap?versionCode=${encodeURIComponent(version)}`)
      .then((payload) => setGap(payload.rows))
      .catch(() => setGap([]));
  }, [siteId, version]);

  const requirements = useMemo((): Map<string, RequirementRef[]> => requirementsByTemplate(gap), [gap]);

  const actions = useMemo(() => {
    const drafts = new Set(records.filter((record) => record.badge === "draft").map((record) => record.templateId));
    const items: TodoItem[] = [];
    const codes = (templateId: string) => (requirements.get(templateId) ?? []).map((row) => row.criterion);
    for (const template of templates) {
      if ((template.badge !== "overdue" && template.badge !== "due") || drafts.has(template.id)) continue;
      items.push({
        id: template.id,
        title: template.title,
        href: `/app/records/new?template=${template.id}`,
        urgency: template.badge === "overdue" ? "overdue" : "due",
        cadence: template.cadence,
        category: template.category,
        requirements: codes(template.id),
      });
    }
    for (const record of records.filter((row) => row.badge === "draft")) {
      items.push({
        id: record.id,
        title: record.title,
        href: `/app/records/${record.templateId}/${record.id}`,
        urgency: record.status === "rejected" ? "sent_back" : "draft",
        cadence: record.cadence,
        category: record.category,
        requirements: codes(record.templateId),
      });
    }
    const uploads = new Map<string, { row: GapRow; criteria: string[] }>();
    for (const row of gap) {
      if (!row.evidenceTypeId || row.templateId) continue;
      if (row.status !== "missing" && row.status !== "expired") continue;
      const current = uploads.get(row.evidenceTypeId);
      if (!current) {
        uploads.set(row.evidenceTypeId, { row, criteria: row.criterion ? [row.criterion] : [] });
        continue;
      }
      if (row.status === "expired") current.row = row;
      if (row.criterion && !current.criteria.includes(row.criterion)) current.criteria.push(row.criterion);
    }
    for (const bucket of uploads.values()) {
      bucket.criteria.sort((a, b) => a.localeCompare(b));
      items.push({
        id: `gap-${bucket.row.evidenceTypeId}`,
        title: bucket.row.evidenceTypeTitle ?? "Evidence",
        href: `/app/records/evidence?type=${bucket.row.evidenceTypeId}`,
        urgency: bucket.row.status === "expired" ? "overdue" : "missing",
        cadence: "per_event",
        category: "evidence",
        evidenceTypeId: bucket.row.evidenceTypeId,
        requirements: bucket.criteria,
      });
    }
    return items;
  }, [records, templates, gap, requirements]);

  const counts = useMemo(
    () => ({
      overdue: actions.filter((action) => action.urgency === "overdue").length,
      due: actions.filter((action) => action.urgency === "due").length,
      pending: actions.filter((action) => action.urgency === "draft" || action.urgency === "sent_back").length,
      missing: actions.filter((action) => action.urgency === "missing").length,
    }),
    [actions],
  );

  const todoCategories = useMemo(() => {
    const present = new Set(actions.map((action) => action.category));
    const keys = Object.keys(CATEGORY_LABELS).filter((key) => present.has(key));
    if (present.has("evidence")) keys.push("evidence");
    return keys;
  }, [actions]);

  const todoCadences = useMemo(() => {
    const present = new Set(actions.map((action) => action.cadence));
    return Object.keys(CADENCE_RANK).filter((key) => present.has(key));
  }, [actions]);

  const filteredTodos = useMemo(() => {
    const needle = todoQuery.trim().toLowerCase();
    const rows = actions.filter((action) => {
      if (todoUrgency === "pending") {
        if (action.urgency !== "draft" && action.urgency !== "sent_back") return false;
      } else if (todoUrgency !== "all" && action.urgency !== todoUrgency) return false;
      if (todoCategory !== "all" && action.category !== todoCategory) return false;
      if (todoCadence !== "all" && action.cadence !== todoCadence) return false;
      if (needle) {
        const codes = (action.requirements ?? []).join(" ").toLowerCase();
        if (!action.title.toLowerCase().includes(needle) && !codes.includes(needle)) return false;
      }
      return true;
    });
    const direction = todoDir === "asc" ? 1 : -1;
    rows.sort((a, b) => direction * compareTodos(a, b, todoSort) || a.title.localeCompare(b.title));
    return rows;
  }, [actions, todoQuery, todoUrgency, todoCategory, todoCadence, todoSort, todoDir]);

  const categories = useMemo(() => {
    const present = new Set(records.map((record) => record.category));
    return Object.keys(CATEGORY_LABELS).filter((key) => present.has(key));
  }, [records]);

  const cadences = useMemo(() => {
    const present = new Set(records.map((record) => record.cadence));
    return Object.keys(CADENCE_RANK).filter((key) => present.has(key));
  }, [records]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = records.filter((record) => {
      if (category !== "all" && record.category !== category) return false;
      if (cadence !== "all" && record.cadence !== cadence) return false;
      if (needle) {
        const codes = requirementCodes(requirements.get(record.templateId) ?? []).toLowerCase();
        if (!record.title.toLowerCase().includes(needle) && !codes.includes(needle)) return false;
      }
      return true;
    });
    const direction = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => direction * compareRecords(a, b, sortKey) || a.title.localeCompare(b.title));
    return rows;
  }, [records, requirements, query, category, cadence, sortKey, sortDir]);

  const table = pageOf(visible, page);
  const todos = pageOf(filteredTodos, todoPage);

  useEffect(() => {
    setPage(1);
  }, [query, category, cadence, sortKey, sortDir, siteId]);

  useEffect(() => {
    setTodoPage(1);
  }, [siteId, todoQuery, todoCategory, todoCadence, todoUrgency, todoSort, todoDir]);

  function toggleTodoFilter(value: string) {
    setTodoUrgency((current) => (current === value ? "all" : value));
  }

  function applyTodoSort(value: string) {
    const [column, dir] = value.split(":") as [TodoSort, SortDir];
    setTodoSort(column);
    setTodoDir(dir);
  }

  function toggleSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDir(column === "when" ? "desc" : "asc");
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <div id="tour-records" className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-heading text-3xl font-medium tracking-tight">Records</h1>
          <p className="text-sm text-muted-foreground">
            Record what happened, or file a document. This page shows what is overdue, due, pending, or missing.
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          {(org?.scopes.length ?? 0) > 1 ? (
            <Select value={version} onValueChange={setVersion}>
              <SelectTrigger className="col-span-2 h-8 w-full sm:w-56">
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
          {site ? (
            <>
              <Button type="button" variant="outline" className="h-8" asChild>
                <Link href="/app/records/evidence">Add evidence</Link>
              </Button>
              <Button type="button" className="h-8" asChild>
                <Link href="/app/records/new">New record</Link>
              </Button>
            </>
          ) : (
            <Button type="button" className="h-8" disabled>
              New record
            </Button>
          )}
        </div>
      </header>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!site ? <p className="text-sm text-muted-foreground">Add a site under Company before recording anything.</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusCard label="Overdue" value={counts.overdue} active={todoUrgency === "overdue"} onClick={() => toggleTodoFilter("overdue")} />
        <StatusCard label="Due soon" value={counts.due} active={todoUrgency === "due"} onClick={() => toggleTodoFilter("due")} />
        <StatusCard label="Pending" value={counts.pending} active={todoUrgency === "pending"} onClick={() => toggleTodoFilter("pending")} />
        <StatusCard label="Missing" value={counts.missing} active={todoUrgency === "missing"} onClick={() => toggleTodoFilter("missing")} />
      </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">To do · {filteredTodos.length}</h2>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs recording.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Input
                value={todoQuery}
                onChange={(event) => setTodoQuery(event.target.value)}
                placeholder="Search to-dos"
                className="col-span-2 h-8 sm:col-span-1"
              />
              <Select value={todoCategory} onValueChange={setTodoCategory}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {todoCategories.map((key) => (
                    <SelectItem key={key} value={key}>
                      {typeLabel(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={todoCadence} onValueChange={setTodoCadence}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All frequencies</SelectItem>
                  {todoCadences.map((key) => (
                    <SelectItem key={key} value={key}>
                      {CADENCE_LABELS[key] ?? key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={todoUrgency} onValueChange={setTodoUrgency}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All urgencies</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="due">Due soon</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                  <SelectItem value="sent_back">Sent back</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
              <Select value={`${todoSort}:${todoDir}`} onValueChange={applyTodoSort}>
                <SelectTrigger className="col-span-2 h-8 w-full sm:col-span-1">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgency:asc">Most urgent</SelectItem>
                  <SelectItem value="urgency:desc">Least urgent</SelectItem>
                  <SelectItem value="cadence:asc">Frequency, soonest</SelectItem>
                  <SelectItem value="cadence:desc">Frequency, latest</SelectItem>
                  <SelectItem value="title:asc">Record A–Z</SelectItem>
                  <SelectItem value="title:desc">Record Z–A</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filteredTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No to-dos match.</p>
            ) : (
              <div className="space-y-3">
                <ul className="divide-y rounded-xl border">
                  {todos.rows.map((action) => (
                    <li key={action.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{action.title}</span>
                        <span className="block text-xs text-muted-foreground">{actionDetail(action)}</span>
                      </span>
                      <UrgencyBadge urgency={action.urgency} />
                      <Button type="button" size="sm" variant="outline" className="shrink-0" asChild>
                        <Link href={action.href}>
                          {action.evidenceTypeId ? "Upload" : action.href.includes("/new") ? "Record" : "Continue"}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
                <ListPager page={todos.page} pages={todos.pages} total={todos.total} start={todos.start} onPage={setTodoPage} />
              </div>
            )}
          </>
        )}
      </section>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Filed · {records.length}</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search records"
            className="h-8"
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
              <SelectValue placeholder="Occurrence" />
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
        </div>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Record" column="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Occurrence" column="cadence" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="When" column="when" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((record) => {
                const codes = requirementCodes(requirements.get(record.templateId) ?? [], 3);
                return (
                <TableRow
                  key={record.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/app/records/${record.templateId}/${record.id}`)}
                >
                  <TableCell>
                    <span className="block font-medium">{record.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {CATEGORY_LABELS[record.category] ?? record.category}
                      {codes ? ` · ${codes}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CADENCE_LABELS[record.cadence] ?? record.cadence}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatWhen(record.submittedAt ?? record.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {statusMarks(record).map((mark) => (
                        <Badge key={mark.label} variant={mark.variant}>
                          {mark.label}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                </TableRow>
                );
              })}
              {site && visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {records.length === 0 ? "No records yet." : "No records match."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <ListPager page={table.page} pages={table.pages} total={table.total} start={table.start} onPage={setPage} />
      </div>
    </div>
  );
}

function compareTodos(a: TodoItem, b: TodoItem, key: TodoSort): number {
  if (key === "title") return a.title.localeCompare(b.title);
  if (key === "cadence") {
    const cadence = (CADENCE_RANK[a.cadence] ?? 9) - (CADENCE_RANK[b.cadence] ?? 9);
    return cadence || URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  }
  const urgency = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  return urgency || (CADENCE_RANK[a.cadence] ?? 9) - (CADENCE_RANK[b.cadence] ?? 9);
}

function compareRecords(a: FormRecordListItem, b: FormRecordListItem, key: SortKey): number {
  if (key === "title") return a.title.localeCompare(b.title);
  if (key === "cadence") return (CADENCE_RANK[a.cadence] ?? 9) - (CADENCE_RANK[b.cadence] ?? 9);
  if (key === "status") return statusSort(a) - statusSort(b);
  const aTime = new Date(a.submittedAt ?? a.createdAt).getTime();
  const bTime = new Date(b.submittedAt ?? b.createdAt).getTime();
  return aTime - bTime;
}

function SortHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <TableHead aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1" onClick={() => onSort(column)}>
        {label}
        {active ? sortDir === "asc" ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" /> : null}
      </button>
    </TableHead>
  );
}

function frequencyLabel(cadence: string, urgency: Urgency): string {
  const label = CADENCE_LABELS[cadence] ?? cadence;
  if (cadence === "daily" && (urgency === "overdue" || urgency === "due")) return `${label} · fill today`;
  return label;
}

function statusMarks(record: FormRecordListItem): Array<{ label: string; variant: "default" | "secondary" | "destructive" | "outline" }> {
  const marks: Array<{ label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = [];
  if (record.status === "verified") marks.push({ label: "Verified", variant: "default" });
  else if (record.status === "rejected") marks.push({ label: "Sent back", variant: "destructive" });
  else if (record.status === "submitted") marks.push({ label: "Submitted", variant: "outline" });
  else marks.push({ label: "Draft", variant: "secondary" });
  if (record.badge === "overdue") marks.push({ label: "Overdue", variant: "destructive" });
  else if (record.badge === "due") marks.push({ label: "Due soon", variant: "secondary" });
  return marks;
}

function statusSort(record: FormRecordListItem): number {
  const workflow = STATUS_RANK[record.status] ?? 9;
  const fresh = record.badge === "overdue" ? 0 : record.badge === "due" ? 1 : 2;
  return workflow * 10 + fresh;
}

const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, due: 1, missing: 2, sent_back: 3, draft: 4 };

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "Overdue",
  due: "Due soon",
  missing: "Missing",
  sent_back: "Sent back",
  draft: "Draft",
};

function typeLabel(key: string): string {
  if (key === "evidence") return "Files";
  return CATEGORY_LABELS[key] ?? key;
}

function actionDetail(action: TodoItem): string {
  const base =
    action.category === "evidence"
      ? action.urgency === "overdue"
        ? "File · out of date"
        : "File · not on file"
      : `${CATEGORY_LABELS[action.category] ?? action.category} · ${frequencyLabel(action.cadence, action.urgency)}`;
  const codes = requirementCodes((action.requirements ?? []).map((criterion) => ({ criterion })), 3);
  return codes ? `${base} · ${codes}` : base;
}

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <Badge
      variant={urgency === "overdue" || urgency === "missing" || urgency === "sent_back" ? "destructive" : "secondary"}
      className="shrink-0"
    >
      {URGENCY_LABEL[urgency]}
    </Badge>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

function StatusCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left ${active ? "border-foreground" : "hover:bg-muted/40"}`}
    >
      <span className="block font-heading text-2xl font-medium tracking-tight">{value}</span>
      <span className="block text-xs text-muted-foreground">{label}</span>
    </button>
  );
}
