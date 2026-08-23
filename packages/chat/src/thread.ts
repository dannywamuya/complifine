import type { ChatMessage } from "./types.ts";

export function walkPath<T extends { id: string; parentId: string | null; createdAt: string }>(
  messages: T[],
  leafId: string | null,
): T[] {
  if (messages.length === 0) return [];
  const byId = new Map(messages.map((message) => [message.id, message]));
  const start =
    (leafId && byId.get(leafId)) ||
    messages.reduce((latest, message) =>
      message.createdAt >= latest.createdAt ? message : latest,
    );
  const path: T[] = [];
  const seen = new Set<string>();
  let current: T | undefined = start;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function siblingsOf<T extends { id: string; parentId: string | null; role: string; createdAt: string }>(
  messages: T[],
  id: string,
): T[] {
  const target = messages.find((message) => message.id === id);
  if (!target) return [];
  return messages
    .filter((message) => message.parentId === target.parentId && message.role === target.role)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function deepestDescendant<T extends { id: string; parentId: string | null; createdAt: string }>(
  messages: T[],
  rootId: string,
): string {
  const children = new Map<string, T[]>();
  for (const message of messages) {
    if (!message.parentId) continue;
    const list = children.get(message.parentId) ?? [];
    list.push(message);
    children.set(message.parentId, list);
  }
  let current = rootId;
  for (;;) {
    const kids = children.get(current);
    if (!kids || kids.length === 0) return current;
    kids.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    current = kids[0]!.id;
  }
}

export function descendantsOf<T extends { id: string; parentId: string | null }>(
  messages: T[],
  rootId: string,
): string[] {
  const children = new Map<string | null, string[]>();
  for (const message of messages) {
    const list = children.get(message.parentId) ?? [];
    list.push(message.id);
    children.set(message.parentId, list);
  }
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    ids.push(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return ids;
}

export function leafOfPath<T extends { id: string }>(path: T[]): string | null {
  return path[path.length - 1]?.id ?? null;
}

export function parentOfUserTurn(messages: ChatMessage[], assistantId: string): string | null {
  const assistant = messages.find((message) => message.id === assistantId);
  return assistant?.parentId ?? null;
}

export function historyFromPath(path: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  return path
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content.trim().length > 0 &&
        message.status !== "error",
    )
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}
