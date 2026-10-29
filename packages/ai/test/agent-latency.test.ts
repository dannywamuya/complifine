import { describe, expect, test } from "bun:test";
import {
  HISTORY_MESSAGE_LIMIT,
  historyToMessages,
} from "../src/agent/agent.ts";
import { shellDraftHeader } from "../src/agent/record-tools.ts";
import { TOOL_RESULT_MAX_CHARS, truncateToolResult } from "../src/agent/truncate.ts";

describe("truncateToolResult", () => {
  test("passes small values through", () => {
    expect(truncateToolResult({ ok: true, n: 3 })).toEqual({ ok: true, n: 3 });
    expect(truncateToolResult("short")).toBe("short");
  });

  test("truncates long strings and large objects", () => {
    const long = "x".repeat(TOOL_RESULT_MAX_CHARS + 50);
    expect(truncateToolResult(long)).toBe(`${"x".repeat(TOOL_RESULT_MAX_CHARS)}…[truncated]`);

    const bulky = { rows: Array.from({ length: 200 }, (_, i) => ({ i, text: "y".repeat(80) })) };
    const out = truncateToolResult(bulky) as { truncated: true; preview: string };
    expect(out.truncated).toBe(true);
    expect(out.preview.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS + "…[truncated]".length);
  });
});

describe("historyToMessages", () => {
  test(`keeps the last ${HISTORY_MESSAGE_LIMIT} messages`, () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `q${i}`,
    }));
    const kept = historyToMessages(history);
    expect(kept).toHaveLength(HISTORY_MESSAGE_LIMIT);
    expect(kept[0]).toEqual({ role: "user", content: "q12" });
    expect(kept.at(-1)).toEqual({ role: "user", content: "q19" });
  });
});

describe("shellDraftHeader", () => {
  test("stores dictated text without extracted columns", () => {
    expect(shellDraftHeader("Sprayed block A today")).toEqual({
      dictated: "Sprayed block A today",
    });
  });
});
