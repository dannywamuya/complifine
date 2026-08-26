"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChatShell } from "@complifine/chat";
import { api, apiBase } from "@/lib/api";
import { CONVERSATIONS_CHANGED } from "@/components/app-sidebar";
import { APP_HEADER_ACTIONS_ID, APP_HEADER_EXTRA_ID } from "@/components/app-header";
import { ChatPageSkeleton } from "@/components/app-skeletons";
import { SITE_TYPE_LABELS, type OrgPayload } from "@/lib/farm";

const SUGGESTIONS = [
  "When can workers go back into a field after spraying?",
  "Is irrigation water testing a Major Must?",
  "What changes between Smart and GFS for crop protection?",
  "Do harvest hygiene rules still apply if we don't harvest?",
];

export function ChatWorkspace() {
  return (
    <Suspense fallback={<ChatPageSkeleton />}>
      <ChatWorkspaceInner />
    </Suspense>
  );
}

function ChatWorkspaceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const conversationId = params.get("c");
  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [orgReady, setOrgReady] = useState(false);

  useEffect(() => {
    api<OrgPayload>("/org")
      .then(setOrg)
      .catch(() => setOrg(null))
      .finally(() => setOrgReady(true));
  }, []);

  const sites = org?.sites ?? [];
  const scopes = org?.scopes ?? [];
  const defaultVersion = scopes.length === 1 ? scopes[0]!.code : "all";
  const versionOptions =
    scopes.length === 0
      ? undefined
      : [
          ...(scopes.length > 1 ? [{ value: "all", label: "All in your scope" }] : []),
          ...scopes.map((scope) => ({ value: scope.code, label: scope.name })),
        ];
  const siteOptions = useMemo(
    () =>
      sites.map((site) => ({
        value: site.id,
        label: [site.name, SITE_TYPE_LABELS[site.siteType] ?? site.siteType].filter(Boolean).join(" · "),
      })),
    [sites],
  );

  const siteName = sites[0]?.name;
  const emptyBlobLines = [
    "Ask in your own words. Get a cited answer.",
    siteName ? `Tuned to ${siteName} — a packhouse is not a field.` : "Tuned to your site — a packhouse is not a field.",
    "Save hours before the next audit.",
    "Open the source page. No guessing.",
  ];

  if (!orgReady) return <ChatPageSkeleton />;

  return (
    <ChatShell
      apiBase={apiBase()}
      className="h-full min-h-0"
      variant="embedded"
      hideHistory
      headerPortal={{ extra: APP_HEADER_EXTRA_ID, actions: APP_HEADER_ACTIONS_ID }}
      conversationId={conversationId}
      onConversationId={(id) => {
        const next = id ? `/app?c=${encodeURIComponent(id)}` : "/app";
        router.replace(next, { scroll: false });
        window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
      }}
      suggestions={SUGGESTIONS}
      emptyTitle="What do you need to check today?"
      emptyGreeting=""
      emptyBlobLines={emptyBlobLines}
      footer="We cite the published edition. Your certification body still decides the close calls."
      modes={["answer"]}
      defaultVersion={defaultVersion}
      versionOptions={versionOptions}
      organizationName={org?.organization?.name}
      scopeEditionLabels={scopes.map((scope) => scope.name)}
      siteOptions={org ? siteOptions : undefined}
      defaultSiteId={sites[0]?.id}
      profileHref="/app/company"
      criterionHref={(id) => `/app/criteria/${encodeURIComponent(id)}`}
    />
  );
}
