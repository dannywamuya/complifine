import type {
  AskStreamEvent,
  Attachment,
  ChatMessage,
  ChatTurn,
  ConversationDetail,
  ConversationSummary,
  SearchResponse,
} from "./types.ts";
import { friendlyError, readSseStream } from "./sse.ts";

export class ChatApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export function createFetcher(apiBase: string, fetchImpl: typeof fetch = fetch): Fetcher {
  const base = apiBase.replace(/\/$/, "");
  let refreshInFlight: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = fetchImpl(`${base}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  return async (path, init) => {
    const send = () =>
      fetchImpl(`${base}${path}`, {
        credentials: "include",
        cache: "no-store",
        ...init,
      });
    let response = await send();
    if (response.status === 401 && path !== "/auth/refresh") {
      if (await refresh()) response = await send();
    }
    return response;
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return friendlyError(response.status, JSON.stringify(body));
  } catch {
    try {
      return friendlyError(response.status, await response.text());
    } catch {
      return friendlyError(response.status, `${response.status} ${response.statusText}`);
    }
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new ChatApiError(response.status, await readError(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export class ChatClient {
  constructor(private readonly fetchPath: Fetcher) {}

  async listConversations(opts?: { q?: string; limit?: number; before?: string }) {
    const query = new URLSearchParams();
    if (opts?.q) query.set("q", opts.q);
    if (opts?.limit) query.set("limit", String(opts.limit));
    if (opts?.before) query.set("before", opts.before);
    const suffix = query.size ? `?${query}` : "";
    return parse<{ conversations: ConversationSummary[]; nextCursor: string | null }>(
      await this.fetchPath(`/conversations${suffix}`),
    );
  }

  async getConversation(id: string) {
    return parse<ConversationDetail>(await this.fetchPath(`/conversations/${id}`));
  }

  async createConversation(title?: string, id?: string) {
    return parse<ConversationSummary>(
      await this.fetchPath("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, id }),
      }),
    );
  }

  async patchConversation(id: string, body: { title?: string; activeLeafId?: string | null }) {
    return parse<ConversationSummary>(
      await this.fetchPath(`/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async deleteConversation(id: string) {
    return parse<{ ok: boolean }>(
      await this.fetchPath(`/conversations/${id}`, { method: "DELETE" }),
    );
  }

  async appendMessage(
    conversationId: string,
    body: {
      id?: string;
      parentId?: string | null;
      role: ChatMessage["role"];
      content: string;
      status?: ChatMessage["status"];
      attachments?: Attachment[];
      hits?: unknown;
      error?: string;
    },
  ) {
    return parse<ChatMessage>(
      await this.fetchPath(`/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async patchMessage(
    conversationId: string,
    messageId: string,
    body: {
      feedback?: "up" | "down" | null;
      content?: string;
      hits?: unknown;
      status?: ChatMessage["status"];
    },
  ) {
    return parse<ChatMessage>(
      await this.fetchPath(`/conversations/${conversationId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  async deleteMessage(conversationId: string, messageId: string) {
    return parse<{ ok: boolean; deleted: string[] }>(
      await this.fetchPath(`/conversations/${conversationId}/messages/${messageId}`, {
        method: "DELETE",
      }),
    );
  }

  async search(query: {
    q: string;
    version?: string;
    kind?: string;
    limit?: number;
  }): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query.q, limit: String(query.limit ?? 8) });
    if (query.version && query.version !== "all") params.set("version", query.version);
    if (query.kind) params.set("kind", query.kind);
    return parse<SearchResponse>(await this.fetchPath(`/search?${params}`));
  }

  async streamAsk(
    body: {
      question: string;
      conversationId?: string;
      parentId?: string | null;
      userMessageId?: string;
      assistantMessageId?: string;
      siteId?: string;
      history?: ChatTurn[];
      attachments?: Attachment[];
      skipUser?: boolean;
      userContent?: string;
    },
    onEvent: (event: AskStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchPath("/ask/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw new ChatApiError(response.status, await readError(response));
    }
    if (!response.body) throw new ChatApiError(502, "The API returned an empty stream.");
    await readSseStream(response.body, onEvent);
  }
}
