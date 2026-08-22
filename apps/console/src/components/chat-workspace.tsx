"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, LoaderCircle, Plus, Square } from "lucide-react";
import { api } from "@/lib/api";
import {
  streamAsk,
  type AskStreamEvent,
  type ChatTurn,
  type Citation,
  type SearchHit,
  type SearchResponse,
} from "@/lib/chat";
import { useCertScope } from "@/components/cert-scope";
import { AnswerArticle } from "@/components/answer-article";
import { SourcesPanel } from "@/components/sources-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "When can workers go back into a field after spraying?",
  "Is irrigation water testing a Major Must?",
  "What changes between Smart and GFS for crop protection?",
  "Certificate validity extension in the General Regulations",
];

type Mode = "answer" | "passages";
type KindFilter = "requirements" | "regulations";

interface ToolChip {
  name: string;
  status: "running" | "done" | "error";
  durationMs?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  tools?: ToolChip[];
  citations?: Citation[];
  ungrounded?: Citation[];
  hits?: SearchHit[];
  searching?: boolean;
  error?: string;
  durationMs?: number;
  runId?: string;
  strategy?: string;
  embedder?: string | null;
  searchMs?: number;
}

export function ChatWorkspace() {
  const { versions } = useCertScope();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("answer");
  const [edition, setEdition] = useState("all");
  const [kind, setKind] = useState<KindFilter>("requirements");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setMessages((current) =>
      current.map((message) =>
        message.streaming ? { ...message, streaming: false } : message,
      ),
    );
  }

  function reset() {
    stop();
    setMessages([]);
    setConversationId(undefined);
    setDraft("");
  }

  function patchAssistant(id: string, patch: (message: Message) => Message) {
    setMessages((current) =>
      current.map((message) => (message.id === id ? patch(message) : message)),
    );
  }

  async function send(text: string) {
    const question = text.trim();
    if (question.length < 2 || pending) return;

    const history: ChatTurn[] = messages
      .filter((message) => message.content.trim().length > 0 && !message.error)
      .map((message) => ({ role: message.role, content: message.content }));

    const assistantId = crypto.randomUUID();

    setDraft("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: question },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: mode === "answer",
        tools: [],
        hits: [],
        searching: true,
      },
    ]);
    setPending(true);

    const version = edition === "all" ? undefined : edition;
    const searchQuery = new URLSearchParams({
      q: question,
      kind,
      limit: "8",
    });
    if (version) searchQuery.set("version", version);

    const searchPromise = api<SearchResponse>(`/search?${searchQuery}`)
      .then((result) => {
        patchAssistant(assistantId, (message) => ({
          ...message,
          hits: result.hits,
          searching: false,
          strategy: result.strategy,
          embedder: result.embedder,
          searchMs: result.durationMs,
        }));
      })
      .catch(() => {
        patchAssistant(assistantId, (message) => ({ ...message, searching: false }));
      });

    if (mode === "passages") {
      await searchPromise;
      patchAssistant(assistantId, (message) => ({
        ...message,
        streaming: false,
        searching: false,
      }));
      setPending(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const selected = versions.find((item) => item.code === edition);
    const asked =
      edition === "all" || !selected
        ? question
        : `${question}\n\nUse the ${selected.name} version unless I named another.`;

    try {
      await streamAsk(
        { question: asked, conversationId, history },
        (event) => {
          if (event.type === "start") {
            setConversationId(event.conversationId);
            patchAssistant(assistantId, (message) => ({ ...message, runId: event.runId }));
            return;
          }
          patchAssistant(assistantId, (message) => applyEvent(message, event));
        },
        controller.signal,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      patchAssistant(assistantId, (message) => ({
        ...message,
        streaming: false,
        searching: false,
        error: (error as Error).message,
      }));
    } finally {
      abortRef.current = null;
      setPending(false);
      patchAssistant(assistantId, (message) => ({ ...message, streaming: false }));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(draft);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="-m-6 flex h-[calc(100svh-3rem)] min-w-0 flex-col overflow-hidden bg-background">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div id="tour-search">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            Retrieval debug
          </p>
          <h1 className="font-heading text-lg font-medium tracking-tight">Search</h1>
        </div>
        <div className="flex items-center gap-2">
          <ModeSwitch mode={mode} onChange={setMode} disabled={pending} />
          {messages.length > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <Plus />
              New
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <EmptyState onPick={(value) => void send(value)} />
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-8">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <UserBubble key={message.id} text={message.content} />
                  ) : (
                    <AssistantTurn key={message.id} message={message} />
                  ),
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="border-t px-5 py-4">
            <Composer
              draft={draft}
              onChange={setDraft}
              onSend={() => void send(draft)}
              onStop={stop}
              onKeyDown={onKeyDown}
              pending={pending}
              edition={edition}
              onEdition={setEdition}
              versions={versions}
              kind={kind}
              onKind={setKind}
            />
          </div>
        </div>

        <div className="hidden min-w-0 w-80 shrink-0 overflow-x-hidden xl:block 2xl:w-96">
          <SourcesPanel
            hits={lastAssistant?.hits ?? []}
            citations={lastAssistant?.citations ?? []}
            loading={lastAssistant?.searching}
            strategy={lastAssistant?.strategy}
            embedder={lastAssistant?.embedder}
            searchMs={lastAssistant?.searchMs}
          />
        </div>
      </div>
    </div>
  );
}

function applyEvent(message: Message, event: AskStreamEvent): Message {
  if (event.type === "tool-start") {
    return {
      ...message,
      tools: [...(message.tools ?? []), { name: event.name, status: "running" }],
    };
  }
  if (event.type === "tool") {
    const tools = [...(message.tools ?? [])];
    const index = [...tools]
      .reverse()
      .findIndex((tool) => tool.name === event.name && tool.status === "running");
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
    return { ...message, content: message.content + event.text };
  }
  if (event.type === "done") {
    return {
      ...message,
      content: event.answer,
      citations: [...event.citations],
      ungrounded: [...event.ungroundedCitations],
      streaming: false,
      durationMs: event.durationMs,
      runId: event.runId,
    };
  }
  if (event.type === "error") {
    return { ...message, streaming: false, error: event.message };
  }
  return message;
}

function EmptyState({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col justify-center gap-8 px-5 py-16">
      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-medium tracking-tight">
          Probe the index, then the agent.
        </h2>
        <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
          Same streaming answer the user app sees — summary, cited rule, farm reading — with
          ranks, tool names and timings on the side. Passages skips generation.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-xl border bg-card px-4 py-3 text-left text-sm leading-snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(85%,100%)] min-w-0 rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed wrap-anywhere text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({ message }: { message: Message }) {
  const tools = message.tools ?? [];
  const passagesOnly = !message.streaming && !message.content && (message.hits?.length ?? 0) > 0;
  const meta = [
    message.runId ? `run ${message.runId.slice(0, 8)}` : null,
    message.durationMs !== undefined ? `${message.durationMs}ms` : null,
    message.strategy,
    message.embedder,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {tools.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((tool, index) => (
            <span
              key={`${tool.name}-${index}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px]",
                tool.status === "running" && "bg-muted text-foreground",
                tool.status === "done" && "bg-muted/50 text-muted-foreground",
                tool.status === "error" && "bg-destructive/15 text-destructive",
              )}
            >
              {tool.status === "running" ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : null}
              {tool.name}
              {tool.durationMs !== undefined ? ` ${tool.durationMs}ms` : ""}
            </span>
          ))}
        </div>
      ) : message.streaming && !message.content ? (
        <p className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          tool loop…
        </p>
      ) : null}

      {message.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not answer</AlertTitle>
          <AlertDescription>{message.error}</AlertDescription>
        </Alert>
      ) : null}

      {message.content ? (
        <AnswerArticle text={message.content} streaming={message.streaming} />
      ) : null}

      {meta.length > 0 && !message.streaming ? (
        <p className="font-mono text-[10px] text-muted-foreground">{meta.join(" · ")}</p>
      ) : null}

      {message.ungrounded && message.ungrounded.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Ungrounded citations</AlertTitle>
          <AlertDescription>
            {message.ungrounded.map((citation) => citation.raw).join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}

      {passagesOnly ? (
        <p className="text-sm text-muted-foreground">
          {(message.hits ?? []).length} hits. Ranks are in the retrieval pane.
        </p>
      ) : null}

      {message.hits && message.hits.length > 0 ? (
        <div className="xl:hidden">
          <SourcesPanel
            hits={message.hits}
            citations={message.citations ?? []}
            strategy={message.strategy}
            embedder={message.embedder}
            searchMs={message.searchMs}
          />
        </div>
      ) : null}
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
  disabled,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5 font-mono text-[11px]">
      {(
        [
          { id: "answer", label: "Answer" },
          { id: "passages", label: "Passages" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-md px-2.5 py-1 transition-colors",
            mode === item.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Composer({
  draft,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  pending,
  edition,
  onEdition,
  versions,
  kind,
  onKind,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  pending: boolean;
  edition: string;
  onEdition: (value: string) => void;
  versions: Array<{ code: string; name: string }>;
  kind: KindFilter;
  onKind: (value: KindFilter) => void;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl rounded-xl border bg-card p-2">
      <Textarea
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Ask a requirement, or paste an identifier…"
        className="min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-1">
          <Select value={edition} onValueChange={onEdition}>
            <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-2 font-mono text-[11px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All in view</SelectItem>
              {versions.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={(value) => onKind(value as KindFilter)}>
            <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-2 font-mono text-[11px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="requirements">Criteria</SelectItem>
              <SelectItem value="regulations">Regulations</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {pending ? (
          <Button type="button" size="sm" variant="secondary" onClick={onStop}>
            <Square className="size-3 fill-current" />
            Stop
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={onSend} disabled={draft.trim().length < 2}>
            <ArrowUp />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
