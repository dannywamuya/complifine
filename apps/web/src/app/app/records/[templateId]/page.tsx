"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ListPager, pageOf } from "@/components/list-pager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FormTemplateRow } from "@/lib/records";

interface RecordRow {
  id: string;
  status: string;
  freshness: string;
  submittedAt: string | null;
  createdAt: string;
  periodStart: string | null;
}

export default function TemplateRecordsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading records…</p>}>
      <TemplateRecords />
    </Suspense>
  );
}

function TemplateRecords() {
  const params = useParams<{ templateId: string }>();
  const search = useSearchParams();
  const siteId = search.get("site") ?? "";
  const [template, setTemplate] = useState<FormTemplateRow | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ templates: FormTemplateRow[] }>("/form-templates")
      .then((payload) => setTemplate(payload.templates.find((row) => row.id === params.templateId) ?? null))
      .catch(() => setTemplate(null));
  }, [params.templateId]);

  useEffect(() => {
    if (!siteId) return;
    api<{ records: RecordRow[] }>(`/sites/${siteId}/form-records?templateId=${params.templateId}`)
      .then((payload) => setRecords(payload.records))
      .catch(() => setRecords([]));
  }, [siteId, params.templateId]);

  const view = pageOf(records, page);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="space-y-2">
        <Link href={`/app/records`} className="text-xs text-muted-foreground hover:underline">
          All records
        </Link>
        <h1 className="font-heading text-3xl font-medium tracking-tight">{template?.title ?? "Record"}</h1>
        {template?.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{template.description}</p>
        ) : null}
      </header>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!siteId} asChild>
          <Link href={`/app/records/new?template=${params.templateId}&site=${siteId}`}>New record</Link>
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={`/app/records/${params.templateId}/capture?site=${siteId}`}>Capture</Link>
        </Button>
      </div>
      <ul className="divide-y rounded-2xl border">
        {view.rows.map((record) => (
          <li key={record.id}>
            <Link
              href={`/app/records/${params.templateId}/${record.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <span className="text-sm">
                {record.submittedAt ? record.submittedAt.slice(0, 10) : `Draft · ${record.createdAt.slice(0, 10)}`}
              </span>
              <span className="flex gap-2">
                <Badge variant="secondary">{record.status}</Badge>
                {record.freshness === "stale" ? <Badge variant="destructive">Out of date</Badge> : null}
              </span>
            </Link>
          </li>
        ))}
        {records.length === 0 ? (
          <li className="px-4 py-6 text-sm text-muted-foreground">No records for this template yet.</li>
        ) : null}
      </ul>
      <ListPager page={view.page} pages={view.pages} total={view.total} start={view.start} onPage={setPage} />
    </div>
  );
}
