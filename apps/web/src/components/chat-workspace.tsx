"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, LoaderCircle, Plus, Sparkles, Square } from "lucide-react";
import { api } from "@/lib/api";
import {
  streamAsk,
  toolLabel,
  type AskStreamEvent,
  type ChatTurn,
  type Citation,
  type SearchHit,
  type SearchResponse,
} from "@/lib/chat";
import { EDITIONS } from "@/lib/editions";
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
  "Do harvest hygiene rules still apply if we don't harvest?",
];

type Mode = "answer" | "passages";
type EditionFilter = "both" | "ifa-v6-smart-fv" | "ifa-v6-gfs-fv";

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
}

export function ChatWorkspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<Mode>("answer");
  const [edition, setEdition] = useState<EditionFilter>("both");
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

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();

    setDraft("");
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: question },
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

    const version = edition === "both" ? undefined : edition;
    const searchQuery = new URLSearchParams({
      q: question,
      kind: "requirements",
      limit: "6",
    });
    if (version) searchQuery.set("version", version);

    const searchPromise = api<SearchResponse>(`/search?${searchQuery}`)
      .then((result) => {
        patchAssistant(assistantId, (message) => ({
          ...message,
          hits: result.hits,
          searching: false,
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

    const asked =
      edition === "both"
        ? question
        : `${question}\n\nUse the ${edition === "ifa-v6-gfs-fv" ? "IFA v6 GFS" : "IFA v6 Smart"} edition unless I named the other.`;

    try {
      await streamAsk(
        { question: asked, conversationId, history },
        (event) => {
          if (event.type === "start") {
            setConversationId(event.conversationId);
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
    <div className="flex h-[calc(100svh-3.5rem)] min-w-0 w-full flex-col overflow-hidden bg-[#f6f4ef]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(24 24 27 / 0.08) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />

      <header className="relative z-10 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-950/5 bg-[#f6f4ef]/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div>
          <p className="text-[11px] font-medium tracking-[0.16em] text-emerald-900/50 uppercase">
            IFA v6 Fruit &amp; Vegetables
          </p>
          <h1 className="font-heading text-lg font-medium tracking-tight text-zinc-900">
            Ask the standard
          </h1>
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

      <div className="relative z-10 mx-auto flex min-h-0 min-w-0 w-full max-w-6xl flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <EmptyState onPick={(value) => void send(value)} />
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
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

          <div className="px-4 pb-5 sm:px-6">
            <Composer
              draft={draft}
              onChange={setDraft}
              onSend={() => void send(draft)}
              onStop={stop}
              onKeyDown={onKeyDown}
              pending={pending}
              edition={edition}
              onEdition={setEdition}
            />
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              Answers are grounded in retrieved GLOBALG.A.P. text. Your certification body decides
              binding cases.
            </p>
          </div>
        </div>

        <div className="hidden min-w-0 w-80 shrink-0 overflow-x-hidden lg:block xl:w-96">
          <SourcesPanel
            hits={lastAssistant?.hits ?? []}
            citations={lastAssistant?.citations ?? []}
            loading={lastAssistant?.searching}
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
    };
  }
  if (event.type === "error") {
    return { ...message, streaming: false, error: event.message };
  }
  return message;
}

function EmptyState({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col justify-center gap-8 px-4 py-16">
      <div className="space-y-3">
        <div className="inline-flex size-10 items-center justify-center rounded-2xl bg-emerald-900 text-emerald-50 shadow-sm">
          <Sparkles className="size-4" />
        </div>
        <h2 className="font-heading text-3xl font-medium tracking-tight text-zinc-900 sm:text-4xl">
          Ask in the words you would use on the farm.
        </h2>
        <p className="max-w-lg text-base leading-relaxed text-zinc-600">
          You get a short summary, the rule as published, and the passages it came from.
          Nothing is answered from memory.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-2xl border border-zinc-950/8 bg-white/70 px-4 py-3 text-left text-sm leading-snug text-zinc-700 shadow-sm transition-colors hover:border-emerald-900/20 hover:bg-white"
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
      <div className="max-w-[min(85%,100%)] min-w-0 rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-[15px] leading-relaxed wrap-anywhere text-zinc-50">
        {text}
      </div>
    </div>
  );
}

function AssistantTurn({ message }: { message: Message }) {
  const tools = message.tools ?? [];
  const passagesOnly = !message.streaming && !message.content && (message.hits?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {tools.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tools.map((tool, index) => (
            <span
              key={`${tool.name}-${index}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                tool.status === "running" && "bg-emerald-900/8 text-emerald-950",
                tool.status === "done" && "bg-white/80 text-zinc-600 ring-1 ring-zinc-950/5",
                tool.status === "error" && "bg-red-50 text-red-800",
              )}
            >
              {tool.status === "running" ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : null}
              {toolLabel(tool.name)}
            </span>
          ))}
        </div>
      ) : message.streaming && !message.content ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <LoaderCircle className="size-3.5 animate-spin" />
          Looking it up in the published standard…
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

      {message.ungrounded && message.ungrounded.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Ungrounded citations</AlertTitle>
          <AlertDescription>
            {message.ungrounded.map((citation) => citation.raw).join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}

      {passagesOnly ? (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            {(message.hits ?? []).length} passages from the ingested documents.
          </p>
          <div className="lg:hidden">
            {(message.hits ?? []).map((hit, index) => (
              <p key={`${hit.criterion}-${index}`} className="text-sm leading-relaxed text-zinc-700">
                <span className="font-mono font-medium">{hit.criterion ?? hit.heading}</span>
                {hit.level ? ` · ${hit.level}` : ""}
                <span className="mt-1 block text-zinc-600">{hit.text}</span>
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {message.hits && message.hits.length > 0 && message.content ? (
        <div className="lg:hidden">
          <SourcesPanel hits={message.hits} citations={message.citations ?? []} />
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
    <div className="flex rounded-full bg-zinc-900/5 p-0.5 text-xs font-medium">
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
            "rounded-full px-3 py-1 transition-colors",
            mode === item.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
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
}: {
  draft: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  pending: boolean;
  edition: EditionFilter;
  onEdition: (value: EditionFilter) => void;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl rounded-3xl border border-zinc-950/8 bg-white/90 p-2 shadow-[0_12px_40px_rgb(24,24,27,0.08)] backdrop-blur">
      <Textarea
        value={draft}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Ask a question, or paste a criterion number…"
        className="min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
      />
      <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
        <Select value={edition} onValueChange={(value) => onEdition(value as EditionFilter)}>
          <SelectTrigger className="h-7 w-auto gap-1 border-0 bg-transparent px-2 text-xs shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">Both editions</SelectItem>
            {EDITIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending ? (
          <Button type="button" size="sm" variant="secondary" onClick={onStop}>
            <Square className="size-3 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onSend}
            disabled={draft.trim().length < 2}
            className="rounded-full bg-emerald-900 text-emerald-50 hover:bg-emerald-800"
          >
            <ArrowUp />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
