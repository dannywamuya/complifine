"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatShell } from "@complifine/chat";
import { api, apiBase } from "@/lib/api";
import { EDITIONS } from "@/lib/editions";
import { SITE_TYPE_LABELS, type OrgPayload } from "@/lib/farm";

const SUGGESTIONS = [
  "When can workers go back into a field after spraying?",
  "Is irrigation water testing a Major Must?",
  "What changes between Smart and GFS for crop protection?",
  "Do harvest hygiene rules still apply if we don't harvest?",
];

export function ChatWorkspace() {
  const [org, setOrg] = useState<OrgPayload | null>(null);

  useEffect(() => {
    api<OrgPayload>("/org")
      .then(setOrg)
      .catch(() => setOrg(null));
  }, []);

  const sites = org?.sites ?? [];
  const scopes = org?.scopes ?? [];
  const defaultVersion = scopes.length === 1 ? scopes[0]!.code : "all";
  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: [site.name, SITE_TYPE_LABELS[site.siteType] ?? site.siteType].filter(Boolean).join(" · "),
      })),
    [sites],
  );

  return (
    <ChatShell
      apiBase={apiBase()}
      className="h-[calc(100svh-3rem)]"
      variant="embedded"
      suggestions={SUGGESTIONS}
      modes={["answer"]}
      defaultVersion={defaultVersion}
      versionOptions={[
        { value: "all", label: "All versions" },
        ...EDITIONS.map((item) => ({ value: item.value, label: item.label })),
      ]}
      organizationName={org?.organization?.name}
      siteOptions={siteOptions}
      defaultSiteId={sites[0]?.id}
      profileHref="/app/farm"
      criterionHref={(id) => `/app/criteria/${encodeURIComponent(id)}`}
    />
  );
}
