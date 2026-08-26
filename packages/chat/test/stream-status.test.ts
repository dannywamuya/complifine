import { describe, expect, test } from "bun:test";
import {
  formatElapsed,
  settleDoneTurn,
  settleIncompleteTurn,
  STREAM_STALL_MESSAGE,
  workingLabel,
} from "../src/stream-status.ts";
import type { AskStreamEvent, ChatMessage } from "../src/types.ts";

function doneEvent(
  extra: Partial<Extract<AskStreamEvent, { type: "done" }>> = {},
): Extract<AskStreamEvent, { type: "done" }> {
  return {
    type: "done",
    runId: "r1",
    conversationId: "c1",
    answer: "Yes, FV 19.08 still applies.",
    citations: [],
    ungroundedCitations: [],
    toolCalls: [],
    durationMs: 1200,
    ...extra,
  };
}

function message(extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "a1",
    conversationId: "c1",
    parentId: "u1",
    role: "assistant",
    content: "",
    status: "streaming",
    attachments: [],
    tools: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

describe("workingLabel", () => {
  test("asks the standard before any tools", () => {
    expect(workingLabel(message())).toMatch(/published standard/);
  });

  test("names the running tool", () => {
    expect(
      workingLabel(
        message({
          tools: [
            { name: "searchRequirements", status: "done" },
            { name: "getRequirement", status: "running" },
          ],
        }),
      ),
    ).toBe("Opening a criterion…");
  });

  test("says writing after tools finish and before prose", () => {
    expect(
      workingLabel(message({ tools: [{ name: "searchRequirements", status: "done" }] })),
    ).toBe("Writing the answer…");
  });

  test("says still writing once prose has started", () => {
    expect(workingLabel(message({ content: "In short" }))).toBe("Still writing…");
  });
});

describe("settleIncompleteTurn", () => {
  test("abort stops the turn and marks running tools", () => {
    const next = settleIncompleteTurn(
      message({ tools: [{ name: "searchRequirements", status: "running" }] }),
      "aborted",
    );
    expect(next.status).toBe("stopped");
    expect(next.error).toBeNull();
    expect(next.tools?.[0]?.status).toBe("error");
  });

  test("stall uses a retryable error", () => {
    const next = settleIncompleteTurn(message(), "stalled");
    expect(next.status).toBe("error");
    expect(next.error).toBe(STREAM_STALL_MESSAGE);
  });

  test("a dropped stream with partial prose asks to finish", () => {
    const next = settleIncompleteTurn(message({ content: "In short\n" }), "disconnected");
    expect(next.status).toBe("error");
    expect(next.error).toMatch(/stopped arriving/i);
  });
});

describe("settleDoneTurn", () => {
  test("an answer completes the turn", () => {
    const next = settleDoneTurn(message(), doneEvent());
    expect(next.status).toBe("complete");
    expect(next.error).toBeNull();
    expect(next.content).toMatch(/FV 19.08/);
    expect(next.durationMs).toBe(1200);
  });

  test("finishing with no prose is an error, not a blank bubble", () => {
    const next = settleDoneTurn(
      message(),
      doneEvent({
        answer: "",
        toolCalls: [{ name: "getRequirement", args: {}, durationMs: 12 }],
      }),
    );
    expect(next.status).toBe("error");
    expect(next.error).toMatch(/without writing an answer/i);
    expect(next.tools?.[0]?.status).toBe("done");
  });

  test("an empty answer keeps prose that already streamed", () => {
    const next = settleDoneTurn(message({ content: "In short, yes." }), doneEvent({ answer: "" }));
    expect(next.status).toBe("complete");
    expect(next.content).toBe("In short, yes.");
  });
});

describe("formatElapsed", () => {
  test("formats seconds and minutes", () => {
    expect(formatElapsed(20800)).toBe("20.8s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
  });
});
