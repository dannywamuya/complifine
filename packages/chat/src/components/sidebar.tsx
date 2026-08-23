"use client";

import { Loader2, PanelLeft, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { groupByDate } from "../dates.ts";
import type { ConversationSummary } from "../types.ts";
import { cn } from "../cn.ts";
import { ConfirmDialog, IconButton } from "./primitives.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";
import type { ChatTheme } from "../types.ts";

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  loadingMore,
  query,
  onQuery,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onLoadMore,
  hasMore,
  collapsed,
  onToggleCollapsed,
  mobile,
  onCloseMobile,
  theme,
  onTheme,
  enterSends,
  onEnterSends,
  showTheme = true,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  loadingMore: boolean;
  query: string;
  onQuery: (value: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobile: boolean;
  onCloseMobile: () => void;
  theme: ChatTheme;
  onTheme: (theme: ChatTheme) => void;
  enterSends: boolean;
  onEnterSends: (value: boolean) => void;
  showTheme?: boolean;
}) {
  const groups = useMemo(() => groupByDate(conversations), [conversations]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);

  function startRename(item: ConversationSummary) {
    setEditing(item.id);
    setDraft(item.title);
  }

  function commitRename(id: string) {
    const title = draft.trim();
    setEditing(null);
    if (title) onRename(id, title);
  }

  function onListKey(event: KeyboardEvent<HTMLDivElement>, id: string) {
    const items = conversations.map((item) => item.id);
    const index = items.indexOf(id);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = items[index + 1];
      if (next) document.getElementById(`cf-conv-${next}`)?.focus();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = items[index - 1];
      if (prev) document.getElementById(`cf-conv-${prev}`)?.focus();
    }
    if (event.key === "Enter") onOpen(id);
    if (event.key === "Delete" || event.key === "Backspace") {
      const item = conversations.find((row) => row.id === id);
      if (item) setPendingDelete(item);
    }
  }

  const inner = (
    <aside
      className={cn(
        "relative flex h-full min-h-0 flex-col border-(--cf-border) bg-(--cf-bg-elevated)",
        mobile ? "w-[min(20rem,90vw)]" : collapsed ? "w-14" : "w-(--cf-sidebar)",
        !mobile && "border-r",
      )}
      aria-label="Conversations"
    >
      <div className="flex items-center gap-1 p-2">
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggleCollapsed}>
          <PanelLeft className="size-4" />
        </IconButton>
        {!collapsed || mobile ? (
          <button
            type="button"
            onClick={onNew}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-(--cf-fg) px-3 text-sm font-medium text-(--cf-bg)"
          >
            <Plus className="size-4" />
            New chat
          </button>
        ) : (
          <IconButton label="New chat" onClick={onNew}>
            <Plus className="size-4" />
          </IconButton>
        )}
      </div>

      {(!collapsed || mobile) && (
        <>
          <div className="px-2 pb-2">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-(--cf-fg-subtle)" />
              <span className="sr-only">Search conversations</span>
              <input
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Search chats"
                className="h-9 w-full rounded-xl border border-(--cf-border) bg-(--cf-bg) pr-3 pl-8 text-sm outline-none placeholder:text-(--cf-fg-subtle)"
              />
            </label>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" aria-label="Chat history">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-3 text-sm text-(--cf-fg-muted)">
                <Loader2 className="size-3.5 animate-spin" />
                Loading…
              </p>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-4 text-sm text-(--cf-fg-muted)">No conversations yet.</p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-medium tracking-[0.14em] text-(--cf-fg-subtle) uppercase">
                    {group.label}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active = item.id === activeId;
                      return (
                        <li key={item.id} className="group relative">
                          {editing === item.id ? (
                            <input
                              autoFocus
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => commitRename(item.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") commitRename(item.id);
                                if (event.key === "Escape") setEditing(null);
                              }}
                              className="h-9 w-full rounded-xl border border-(--cf-ring) bg-(--cf-bg) px-2.5 text-sm outline-none"
                            />
                          ) : (
                            <div
                              id={`cf-conv-${item.id}`}
                              role="button"
                              tabIndex={0}
                              aria-current={active ? "page" : undefined}
                              onClick={() => onOpen(item.id)}
                              onKeyDown={(event) => onListKey(event, item.id)}
                              className={cn(
                                "flex h-9 cursor-pointer items-center rounded-xl px-2.5 text-sm",
                                active
                                  ? "bg-(--cf-accent-soft) font-medium text-(--cf-accent)"
                                  : "hover:bg-(--cf-bg-muted)",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate">{item.title}</span>
                              <span className="hidden shrink-0 group-hover:flex group-focus-within:flex">
                                <button
                                  type="button"
                                  aria-label={`Rename ${item.title}`}
                                  className="rounded-md p-1 hover:bg-(--cf-bg-elevated)"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startRename(item);
                                  }}
                                >
                                  <Pencil className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${item.title}`}
                                  className="rounded-md p-1 hover:bg-(--cf-bg-elevated)"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setPendingDelete(item);
                                  }}
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
            {hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-xl py-2 text-xs font-medium text-(--cf-fg-muted) hover:bg-(--cf-bg-muted)"
              >
                {loadingMore ? "Loading…" : "Load older"}
              </button>
            ) : null}
          </nav>

          <div className="space-y-2 border-t border-(--cf-border) p-2">
            {showTheme ? <ThemeToggle value={theme} onChange={onTheme} /> : null}
            <label className="flex items-center justify-between gap-2 px-1 text-xs text-(--cf-fg-muted)">
              <span>Enter sends</span>
              <input
                type="checkbox"
                checked={enterSends}
                onChange={(event) => onEnterSends(event.target.checked)}
              />
            </label>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete conversation?"
        body={`“${pendingDelete?.title}” and every message in it will be removed. This cannot be undone.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </aside>
  );

  if (!mobile) return inner;

  return (
    <div className="absolute inset-0 z-30 flex" role="dialog" aria-modal="true" aria-label="Conversations">
      {inner}
      <button type="button" className="h-full flex-1 bg-[oklch(0.2_0.02_60/0.45)]" aria-label="Close sidebar" onClick={onCloseMobile} />
    </div>
  );
}
