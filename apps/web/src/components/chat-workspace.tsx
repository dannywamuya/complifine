"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, MapPinned, Quote, SplitSquareVertical } from "lucide-react";
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

const EMPTY_FEATURES = [
  {
    title: "Grounded answers",
    body: "Every claim cites a published criterion.",
    icon: <Quote className="size-4" aria-hidden />,
  },
  {
    title: "Your farm",
    body: "Sites and scope change what applies.",
    icon: <MapPinned className="size-4" aria-hidden />,
  },
  {
    title: "Official sources",
    body: "Published editions only, versioned.",
    icon: <BookOpen className="size-4" aria-hidden />,
  },
  {
    title: "Scoping",
    body: "Sixteen official questions, deterministic.",
    icon: <SplitSquareVertical className="size-4" aria-hidden />,
  },
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
      emptyGreeting="Hello there"
      emptyFeatures={EMPTY_FEATURES}
      modes={["answer"]}
      defaultVersion={defaultVersion}
      versionOptions={versionOptions}
      organizationName={org?.organization?.name}
      scopeEditionLabels={scopes.map((scope) => scope.name)}
      siteOptions={org ? siteOptions : undefined}
      defaultSiteId={sites[0]?.id}
      profileHref="/app/farm"
      criterionHref={(id) => `/app/criteria/${encodeURIComponent(id)}`}
    />
  );
}
