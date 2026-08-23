"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rewriteAskQuestion } from "../ask-context.ts";
import { ChatApiError, ChatClient, createFetcher, type Fetcher } from "../client.ts";
import {
  conversationToJson,
  conversationToMarkdown,
  downloadText,
  slugTitle,
} from "../export.ts";
import { deepestDescendant, descendantsOf, historyFromPath, siblingsOf, walkPath } from "../thread.ts";
import { titleFromFirstMessage } from "../title.ts";
import type {
  AskStreamEvent,
  Attachment,
  ChatMessage,
  ChatMode,
  ChatTheme,
  ConversationSummary,
  SearchHit,
  ToolChip,
} from "../types.ts";
import {
  CHAR_LIMIT,
  DRAFT_KEY_PREFIX,
  ENTER_SEND_KEY,
  THEME_KEY,
} from "../types.ts";

const NEW_DRAFT_KEY = `${DRAFT_KEY_PREFIX}__new__`;

function nowIso(): string {
  return new Date().toISOString();
}

function blankAssistant(
  id: string,
  conversationId: string,
  parentId: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id,
    conversationId,
    parentId,
    role: "assistant",
    content: "",
    status: "pending",
    attachments: [],
    tools: [],
    hits: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...extra,
  };
}

function blankUser(
  id: string,
  conversationId: string,
  parentId: string | null,
  content: string,
  attachments: Attachment[],
): ChatMessage {
  return {
    id,
    conversationId,
    parentId,
    role: "user",
    content,
    status: "complete",
    attachments,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function applyEvent(message: ChatMessage, event: AskStreamEvent): ChatMessage {
  if (event.type === "tool-start") {
    return {
      ...message,
      status: "streaming",
      tools: [...(message.tools ?? []), { name: event.name, status: "running" }],
    };
  }
  if (event.type === "tool") {
    const tools = [...(message.tools ?? [])];
    const index = [...tools].reverse().findIndex((tool) => tool.name === event.name && tool.status === "running");
    const actual = index === -1 ? -1 : tools.length - 1 - index;
    const next: ToolChip = {
      name: event.name,
      status: event.error ? "error" : "done",
      durationMs: event.durationMs,
    };
    if (actual >= 0) tools[actual] = next;
    else tools.push(next);
    return { ...message, tools };
  }
  if (event.type === "text") {
    return {
      ...message,
      status: "streaming",
      content: message.content + event.text,
    };
  }
  if (event.type === "done") {
    return {
      ...message,
      content: event.answer,
      citations: [...event.citations],
      ungrounded: [...event.ungroundedCitations],
      tools: event.toolCalls.map((call) => ({
        name: call.name,
        status: call.error ? "error" : "done",
        durationMs: call.durationMs,
      })),
      status: "complete",
      durationMs: event.durationMs,
      runId: event.runId,
      error: null,
    };
  }
  if (event.type === "error") {
    return { ...message, status: "error", error: event.message };
  }
  return message;
}

function readTheme(): ChatTheme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function readEnterSend(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(ENTER_SEND_KEY) !== "false";
}

function resolvedTheme(theme: ChatTheme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export interface UseChatOptions {
  apiBase: string;
  fetchImpl?: typeof fetch;
  fetcher?: Fetcher;
  defaultMode?: ChatMode;
  defaultVersion?: string;
  defaultKind?: string;
  searchLimit?: number;
  siteId?: string;
  contextNote?: string;
  onFeedback?: (messageId: string, vote: "up" | "down" | null) => void;
}

export function useChat(options: UseChatOptions) {
  const client = useMemo(
    () => new ChatClient(options.fetcher ?? createFetcher(options.apiBase, options.fetchImpl)),
    [options.apiBase, options.fetchImpl, options.fetcher],
  );

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [banner, setBanner] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>(options.defaultMode ?? "answer");
  const [version, setVersion] = useState(options.defaultVersion ?? "all");
  const [kind, setKind] = useState(options.defaultKind ?? "requirements");
  const [theme, setThemeState] = useState<ChatTheme>(readTheme);
  const [enterSends, setEnterSendsState] = useState(readEnterSend);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sendLock = useRef(false);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const path = useMemo(() => walkPath(messages, activeLeafId), [messages, activeLeafId]);
  const lastAssistant = [...path].reverse().find((message) => message.role === "assistant") ?? null;
  const streaming = pending || lastAssistant?.status === "streaming" || lastAssistant?.status === "pending";

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(listQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [listQuery]);

  const refreshList = useCallback(
    async (reset = true) => {
      try {
        if (reset) setListLoading(true);
        else setListLoadingMore(true);
        const result = await client.listConversations({
          q: debouncedQuery || undefined,
          limit: 40,
          before: reset ? undefined : (nextCursor ?? undefined),
        });
        setConversations((current) => (reset ? result.conversations : [...current, ...result.conversations]));
        setNextCursor(result.nextCursor);
        setLoadError(null);
      } catch (error) {
        if (error instanceof ChatApiError && error.status === 401) {
          setLoadError(error.message);
        } else {
          setBanner(error instanceof Error ? error.message : "Could not load conversations.");
        }
      } finally {
        setListLoading(false);
        setListLoadingMore(false);
      }
    },
    [client, debouncedQuery, nextCursor],
  );

  useEffect(() => {
    void refreshList(true);
    // Intentionally re-run when the search query changes, not when nextCursor does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, debouncedQuery]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(ENTER_SEND_KEY, enterSends ? "true" : "false");
  }, [enterSends]);

  useEffect(() => {
    const key = activeId ? `${DRAFT_KEY_PREFIX}${activeId}` : NEW_DRAFT_KEY;
    const stored = window.localStorage.getItem(key);
    setDraft(stored ?? "");
    setAttachments([]);
  }, [activeId]);

  useEffect(() => {
    const key = activeId ? `${DRAFT_KEY_PREFIX}${activeId}` : NEW_DRAFT_KEY;
    window.localStorage.setItem(key, draft);
  }, [activeId, draft]);

  const patchMessage = useCallback((id: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)));
  }, []);

  const upsertConversation = useCallback((summary: ConversationSummary) => {
    setConversations((current) => {
      const rest = current.filter((item) => item.id !== summary.id);
      return [summary, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sendLock.current = false;
    setPending(false);
    setMessages((current) =>
      current.map((message) =>
        message.status === "streaming" || message.status === "pending"
          ? { ...message, status: "stopped" }
          : message,
      ),
    );
  }, []);

  const newChat = useCallback(() => {
    stop();
    setActiveId(null);
    setMessages([]);
    setActiveLeafId(null);
    setDraft(window.localStorage.getItem(NEW_DRAFT_KEY) ?? "");
    setAttachments([]);
    setBanner(null);
    setSidebarOpen(false);
  }, [stop]);

  const openConversation = useCallback(
    async (id: string) => {
      stop();
      setActiveId(id);
      setSidebarOpen(false);
      try {
        const detail = await client.getConversation(id);
        setMessages(detail.messages);
        setActiveLeafId(detail.activeLeafId);
        upsertConversation(detail);
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Could not open that conversation.");
      }
    },
    [client, stop, upsertConversation],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const next = title.trim() || "New chat";
      setConversations((current) => current.map((item) => (item.id === id ? { ...item, title: next } : item)));
      try {
        await client.patchConversation(id, { title: next });
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Could not rename.");
        void refreshList(true);
      }
    },
    [client, refreshList],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      setConversations((current) => current.filter((item) => item.id !== id));
      if (activeId === id) newChat();
      try {
        await client.deleteConversation(id);
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Could not delete.");
        void refreshList(true);
      }
    },
    [activeId, client, newChat, refreshList],
  );

  const selectBranch = useCallback(
    async (messageId: string) => {
      const leaf = deepestDescendant(messages, messageId);
      setActiveLeafId(leaf);
      if (!activeId) return;
      try {
        await client.patchConversation(activeId, { activeLeafId: leaf });
      } catch {
        // local navigation still works
      }
    },
    [activeId, client, messages],
  );

  const cycleBranch = useCallback(
    (messageId: string, delta: number) => {
      const versions = siblingsOf(messages, messageId);
      if (versions.length < 2) return;
      const index = versions.findIndex((item) => item.id === messageId);
      const next = versions[(index + delta + versions.length) % versions.length];
      if (next) void selectBranch(next.id);
    },
    [messages, selectBranch],
  );

  const setFeedback = useCallback(
    async (messageId: string, vote: "up" | "down" | null) => {
      patchMessage(messageId, (message) => ({ ...message, feedback: vote }));
      options.onFeedback?.(messageId, vote);
      if (!activeId) return;
      try {
        await client.patchMessage(activeId, messageId, { feedback: vote });
      } catch {
        // hook still fired
      }
    },
    [activeId, client, options, patchMessage],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const removed = new Set(descendantsOf(messages, messageId));
      const remaining = messages.filter((message) => !removed.has(message.id));
      setMessages(remaining);
      const nextLeaf = remaining.at(-1)?.id ?? null;
      setActiveLeafId(nextLeaf);
      if (!activeId) return;
      try {
        await client.deleteMessage(activeId, messageId);
        if (nextLeaf) await client.patchConversation(activeId, { activeLeafId: nextLeaf });
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Could not delete the message.");
      }
    },
    [activeId, client, messages],
  );

  const exportActive = useCallback(
    (format: "markdown" | "json") => {
      const summary =
        conversations.find((item) => item.id === activeId) ??
        ({
          id: activeId ?? "draft",
          title: titleFromFirstMessage(path.find((m) => m.role === "user")?.content ?? "New chat"),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          activeLeafId,
        } satisfies ConversationSummary);
      const slug = slugTitle(summary.title);
      if (format === "json") {
        downloadText(`${slug}.json`, conversationToJson(summary, messages), "application/json");
      } else {
        downloadText(`${slug}.md`, conversationToMarkdown(summary, messages), "text/markdown");
      }
    },
    [activeId, activeLeafId, conversations, messages, path],
  );

  const runSearch = useCallback(
    async (question: string, assistantId: string) => {
      try {
        const result = await client.search({
          q: question,
          version,
          kind,
          limit: options.searchLimit ?? 8,
        });
        patchMessage(assistantId, (message) => ({
          ...message,
          hits: result.hits,
        }));
        return result.hits;
      } catch {
        return [] as SearchHit[];
      }
    },
    [client, kind, options.searchLimit, patchMessage, version],
  );

  const send = useCallback(
    async (raw: string, opts?: { parentId?: string | null; editOf?: string; regenerateOf?: string }) => {
      const question = raw.trim();
      if (question.length < 2) return;
      if (sendLock.current || pending) return;
      if (offline) {
        setBanner("You are offline. Reconnect to send.");
        return;
      }

      if (question.startsWith("/")) {
        const [command, ...rest] = question.slice(1).split(/\s+/);
        if (command === "new") {
          setDraft("");
          newChat();
          return;
        }
        if (command === "export") {
          exportActive(rest[0] === "json" ? "json" : "markdown");
          setDraft("");
          return;
        }
      }

      sendLock.current = true;
      setPending(true);
      setBanner(null);

      const conversationId = activeId ?? crypto.randomUUID();
      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();
      const parentId =
        opts?.parentId !== undefined
          ? opts.parentId
          : opts?.regenerateOf
            ? (messages.find((m) => m.id === opts.regenerateOf)?.parentId ?? null)
            : (activeLeafId ?? null);

      const userMessage = opts?.regenerateOf
        ? null
        : blankUser(userId, conversationId, parentId, question, attachments);
      const assistantParent = userMessage ? userId : parentId;
      const assistantMessage = blankAssistant(assistantId, conversationId, assistantParent!, {
        status: mode === "answer" ? "pending" : "complete",
      });

      setMessages((current) => [...current, ...(userMessage ? [userMessage] : []), assistantMessage]);
      setActiveLeafId(assistantId);
      if (!activeId) {
        setActiveId(conversationId);
        upsertConversation({
          id: conversationId,
          title: titleFromFirstMessage(question),
          createdAt: nowIso(),
          updatedAt: nowIso(),
          activeLeafId: assistantId,
        });
      }
      setDraft("");
      setAttachments([]);
      window.localStorage.removeItem(activeId ? `${DRAFT_KEY_PREFIX}${activeId}` : NEW_DRAFT_KEY);

      const historySource = walkPath(
        [...messages, ...(userMessage ? [userMessage] : [])],
        userMessage ? userId : parentId,
      );
      const history = historyFromPath(historySource.slice(0, -1));

      const asked = rewriteAskQuestion({
        question,
        version,
        contextNote: options.contextNote,
      });
      const attachmentNote =
        attachments.length > 0
          ? `\n\n${attachments.map((file) => `[attached: ${file.name}]`).join("\n")}`
          : "";

      const hitsPromise = runSearch(question, assistantId);

      if (mode === "passages") {
        const hits = await hitsPromise;
        patchMessage(assistantId, (message) => ({
          ...message,
          status: "complete",
          hits,
          content: hits.length ? `${hits.length} passages from the ingested documents.` : "No passages found.",
        }));
        try {
          if (!activeId) {
            await client.createConversation(titleFromFirstMessage(question), conversationId);
          }
          if (userMessage) {
            await client.appendMessage(conversationId, {
              id: userId,
              parentId,
              role: "user",
              content: question,
              attachments: userMessage.attachments,
            });
          }
          await client.appendMessage(conversationId, {
            id: assistantId,
            parentId: assistantParent,
            role: "assistant",
            content: hits.length ? `${hits.length} passages from the ingested documents.` : "No passages found.",
            hits,
          });
        } catch (error) {
          setBanner(error instanceof Error ? error.message : "Could not save this turn.");
        }
        sendLock.current = false;
        setPending(false);
        void refreshList(true);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await client.streamAsk(
          {
            question: asked + attachmentNote,
            conversationId,
            parentId: userMessage ? parentId : assistantParent,
            userMessageId: userMessage ? userId : undefined,
            assistantMessageId: assistantId,
            history,
            attachments: userMessage?.attachments,
            skipUser: !userMessage,
            userContent: question,
            siteId: options.siteId || undefined,
          },
          (event) => {
            if (event.type === "start") {
              if (event.conversationId && event.conversationId !== conversationId) {
                setActiveId(event.conversationId);
              }
              return;
            }
            patchMessage(assistantId, (message) => applyEvent(message, event));
          },
          controller.signal,
        );
        await hitsPromise;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          patchMessage(assistantId, (message) => ({
            ...message,
            status: "stopped",
          }));
        } else {
          const message = error instanceof ChatApiError ? error.message : (error as Error).message;
          patchMessage(assistantId, (current) => ({
            ...current,
            status: "error",
            error: message,
          }));
        }
      } finally {
        abortRef.current = null;
        sendLock.current = false;
        setPending(false);
        patchMessage(assistantId, (message) =>
          message.status === "streaming" || message.status === "pending"
            ? { ...message, status: message.content ? "stopped" : "error", error: message.error ?? "Stopped." }
            : message,
        );
        void refreshList(true);
      }
    },
    [
      activeId,
      activeLeafId,
      attachments,
      client,
      exportActive,
      messages,
      mode,
      newChat,
      offline,
      patchMessage,
      pending,
      refreshList,
      runSearch,
      upsertConversation,
      version,
      options.siteId,
      options.contextNote,
    ],
  );

  const retry = useCallback(
    (assistantId: string) => {
      const assistant = messages.find((message) => message.id === assistantId);
      const user = messages.find((message) => message.id === assistant?.parentId);
      if (!user) return;
      void send(user.content, { regenerateOf: assistantId });
    },
    [messages, send],
  );

  const regenerate = useCallback(
    (assistantId: string) => {
      const assistant = messages.find((message) => message.id === assistantId);
      const user = messages.find((message) => message.id === assistant?.parentId);
      if (!user) return;
      void send(user.content, { regenerateOf: assistantId });
    },
    [messages, send],
  );

  const editAndResubmit = useCallback(
    (userMessageId: string, nextContent: string) => {
      const user = messages.find((message) => message.id === userMessageId);
      if (!user) return;
      void send(nextContent, { parentId: user.parentId, editOf: userMessageId });
    },
    [messages, send],
  );

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const next: Attachment[] = [];
    for (const file of list) {
      if (file.size > 4 * 1024 * 1024) {
        setBanner(`${file.name} is larger than 4 MB.`);
        continue;
      }
      const kind = file.type.startsWith("image/") ? "image" : "file";
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        kind,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      };
      if (kind === "image") {
        attachment.dataUrl = await readAsDataUrl(file);
      }
      next.push(attachment);
    }
    if (next.length) setAttachments((current) => [...current, ...next]);
  }, []);

  return {
    client,
    conversations,
    nextCursor,
    listLoading,
    listLoadingMore,
    listQuery,
    setListQuery,
    loadMore: () => void refreshList(false),
    refreshList: () => void refreshList(true),
    activeId,
    messages,
    path,
    activeLeafId,
    lastAssistant,
    draft,
    setDraft,
    attachments,
    setAttachments,
    addFiles,
    pending,
    streaming,
    offline,
    banner,
    setBanner,
    mode,
    setMode,
    version,
    setVersion,
    kind,
    setKind,
    theme,
    setTheme: setThemeState,
    resolvedTheme: resolvedTheme(theme),
    enterSends,
    setEnterSends: setEnterSendsState,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    artifactOpen,
    setArtifactOpen,
    loadError,
    charCount: draft.length,
    overLimit: draft.length > CHAR_LIMIT,
    send: (text?: string) => void send(text ?? draft),
    stop,
    newChat,
    openConversation,
    renameConversation,
    deleteConversation,
    selectBranch,
    cycleBranch,
    setFeedback,
    deleteMessage,
    retry,
    regenerate,
    editAndResubmit,
    exportActive,
    siblingsOf: (id: string) => siblingsOf(messages, id),
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export type ChatController = ReturnType<typeof useChat>;
