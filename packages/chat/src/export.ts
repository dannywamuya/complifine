import type { ChatMessage, ConversationSummary } from "./types.ts";
import { walkPath } from "./thread.ts";

export function conversationToMarkdown(
  conversation: ConversationSummary,
  messages: ChatMessage[],
): string {
  const path = walkPath(messages, conversation.activeLeafId);
  const lines = [`# ${conversation.title}`, ""];
  for (const message of path) {
    const who = message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : "System";
    lines.push(`## ${who}`, "", message.content.trim() || "_(empty)_", "");
  }
  return lines.join("\n").trim() + "\n";
}

export function conversationToJson(
  conversation: ConversationSummary,
  messages: ChatMessage[],
): string {
  return `${JSON.stringify(
    {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      activeLeafId: conversation.activeLeafId,
      messages,
    },
    null,
    2,
  )}\n`;
}

export function downloadText(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function slugTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "conversation"
  );
}
