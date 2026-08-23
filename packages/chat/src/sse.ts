import type { AskStreamEvent } from "./types.ts";

export function parseSseFrame(frame: string): AskStreamEvent | null {
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) data += line.slice(5).trimStart();
  }
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as AskStreamEvent;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AskStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
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
  if (buffer.trim()) {
    const event = parseSseFrame(buffer);
    if (event) onEvent(event);
  }
}

export function friendlyError(status: number, raw: string): string {
  const trimmed = raw.trim();
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status === 401) return "Your session expired. Sign in again to keep chatting.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 503) return "Generation is unavailable right now. Search still works.";
  if (status === 0 || /failed to fetch|networkerror|load failed/i.test(trimmed)) {
    return "You appear to be offline. Check the connection and retry.";
  }
  if (!trimmed) return "Something went wrong. Please retry.";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string") return parsed.error;
      if (typeof parsed.message === "string") return parsed.message;
    } catch {
      return "The server returned an error. Please retry.";
    }
    return "The server returned an error. Please retry.";
  }
  if (trimmed.length > 280 || /at \S+ \(\S+:\d+:\d+\)/.test(trimmed)) {
    return "The assistant hit an internal error. Retry the last message.";
  }
  return trimmed;
}
