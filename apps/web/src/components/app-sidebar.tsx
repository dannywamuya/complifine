"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, MessageSquare, Pencil, Plus, Search, Tractor, Trash2 } from "lucide-react";
import { groupByDate } from "@complifine/chat";
import { api } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export const CONVERSATIONS_CHANGED = "cf-conversations-changed";

const SIDEBAR_CLASS =
  "border-0 **:data-[slot=sidebar-inner]:overflow-hidden **:data-[slot=sidebar-inner]:rounded-2xl **:data-[slot=sidebar-inner]:ring-0";

interface ConversationRow {
  id: string;
  title: string;
  updatedAt: string;
}

export function AppSidebar() {
  return (
    <Suspense fallback={<AppSidebarFallback />}>
      <AppSidebarInner />
    </Suspense>
  );
}

function AppSidebarFallback() {
  return (
    <Sidebar collapsible="icon" variant="floating" className={SIDEBAR_CLASS}>
      <SidebarHeader className="gap-2">
        <Link href="/app" className="flex h-10 items-center overflow-hidden px-2">
          <BrandLogo />
        </Link>
      </SidebarHeader>
      <SidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}

function AppSidebarInner() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { setOpenMobile, state } = useSidebar();
  const activeId = path === "/app" ? params.get("c") : null;

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async () => {
    try {
      const qs = debounced ? `?limit=40&q=${encodeURIComponent(debounced)}` : "?limit=40";
      const payload = await api<{ conversations: ConversationRow[] }>(`/conversations${qs}`);
      setConversations(payload.conversations);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    void refresh();
  }, [refresh, path, params]);

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(CONVERSATIONS_CHANGED, onChange);
    return () => window.removeEventListener(CONVERSATIONS_CHANGED, onChange);
  }, [refresh]);

  const groups = useMemo(() => groupByDate(conversations), [conversations]);
  const collapsed = state === "collapsed";
  const onChat = path === "/app";
  const onCriteria = path.startsWith("/app/criteria");
  const onFarm = path.startsWith("/app/farm");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      document.getElementById("cf-chat-search")?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function goNew() {
    setOpenMobile(false);
    router.push("/app");
  }

  function goChat(id: string) {
    setOpenMobile(false);
    router.push(`/app?c=${encodeURIComponent(id)}`);
  }

  async function commitRename(id: string) {
    const title = draft.trim();
    setEditing(null);
    if (!title) return;
    setConversations((current) => current.map((row) => (row.id === id ? { ...row, title } : row)));
    try {
      await api(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    } catch {
      void refresh();
    }
  }

  async function remove(id: string) {
    setConversations((current) => current.filter((row) => row.id !== id));
    if (activeId === id) router.push("/app");
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
    } catch {
      void refresh();
    }
  }

  return (
    <Sidebar collapsible="icon" variant="floating" className={SIDEBAR_CLASS}>
      <SidebarHeader className="gap-3 px-2 pt-2">
        <Link
          href="/app"
          aria-label="CompliFine"
          onClick={() => setOpenMobile(false)}
          className="flex h-10 items-center overflow-hidden px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <BrandLogo collapsed={collapsed} />
        </Link>
        <Button
          size="sm"
          className="w-full justify-start rounded-xl group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={goNew}
        >
          <Plus className="size-4" />
          <span className="group-data-[collapsible=icon]:hidden">New chat</span>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={onChat}
                  tooltip="Chat"
                  className="rounded-xl"
                  onClick={() => setOpenMobile(false)}
                >
                  <Link href="/app">
                    <MessageSquare />
                    <span>Chat</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={onCriteria}
                  tooltip="Criteria"
                  className="rounded-xl"
                  onClick={() => setOpenMobile(false)}
                >
                  <Link href="/app/criteria">
                    <BookOpen />
                    <span>Criteria</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={onFarm}
                  tooltip="Farm"
                  className="rounded-xl"
                  onClick={() => setOpenMobile(false)}
                >
                  <Link href="/app/farm">
                    <Tractor />
                    <span>Farm</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="relative px-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
              <Input
                id="cf-chat-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search chats"
                className="h-9 rounded-xl border-sidebar-border bg-sidebar-accent pr-8 pl-8 text-sidebar-foreground placeholder:text-sidebar-foreground/40"
              />
              {query ? null : (
                <kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded-md border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] text-sidebar-foreground/40">
                  /
                </kbd>
              )}
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto px-1" aria-label="Chat history">
              {loading ? (
                <p className="flex items-center gap-2 px-2 py-3 text-xs text-sidebar-foreground/60">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading…
                </p>
              ) : conversations.length === 0 ? (
                <p className="px-3 py-4 text-xs text-sidebar-foreground/60">No conversations yet.</p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-3">
                    <p className="px-2 py-1 text-[10px] font-medium tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                      {group.label}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {group.items.map((item) => {
                        const active = item.id === activeId;
                        return (
                          <li key={item.id} className="group/item relative">
                            {editing === item.id ? (
                              <input
                                autoFocus
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                onBlur={() => void commitRename(item.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void commitRename(item.id);
                                  if (event.key === "Escape") setEditing(null);
                                }}
                                className="h-8 w-full rounded-md border border-sidebar-primary bg-sidebar px-2 text-sm text-sidebar-foreground outline-none"
                              />
                            ) : (
                              <div
                                role="button"
                                tabIndex={0}
                                aria-current={active ? "page" : undefined}
                                onClick={() => goChat(item.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") goChat(item.id);
                                }}
                                className={cn(
                                  "flex h-9 cursor-pointer items-center rounded-xl px-2.5 text-sm",
                                  active
                                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                <span className="hidden shrink-0 group-hover/item:flex group-focus-within/item:flex">
                                  <button
                                    type="button"
                                    aria-label={`Rename ${item.title}`}
                                    className="rounded p-1 hover:bg-sidebar"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditing(item.id);
                                      setDraft(item.title);
                                    }}
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${item.title}`}
                                    className="rounded p-1 hover:bg-sidebar"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void remove(item.id);
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
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
