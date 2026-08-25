/**
 * Conversation and message CRUD for the shared chat UI.
 *
 * Messages form a tree: edits and regenerations are siblings under the same
 * parent, and `conversations.active_leaf_id` is the tip of the branch in view.
 */

import { Elysia, status, t } from "elysia";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  type Database,
} from "@complifine/db";
import { conversationMessages, conversations, sites } from "@complifine/db";
import { readAuth, requireUser, type AuthUser } from "./auth/plugin.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Drop leftover / foreign site ids so chat insert does not fail the site FK. */
export async function ownedSiteId(
  db: Database,
  siteId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<string | null> {
  const id = siteId?.trim() ?? "";
  if (!UUID_RE.test(id)) return null;
  const [row] = organizationId
    ? await db
        .select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, id), eq(sites.organizationId, organizationId)))
        .limit(1)
    : await db.select({ id: sites.id }).from(sites).where(eq(sites.id, id)).limit(1);
  return row?.id ?? null;
}

const attachment = t.Object({
  id: t.String(),
  kind: t.Union([t.Literal("image"), t.Literal("file")]),
  name: t.String(),
  size: t.Number(),
  mime: t.String(),
  dataUrl: t.Optional(t.String()),
});

function ownedBy(user: AuthUser) {
  return user.orgId
    ? eq(conversations.organizationId, user.orgId)
    : eq(conversations.userId, user.id);
}

async function loadOwned(db: Database, user: AuthUser, id: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), ownedBy(user)));
  if (!row) throw status(404, { error: "Conversation not found" });
  return row;
}

function serializeMessage(row: typeof conversationMessages.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    parentId: row.parentId,
    role: row.role,
    content: row.content,
    status: row.status,
    attachments: row.attachments ?? [],
    citations: row.citations,
    ungrounded: row.ungrounded,
    tools: row.tools,
    hits: row.hits,
    error: row.error,
    runId: row.runId,
    durationMs: row.durationMs,
    feedback: row.feedback,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function insertTurn(
  db: Database,
  input: {
    conversationId: string;
    userId?: string | null;
    organizationId?: string | null;
    siteId?: string | null;
    parentId: string | null;
    question: string;
    attachments?: Array<{
      id: string;
      kind: "image" | "file";
      name: string;
      size: number;
      mime: string;
      dataUrl?: string;
    }>;
    userMessageId?: string;
    assistantMessageId?: string;
    skipUser?: boolean;
  },
) {
  const userMessageId = input.userMessageId ?? crypto.randomUUID();
  const assistantMessageId = input.assistantMessageId ?? crypto.randomUUID();
  const title = input.question.trim().slice(0, 80) || "New chat";
  const siteId = await ownedSiteId(db, input.siteId, input.organizationId);

  await db
    .insert(conversations)
    .values({
      id: input.conversationId,
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
      siteId,
      title,
      activeLeafId: assistantMessageId,
    })
    .onConflictDoUpdate({
      target: conversations.id,
      set: { updatedAt: new Date(), activeLeafId: assistantMessageId },
    });

  if (input.skipUser) {
    await db.insert(conversationMessages).values({
      id: assistantMessageId,
      conversationId: input.conversationId,
      parentId: input.parentId,
      role: "assistant",
      content: "",
      status: "streaming",
    });
  } else {
    await db.insert(conversationMessages).values([
      {
        id: userMessageId,
        conversationId: input.conversationId,
        parentId: input.parentId,
        role: "user",
        content: input.question,
        status: "complete",
        attachments: input.attachments ?? [],
      },
      {
        id: assistantMessageId,
        conversationId: input.conversationId,
        parentId: userMessageId,
        role: "assistant",
        content: "",
        status: "streaming",
      },
    ]);
  }

  const [existing] = await db
    .select({ title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, input.conversationId));
  if (!existing?.title || existing.title === "New chat") {
    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
  }

  return { userMessageId, assistantMessageId };
}

export async function finishAssistant(
  db: Database,
  assistantMessageId: string,
  patch: {
    content?: string;
    status: "complete" | "error" | "stopped";
    error?: string | null;
    citations?: unknown;
    ungrounded?: unknown;
    tools?: unknown;
    hits?: unknown;
    runId?: string;
    durationMs?: number;
  },
) {
  await db
    .update(conversationMessages)
    .set({
      content: patch.content,
      status: patch.status,
      error: patch.error ?? null,
      citations: patch.citations as never,
      ungrounded: patch.ungrounded as never,
      tools: patch.tools as never,
      hits: patch.hits as never,
      runId: patch.runId,
      durationMs: patch.durationMs,
      updatedAt: new Date(),
    })
    .where(eq(conversationMessages.id, assistantMessageId));
}

async function descendantsOf(db: Database, conversationId: string, rootId: string): Promise<string[]> {
  const rows = await db
    .select({ id: conversationMessages.id, parentId: conversationMessages.parentId })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId));
  const children = new Map<string | null, string[]>();
  for (const row of rows) {
    const key = row.parentId;
    const list = children.get(key) ?? [];
    list.push(row.id);
    children.set(key, list);
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

export function conversationRoutes(db: Database) {
  return new Elysia({ name: "complifine-conversations" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .get(
      "/conversations",
      async ({ auth, query }) => {
        const user = requireUser(auth);
        const limit = Math.min(Number(query.limit ?? 40) || 40, 100);
        const q = query.q?.trim();

        const filters = [ownedBy(user)];
        if (query.before) {
          const before = new Date(query.before);
          if (!Number.isNaN(before.getTime())) filters.push(lt(conversations.updatedAt, before));
        }
        if (q) {
          const pattern = `%${q}%`;
          const matching = await db
            .selectDistinct({ id: conversationMessages.conversationId })
            .from(conversationMessages)
            .where(ilike(conversationMessages.content, pattern));
          const ids = matching.map((row) => row.id);
          filters.push(
            or(
              ilike(conversations.title, pattern),
              ids.length ? inArray(conversations.id, ids) : eq(conversations.id, "00000000-0000-0000-0000-000000000000"),
            )!,
          );
        }

        const rows = await db
          .select()
          .from(conversations)
          .where(and(...filters))
          .orderBy(desc(conversations.updatedAt))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        return {
          conversations: page.map((row) => ({
            id: row.id,
            title: row.title || "New chat",
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            activeLeafId: row.activeLeafId,
          })),
          nextCursor: hasMore ? page[page.length - 1]?.updatedAt.toISOString() : null,
        };
      },
      {
        query: t.Object({
          q: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          before: t.Optional(t.String()),
        }),
        detail: { summary: "List the signed-in user's conversations" },
      },
    )
    .post(
      "/conversations",
      async ({ auth, body }) => {
        const user = requireUser(auth);
        const [row] = await db
          .insert(conversations)
          .values({
            ...(body.id ? { id: body.id } : {}),
            userId: user.id,
            organizationId: user.orgId ?? null,
            title: body.title?.trim() || "New chat",
          })
          .returning();
        return {
          id: row!.id,
          title: row!.title || "New chat",
          createdAt: row!.createdAt.toISOString(),
          updatedAt: row!.updatedAt.toISOString(),
          activeLeafId: row!.activeLeafId,
        };
      },
      {
        body: t.Object({ title: t.Optional(t.String()), id: t.Optional(t.String()) }),
        detail: { summary: "Start an empty conversation" },
      },
    )
    .get(
      "/conversations/:id",
      async ({ auth, params }) => {
        const user = requireUser(auth);
        const row = await loadOwned(db, user, params.id);
        const messages = await db
          .select()
          .from(conversationMessages)
          .where(eq(conversationMessages.conversationId, row.id))
          .orderBy(asc(conversationMessages.createdAt));
        return {
          id: row.id,
          title: row.title || "New chat",
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          activeLeafId: row.activeLeafId,
          messages: messages.map(serializeMessage),
        };
      },
      { params: t.Object({ id: t.String() }), detail: { summary: "Load a conversation tree" } },
    )
    .patch(
      "/conversations/:id",
      async ({ auth, params, body }) => {
        const user = requireUser(auth);
        await loadOwned(db, user, params.id);
        const [row] = await db
          .update(conversations)
          .set({
            ...(body.title !== undefined ? { title: body.title.trim() || "New chat" } : {}),
            ...(body.activeLeafId !== undefined ? { activeLeafId: body.activeLeafId } : {}),
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, params.id))
          .returning();
        return {
          id: row!.id,
          title: row!.title || "New chat",
          createdAt: row!.createdAt.toISOString(),
          updatedAt: row!.updatedAt.toISOString(),
          activeLeafId: row!.activeLeafId,
        };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          title: t.Optional(t.String()),
          activeLeafId: t.Optional(t.Union([t.String(), t.Null()])),
        }),
        detail: { summary: "Rename a conversation or switch its active branch" },
      },
    )
    .delete(
      "/conversations/:id",
      async ({ auth, params }) => {
        const user = requireUser(auth);
        await loadOwned(db, user, params.id);
        await db.delete(conversations).where(eq(conversations.id, params.id));
        return { ok: true };
      },
      { params: t.Object({ id: t.String() }), detail: { summary: "Delete a conversation" } },
    )
    .post(
      "/conversations/:id/messages",
      async ({ auth, params, body }) => {
        const user = requireUser(auth);
        await loadOwned(db, user, params.id);
        const id = body.id ?? crypto.randomUUID();
        const [row] = await db
          .insert(conversationMessages)
          .values({
            id,
            conversationId: params.id,
            parentId: body.parentId ?? null,
            role: body.role,
            content: body.content,
            status: body.status ?? "complete",
            attachments: body.attachments ?? [],
            hits: body.hits,
            error: body.error,
          })
          .returning();
        await db
          .update(conversations)
          .set({ activeLeafId: row!.id, updatedAt: new Date() })
          .where(eq(conversations.id, params.id));
        return serializeMessage(row!);
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          id: t.Optional(t.String()),
          parentId: t.Optional(t.Union([t.String(), t.Null()])),
          role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("system")]),
          content: t.String(),
          status: t.Optional(
            t.Union([
              t.Literal("pending"),
              t.Literal("streaming"),
              t.Literal("complete"),
              t.Literal("error"),
              t.Literal("stopped"),
            ]),
          ),
          attachments: t.Optional(t.Array(attachment)),
          hits: t.Optional(t.Array(t.Any())),
          error: t.Optional(t.String()),
        }),
        detail: { summary: "Append a message to a conversation" },
      },
    )
    .patch(
      "/conversations/:id/messages/:messageId",
      async ({ auth, params, body }) => {
        const user = requireUser(auth);
        await loadOwned(db, user, params.id);
        const [row] = await db
          .update(conversationMessages)
          .set({
            ...(body.feedback !== undefined ? { feedback: body.feedback } : {}),
            ...(body.content !== undefined ? { content: body.content } : {}),
            ...(body.hits !== undefined ? { hits: body.hits } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(conversationMessages.id, params.messageId),
              eq(conversationMessages.conversationId, params.id),
            ),
          )
          .returning();
        if (!row) throw status(404, { error: "Message not found" });
        return serializeMessage(row);
      },
      {
        params: t.Object({ id: t.String(), messageId: t.String() }),
        body: t.Object({
          feedback: t.Optional(t.Union([t.Literal("up"), t.Literal("down"), t.Null()])),
          content: t.Optional(t.String()),
          hits: t.Optional(t.Array(t.Any())),
          status: t.Optional(
            t.Union([
              t.Literal("pending"),
              t.Literal("streaming"),
              t.Literal("complete"),
              t.Literal("error"),
              t.Literal("stopped"),
            ]),
          ),
        }),
        detail: { summary: "Update feedback or content on a message" },
      },
    )
    .delete(
      "/conversations/:id/messages/:messageId",
      async ({ auth, params }) => {
        const user = requireUser(auth);
        const conversation = await loadOwned(db, user, params.id);
        const ids = await descendantsOf(db, params.id, params.messageId);
        if (ids.length === 0) throw status(404, { error: "Message not found" });
        await db.delete(conversationMessages).where(inArray(conversationMessages.id, ids));
        if (conversation.activeLeafId && ids.includes(conversation.activeLeafId)) {
          const remaining = await db
            .select({ id: conversationMessages.id })
            .from(conversationMessages)
            .where(eq(conversationMessages.conversationId, params.id))
            .orderBy(desc(conversationMessages.createdAt))
            .limit(1);
          await db
            .update(conversations)
            .set({ activeLeafId: remaining[0]?.id ?? null, updatedAt: new Date() })
            .where(eq(conversations.id, params.id));
        }
        return { ok: true, deleted: ids };
      },
      {
        params: t.Object({ id: t.String(), messageId: t.String() }),
        detail: { summary: "Delete a message and its descendants" },
      },
    );
}
