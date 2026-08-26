import { STREAM_STALL_MESSAGE, STREAM_STALL_MS } from "./stream-status.ts";
import type { AskStreamEvent } from "./types.ts";

export class StreamStallError extends Error {
  override name = "StreamStallError";
  constructor(message = STREAM_STALL_MESSAGE) {
    super(message);
  }
}

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

async function readOrStall(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  stallMs: number,
): Promise<"stall" | Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>["read"]>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<"stall">((resolve) => {
        timer = setTimeout(() => resolve("stall"), stallMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AskStreamEvent) => void,
  options?: { stallMs?: number },
): Promise<void> {
  const stallMs = options?.stallMs ?? STREAM_STALL_MS;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const result = await readOrStall(reader, stallMs);
    if (result === "stall") {
      await reader.cancel().catch(() => undefined);
      throw new StreamStallError();
    }
    const { done, value } = result;
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
