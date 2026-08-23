"use client";

import { BookOpen, Download, FileCode2, PanelLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { farmContextNote } from "../ask-context.ts";
import { cn } from "../cn.ts";
import { extractArtifacts } from "../markdown-stream.ts";
import { useChat } from "../store/use-chat.ts";
import { SITE_KEY, type ChatMode, type ModelOption, type SelectOption } from "../types.ts";
import { ArtifactsPanel } from "./artifacts-panel.tsx";
import { Composer } from "./composer.tsx";
import { IconButton } from "./primitives.tsx";
import { OfflineBanner } from "./offline-banner.tsx";
import { ConversationSidebar } from "./sidebar.tsx";
import { SourcesRail } from "./sources-rail.tsx";
import { ThreadView } from "./thread-view.tsx";

export interface ChatShellProps {
  apiBase: string;
  className?: string;
  /** `embedded` hides the package header and opens history as a drawer — use inside app chrome. */
  variant?: "standalone" | "embedded";
  title?: string;
  eyebrow?: string;
  titleId?: string;
  emptyTitle?: string;
  emptyBody?: string;
  suggestions?: string[];
  versionOptions?: SelectOption[];
  kindOptions?: SelectOption[];
  showKindFilter?: boolean;
  showSources?: boolean;
  modes?: ChatMode[];
  defaultMode?: ChatMode;
  defaultVersion?: string;
  defaultKind?: string;
  models?: ModelOption[];
  criterionHref?: (id: string) => string;
  placeholder?: string;
  footer?: string;
  organizationName?: string;
  siteOptions?: SelectOption[];
  defaultSiteId?: string;
  profileHref?: string;
  onFeedback?: (messageId: string, vote: "up" | "down" | null) => void;
}

const DEFAULT_SUGGESTIONS = [
  "When can workers go back into a field after spraying?",
  "Is irrigation water testing a Major Must?",
  "What changes between Smart and GFS for crop protection?",
  "Do harvest hygiene rules still apply if we don't harvest?",
];

const COLUMN = "mx-auto w-full max-w-2xl px-4 sm:px-5";

function readStoredSite(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SITE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function ChatShell({
  apiBase,
  className,
  variant = "standalone",
  title = "Ask the standard",
  eyebrow,
  titleId,
  emptyTitle = "Ask in the words you would use on the farm.",
  emptyBody = "You get a short summary, the rule as published, and the passages it came from. Nothing is answered from memory.",
  suggestions = DEFAULT_SUGGESTIONS,
  versionOptions,
  kindOptions,
  showKindFilter,
  showSources = true,
  modes = ["answer", "passages"],
  defaultMode = "answer",
  defaultVersion = "all",
  defaultKind = "requirements",
  models,
  criterionHref,
  placeholder,
  footer = "Answers are grounded in retrieved text. Your certification body decides binding cases.",
  organizationName,
  siteOptions,
  defaultSiteId,
  profileHref,
  onFeedback,
}: ChatShellProps) {
  const embedded = variant === "embedded";
  const [siteId, setSiteId] = useState(() => defaultSiteId || readStoredSite());
  const siteLabel = siteOptions?.find((option) => option.value === siteId)?.label;
  const contextNote = farmContextNote({ organizationName, siteLabel });

  const chat = useChat({
    apiBase,
    defaultMode,
    defaultVersion,
    defaultKind,
    siteId: siteId || undefined,
    contextNote,
    onFeedback,
  });
  const [mobile, setMobile] = useState(false);
  const [modelId, setModelId] = useState(models?.[0]?.id);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const drawerSidebar = embedded || mobile;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (defaultSiteId && !siteId) setSiteId(defaultSiteId);
  }, [defaultSiteId, siteId]);

  useEffect(() => {
    if (!siteOptions?.length) return;
    if (siteId && siteOptions.some((option) => option.value === siteId)) return;
    const stored = readStoredSite();
    const next =
      (stored && siteOptions.some((option) => option.value === stored) ? stored : null) ??
      defaultSiteId ??
      siteOptions[0]?.value ??
      "";
    if (next) setSiteId(next);
  }, [siteOptions, siteId, defaultSiteId]);

  function chooseSite(next: string) {
    setSiteId(next);
    try {
      if (next) window.localStorage.setItem(SITE_KEY, next);
      else window.localStorage.removeItem(SITE_KEY);
    } catch {
      /* ignore quota */
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT");
      if (event.key === "Escape") {
        chat.setSidebarOpen(false);
        setSourcesOpen(false);
      }
      if (!typing && event.key.toLowerCase() === "n" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        chat.newChat();
      }
      if (!typing && event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>('.cf-chat textarea[aria-label="Message"]')?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.querySelector(".cf-chat") as HTMLElement | null;
    const onResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root?.style.setProperty("--cf-kb", `${offset}px`);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  const artifacts = extractArtifacts(chat.lastAssistant?.content ?? "");
  const sourceCount = useMemo(() => {
    const hits = chat.lastAssistant?.hits?.length ?? 0;
    const citations = chat.lastAssistant?.citations?.length ?? 0;
    return hits + citations;
  }, [chat.lastAssistant]);

  const showSidebar = !drawerSidebar || chat.sidebarOpen;

  return (
    <div
      className={cn("cf-chat cf-chat-shell", chat.resolvedTheme === "dark" && "dark", className)}
      data-theme={chat.resolvedTheme}
    >
      <a
        href="#cf-composer"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-(--cf-bg-elevated) focus:px-3 focus:py-2"
      >
        Skip to composer
      </a>

      {showSidebar ? (
        <ConversationSidebar
          conversations={chat.conversations}
          activeId={chat.activeId}
          loading={chat.listLoading}
          loadingMore={chat.listLoadingMore}
          query={chat.listQuery}
          onQuery={chat.setListQuery}
          onOpen={(id) => {
            void chat.openConversation(id);
            if (drawerSidebar) chat.setSidebarOpen(false);
          }}
          onNew={chat.newChat}
          onRename={(id, title) => void chat.renameConversation(id, title)}
          onDelete={(id) => void chat.deleteConversation(id)}
          onLoadMore={chat.loadMore}
          hasMore={Boolean(chat.nextCursor)}
          collapsed={!drawerSidebar && chat.sidebarCollapsed}
          onToggleCollapsed={() => (drawerSidebar ? chat.setSidebarOpen(false) : chat.setSidebarCollapsed((value) => !value))}
          mobile={drawerSidebar && chat.sidebarOpen}
          onCloseMobile={() => chat.setSidebarOpen(false)}
          theme={chat.theme}
          onTheme={chat.setTheme}
          enterSends={chat.enterSends}
          onEnterSends={chat.setEnterSends}
          showTheme={!embedded}
        />
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" style={{ paddingBottom: "var(--cf-kb, 0px)" }}>
        <header className="shrink-0 border-b border-(--cf-border)">
          <div className={cn(COLUMN, "flex flex-row items-center gap-2 py-1.5")}>
            {drawerSidebar || chat.sidebarCollapsed ? (
              <IconButton
                label="Open conversations"
                onClick={() => (drawerSidebar ? chat.setSidebarOpen(true) : chat.setSidebarCollapsed(false))}
              >
                <PanelLeft className="size-4" />
              </IconButton>
            ) : null}

            {!embedded ? (
              <div id={titleId} className="min-w-0 flex-1">
                {eyebrow ? (
                  <p className="text-[11px] font-medium tracking-[0.16em] text-(--cf-accent) uppercase">{eyebrow}</p>
                ) : null}
                <h1 className="font-heading truncate text-base font-medium tracking-tight">{title}</h1>
              </div>
            ) : (
              <ContextChip
                organizationName={organizationName}
                siteOptions={siteOptions}
                siteId={siteId}
                onSite={chooseSite}
                profileHref={profileHref}
                titleId={titleId}
              />
            )}

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {modes.length > 1 ? (
                <ModeSwitch mode={chat.mode} onChange={chat.setMode} disabled={chat.pending} modes={modes} />
              ) : null}
              {showSources ? (
                <IconButton
                  label={sourcesOpen ? "Hide sources" : "Show sources"}
                  onClick={() => setSourcesOpen((value) => !value)}
                  className={sourcesOpen || sourceCount > 0 ? "text-(--cf-accent)" : undefined}
                >
                  <span className="relative inline-flex">
                    <BookOpen className="size-4" />
                    {sourceCount > 0 ? (
                      <span className="absolute -top-1.5 -right-1.5 min-w-3.5 rounded-full bg-(--cf-accent) px-1 py-px text-[9px] leading-none font-medium text-(--cf-accent-fg)">
                        {sourceCount}
                      </span>
                    ) : null}
                  </span>
                </IconButton>
              ) : null}
              <IconButton label="Export markdown" onClick={() => chat.exportActive("markdown")}>
                <Download className="size-4" />
              </IconButton>
              <IconButton
                label={chat.artifactOpen ? "Hide artifacts" : "Show artifacts"}
                onClick={() => chat.setArtifactOpen((value) => !value)}
                className={artifacts.length > 0 ? "text-(--cf-accent)" : undefined}
              >
                <FileCode2 className="size-4" />
              </IconButton>
            </div>
          </div>
        </header>

        <OfflineBanner show={chat.offline} message={chat.banner ?? chat.loadError} />

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className={cn(COLUMN, "flex min-h-0 flex-1 flex-col")}>
            <ThreadView
              path={chat.path}
              tree={chat.messages}
              emptyTitle={emptyTitle}
              emptyBody={emptyBody}
              suggestions={suggestions}
              onPick={(value) => chat.send(value)}
              onSelectBranch={(id) => void chat.selectBranch(id)}
              onCycleBranch={chat.cycleBranch}
              onEdit={chat.editAndResubmit}
              onRegenerate={chat.regenerate}
              onRetry={chat.retry}
              onDelete={(id) => void chat.deleteMessage(id)}
              onFeedback={chat.setFeedback}
              criterionHref={criterionHref}
            />

            <div id="cf-composer" className="shrink-0 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {!embedded && (organizationName || siteOptions?.length) ? (
                <div className="mb-2">
                  <ContextChip
                    organizationName={organizationName}
                    siteOptions={siteOptions}
                    siteId={siteId}
                    onSite={chooseSite}
                    profileHref={profileHref}
                  />
                </div>
              ) : null}
              <Composer
                draft={chat.draft}
                onChange={chat.setDraft}
                onSend={() => chat.send()}
                onStop={chat.stop}
                pending={chat.streaming}
                enterSends={chat.enterSends}
                attachments={chat.attachments}
                onRemoveAttachment={(id) => chat.setAttachments((files) => files.filter((file) => file.id !== id))}
                onFiles={(files) => void chat.addFiles(files)}
                placeholder={placeholder}
                version={chat.version}
                versionOptions={versionOptions}
                onVersion={chat.setVersion}
                kind={chat.kind}
                kindOptions={showKindFilter ? kindOptions : undefined}
                onKind={chat.setKind}
                models={models}
                modelId={modelId}
                onModel={setModelId}
                disabled={chat.overLimit}
              />
              <p className="mt-2 text-center text-[11px] text-(--cf-fg-subtle)">{footer}</p>
            </div>
          </div>

          {showSources && sourcesOpen ? (
            <div className="absolute inset-y-0 right-0 z-20 flex w-[min(22rem,100%)] flex-col border-l border-(--cf-border) bg-(--cf-bg-elevated) shadow-(--cf-shadow)">
              <SourcesRail
                hits={chat.lastAssistant?.hits ?? []}
                citations={chat.lastAssistant?.citations ?? []}
                loading={chat.lastAssistant?.status === "pending" || chat.lastAssistant?.status === "streaming"}
                criterionHref={criterionHref}
                onClose={() => setSourcesOpen(false)}
              />
            </div>
          ) : null}

          {chat.artifactOpen ? (
            <ArtifactsPanel
              markdown={chat.lastAssistant?.content ?? ""}
              open={chat.artifactOpen}
              onClose={() => chat.setArtifactOpen(false)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ContextChip({
  organizationName,
  siteOptions,
  siteId,
  onSite,
  profileHref,
  titleId,
}: {
  organizationName?: string;
  siteOptions?: SelectOption[];
  siteId: string;
  onSite: (value: string) => void;
  profileHref?: string;
  titleId?: string;
}) {
  if (!organizationName && !siteOptions?.length) {
    if (!profileHref) return <div id={titleId} className="min-w-0 flex-1" />;
    return (
      <p id={titleId} className="min-w-0 flex-1 truncate text-xs text-(--cf-fg-muted)">
        No farm profile.{" "}
        <a href={profileHref} className="font-medium text-(--cf-accent) underline-offset-2 hover:underline">
          Create one
        </a>
      </p>
    );
  }

  return (
    <div id={titleId} className="flex min-w-0 flex-1 items-center gap-2">
      {organizationName ? (
        <span className="truncate text-sm font-medium">{organizationName}</span>
      ) : null}
      {siteOptions && siteOptions.length > 0 ? (
        <label className="inline-flex min-w-0 items-center">
          <span className="sr-only">Site in context</span>
          <select
            value={siteId}
            onChange={(event) => onSite(event.target.value)}
            className="h-8 max-w-48 truncate rounded-lg bg-transparent px-1.5 text-xs text-(--cf-fg-muted) outline-none"
          >
            {siteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : profileHref ? (
        <a href={profileHref} className="truncate text-xs text-(--cf-fg-muted) hover:text-(--cf-fg)">
          Add a site
        </a>
      ) : null}
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
  disabled,
  modes,
}: {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
  modes: ChatMode[];
}) {
  return (
    <div className="flex rounded-full bg-(--cf-bg-muted) p-0.5 text-xs font-medium" role="tablist" aria-label="Response mode">
      {modes.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={mode === item}
          disabled={disabled}
          onClick={() => onChange(item)}
          className={cn(
            "rounded-full px-3 py-1 capitalize transition-colors",
            mode === item ? "bg-(--cf-bg-elevated) text-(--cf-fg) shadow-sm" : "text-(--cf-fg-muted)",
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
