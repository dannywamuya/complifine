import { apiBase, ApiError } from "@/lib/api";

export interface Citation {
  raw: string;
  criterionId: string | null;
  kind: string;
}

export interface SearchHit {
  criterion: string | null;
  level: string | null;
  heading: string | null;
  section: string | null;
  edition: string;
  document: string;
  page: number | null;
  text: string;
  score: number;
  lexicalRank: number | null;
  semanticRank: number | null;
}

export interface SearchResponse {
  strategy: string;
  durationMs: number;
  embedder: string | null;
  hits: SearchHit[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AskStreamEvent =
  | { type: "start"; runId: string; conversationId: string }
  | { type: "tool-start"; name: string }
  | { type: "tool"; name: string; args: unknown; durationMs: number; error?: string }
  | { type: "text"; text: string }
  | {
      type: "done";
      runId: string;
      conversationId: string;
      answer: string;
      citations: Citation[];
      ungroundedCitations: Citation[];
      toolCalls: Array<{ name: string; args: unknown; durationMs: number; error?: string }>;
      durationMs: number;
    }
  | { type: "error"; message: string };

export interface AnswerSections {
  summary: string;
  detail: string;
  practical: string;
}

const HEADING = /^##\s+(.+?)\s*$/;
const SUMMARY_TITLE = /^(at a glance|summary|in short)$/i;
const DETAIL_TITLE = /^(what the standard says|the standard|detail|details)$/i;
const PRACTICAL_TITLE = /^(what this means|on the farm|in practice)$/i;

/** Keep in step with `parseAnswerSections` in packages/ai/src/agent/prompt.ts. */
export function parseAnswerSections(answer: string): AnswerSections {
  const trimmed = answer.trim();
  if (!trimmed) return { summary: "", detail: "", practical: "" };

  const blocks: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of trimmed.split("\n")) {
    const match = HEADING.exec(line);
    if (match) {
      if (current) {
        blocks.push({ title: current.title, body: current.lines.join("\n").trim() });
      }
      current = { title: match[1]!.trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) {
    blocks.push({ title: current.title, body: current.lines.join("\n").trim() });
  }

  if (blocks.length === 0) {
    const paragraphs = trimmed.split(/\n{2,}/);
    return {
      summary: paragraphs[0] ?? "",
      detail: paragraphs.slice(1).join("\n\n"),
      practical: "",
    };
  }

  let summary = "";
  let detail = "";
  let practical = "";
  const extra: string[] = [];

  for (const block of blocks) {
    if (SUMMARY_TITLE.test(block.title)) summary = block.body;
    else if (DETAIL_TITLE.test(block.title)) detail = block.body;
    else if (PRACTICAL_TITLE.test(block.title)) practical = block.body;
    else extra.push(`## ${block.title}\n\n${block.body}`.trim());
  }

  const lead = preamble.join("\n").trim();
  if (!summary) summary = lead;
  else if (lead) extra.unshift(lead);

  if (extra.length > 0) {
    detail = [detail, ...extra].filter(Boolean).join("\n\n");
  }

  return { summary, detail, practical };
}

export async function streamAsk(
  body: {
    question: string;
    conversationId?: string;
    siteId?: string;
    history?: ChatTurn[];
  },
  onEvent: (event: AskStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${apiBase()}/ask/stream`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // keep the status line
    }
    throw new ApiError(response.status, message);
  }

  if (!response.body) throw new Error("The API returned an empty stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (event) onEvent(event);
    }
  }
}

function parseSseFrame(frame: string): AskStreamEvent | null {
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return JSON.parse(data) as AskStreamEvent;
  } catch {
    return null;
  }
}
