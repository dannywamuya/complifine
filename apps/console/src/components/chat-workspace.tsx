"use client";

import { ChatShell } from "@complifine/chat";
import { useCertScope } from "@/components/cert-scope";
import { apiBase } from "@/lib/api";

const SUGGESTIONS = [
  "When can workers go back into a field after spraying?",
  "Is irrigation water testing a Major Must?",
  "What changes between Smart and GFS for crop protection?",
  "Certificate validity extension in the General Regulations",
];

export function ChatWorkspace() {
  const { versions } = useCertScope();

  return (
    <ChatShell
      apiBase={apiBase()}
      className="-m-6 h-[calc(100svh-3rem)]"
      eyebrow="Retrieval debug"
      title="Search"
      titleId="tour-search"
      emptyTitle="Search the published corpus."
      emptyBody="Answer mode streams a grounded reply. Passages mode returns retrieved chunks only — useful when you are checking fusion, not prose."
      suggestions={SUGGESTIONS}
      versionOptions={[
        { value: "all", label: "All versions" },
        ...versions.map((item) => ({ value: item.code, label: item.name })),
      ]}
      kindOptions={[
        { value: "requirements", label: "Requirements" },
        { value: "regulations", label: "Regulations" },
      ]}
      showKindFilter
      criterionHref={(id) => `/criteria/${encodeURIComponent(id)}`}
    />
  );
}
