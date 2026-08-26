export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "pending" | "streaming" | "complete" | "error" | "stopped";
export type ChatMode = "answer" | "passages";
export type ChatTheme = "light" | "dark" | "system";

export interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
  mime: string;
  dataUrl?: string;
}

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
  lexicalRank?: number | null;
  semanticRank?: number | null;
  authority?: string;
}

export interface SearchResponse {
  strategy: string;
  durationMs: number;
  embedder?: string | null;
  hits: SearchHit[];
}

export interface ToolChip {
  name: string;
  status: "running" | "done" | "error";
  durationMs?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  parentId: string | null;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  attachments: Attachment[];
  citations?: Citation[] | null;
  ungrounded?: Citation[] | null;
  tools?: ToolChip[] | null;
  hits?: SearchHit[] | null;
  error?: string | null;
  runId?: string | null;
  durationMs?: number | null;
  feedback?: "up" | "down" | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeLeafId: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AskStreamEvent =
  | {
      type: "start";
      runId: string;
      conversationId: string;
      userMessageId?: string;
      assistantMessageId?: string;
    }
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
  | { type: "error"; message: string }
  | { type: "heartbeat" };

export interface SelectOption {
  value: string;
  label: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export const CHAR_LIMIT = 8000;
export const CHAR_WARN_AT = 7200;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const VIRTUALIZE_AFTER = 40;
export const DRAFT_KEY_PREFIX = "cf-chat-draft:";
export const THEME_KEY = "cf-chat-theme";
export const ENTER_SEND_KEY = "cf-chat-enter-send";
export const SITE_KEY = "cf-chat-site";
