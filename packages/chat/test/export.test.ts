import { describe, expect, test } from "bun:test";
import { conversationToJson, conversationToMarkdown } from "../src/export.ts";
import type { ChatMessage, ConversationSummary } from "../src/types.ts";

const conversation: ConversationSummary = {
  id: "c1",
  title: "Re-entry interval",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:02Z",
  activeLeafId: "a1",
};

const messages: ChatMessage[] = [
  {
    id: "u1",
    conversationId: "c1",
    parentId: null,
    role: "user",
    content: "When can workers go back in?",
    status: "complete",
    attachments: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "a1",
    conversationId: "c1",
    parentId: "u1",
    role: "assistant",
    content: "After the re-entry interval on the label.",
    status: "complete",
    attachments: [],
    createdAt: "2026-01-01T00:00:02Z",
    updatedAt: "2026-01-01T00:00:02Z",
  },
];

describe("export", () => {
  test("markdown includes both turns", () => {
    const md = conversationToMarkdown(conversation, messages);
    expect(md).toContain("# Re-entry interval");
    expect(md).toContain("## You");
    expect(md).toContain("## Assistant");
  });

  test("json round-trips ids", () => {
    const parsed = JSON.parse(conversationToJson(conversation, messages)) as { id: string; messages: unknown[] };
    expect(parsed.id).toBe("c1");
    expect(parsed.messages).toHaveLength(2);
  });
});
