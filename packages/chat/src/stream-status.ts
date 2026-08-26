import { toolLabel } from "./tools.ts";
import type { AskStreamEvent, ChatMessage, ToolChip } from "./types.ts";

export const STREAM_STALL_MS = 45_000;
export const STREAM_STALL_MESSAGE =
  "This is taking too long. The connection may have stalled — retry.";
export const NO_ANSWER_MESSAGE =
  "The assistant finished without writing an answer. Try asking again.";

export function workingLabel(message: ChatMessage): string {
  const running = message.tools?.find((tool) => tool.status === "running");
  if (running) return `${toolLabel(running.name)}…`;
  if ((message.tools?.length ?? 0) > 0 && !message.content.trim()) return "Writing the answer…";
  if (message.content.trim()) return "Still writing…";
  return "Looking it up in the published standard…";
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function stopRunningTools(tools: ToolChip[] | null | undefined): ToolChip[] {
  return (tools ?? []).map((tool) =>
    tool.status === "running" ? { ...tool, status: "error" as const } : tool,
  );
}

export function settleIncompleteTurn(
  message: ChatMessage,
  reason: "aborted" | "stalled" | "disconnected",
): ChatMessage {
  const tools = stopRunningTools(message.tools);
  if (reason === "aborted") {
    return { ...message, status: "stopped", error: null, tools };
  }
  const error =
    reason === "stalled"
      ? STREAM_STALL_MESSAGE
      : message.content.trim()
        ? "The answer stopped arriving. Retry to finish it."
        : "No answer came back. Retry.";
  return { ...message, status: "error", error, tools };
}

/**
 * Settle a turn the server reported as finished. A run can end having called
 * tools but never written prose — an exhausted tool budget, a provider that
 * returns no text — and settling that as "complete" leaves a blank bubble with
 * no error and no way forward, so an answerless finish is treated as a failure.
 */
export function settleDoneTurn(
  message: ChatMessage,
  event: Extract<AskStreamEvent, { type: "done" }>,
): ChatMessage {
  const settled: ChatMessage = {
    ...message,
    // Falling back to what streamed keeps a partial answer on screen when the
    // final payload comes back empty.
    content: event.answer || message.content,
    citations: [...event.citations],
    ungrounded: [...event.ungroundedCitations],
    tools: event.toolCalls.map<ToolChip>((call) => ({
      name: call.name,
      status: call.error ? "error" : "done",
      durationMs: call.durationMs,
    })),
    durationMs: event.durationMs,
    runId: event.runId,
    status: "complete",
    error: null,
  };
  if (!settled.content.trim()) {
    return { ...settled, status: "error", error: NO_ANSWER_MESSAGE };
  }
  return settled;
}
