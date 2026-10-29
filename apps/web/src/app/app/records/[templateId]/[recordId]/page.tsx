"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import { RecordEditor } from "@/components/record-editor";
import { RequirementList, requirementsByTemplate, type RequirementRef } from "@/components/requirements";
import { buttonVariants } from "@/components/ui/button";
import type { FormRecordDetail } from "@/lib/records";

export default function RecordPage() {
  const params = useParams<{ templateId: string; recordId: string }>();
  const { org } = useSite();
  const [record, setRecord] = useState<FormRecordDetail | null>(null);
  const [requirements, setRequirements] = useState<RequirementRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = org?.scopes[0]?.code ?? "";

  useEffect(() => {
    api<FormRecordDetail>(`/form-records/${params.recordId}`)
      .then(setRecord)
      .catch((err: Error) => setError(err.message));
  }, [params.recordId]);

  const siteId = record?.siteId ?? "";
  const templateId = record?.templateId ?? "";

  useEffect(() => {
    if (!siteId || !templateId || !version) return;
    api<{ rows: Array<{ criterion?: string; level?: string; controlTitle?: string; templateId?: string | null }> }>(
      `/sites/${siteId}/evidence-gap?versionCode=${encodeURIComponent(version)}`,
    )
      .then((payload) => setRequirements(requirementsByTemplate(payload.rows).get(templateId) ?? []))
      .catch(() => setRequirements([]));
  }, [siteId, templateId, version]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!record) return <p className="text-sm text-muted-foreground">Loading record…</p>;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Link href="/app/records" className="text-xs text-muted-foreground hover:underline">
            Records
          </Link>
          <h1 className="font-heading text-3xl font-medium tracking-tight">{record.title ?? "Record"}</h1>
        </div>
        <a
          href={`/api/form-records/${record.id}/pdf`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Export PDF
        </a>
      </header>
      {requirements ? <RequirementList requirements={requirements} /> : null}
      <RecordEditor record={record} role={org?.role ?? null} onChange={setRecord} />
    </div>
  );
}
