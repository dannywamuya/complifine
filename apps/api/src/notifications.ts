/**
 * In-app notifications and the preferences that decide which pending items
 * become one.
 */

import { Elysia, status, t } from "elysia";
import { and, count, desc, eq, isNull, lte, or, sql, type Database } from "@complifine/db";
import { notifications, sites } from "@complifine/db";
import { readAuth, requireOrg, type AuthUser } from "./auth/plugin.ts";
import { loadNotificationState, saveNotificationState } from "./notification-prefs.ts";
import { runDigestForUser } from "./digest.ts";

const preferenceBody = t.Object({
  eventType: t.String(),
  channel: t.String(),
  enabled: t.Boolean(),
  digest: t.String(),
  leadDays: t.Integer({ minimum: 0, maximum: 90 }),
});

const settingsBody = t.Object({
  deliveryHourLocal: t.Integer({ minimum: 0, maximum: 23 }),
  timezone: t.String(),
  quietStart: t.Union([t.Integer({ minimum: 0, maximum: 23 }), t.Null()]),
  quietEnd: t.Union([t.Integer({ minimum: 0, maximum: 23 }), t.Null()]),
  siteIds: t.Union([t.Array(t.String()), t.Null()]),
});

export function notificationRoutes(db: Database) {
  return new Elysia({ name: "complifine-notifications" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .get(
      "/notifications",
      async ({ auth, query }) => {
        const user = requireOrg(auth);
        const limit = clampLimit(query.limit);
        const unreadOnly = query.unread === "1";
        const visible = and(
          eq(notifications.userId, user.id),
          eq(notifications.organizationId, user.orgId),
          isNull(notifications.dismissedAt),
          or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, new Date())),
        );
        const rows = await db
          .select({
            id: notifications.id,
            eventType: notifications.eventType,
            channel: notifications.channel,
            title: notifications.title,
            body: notifications.body,
            href: notifications.href,
            siteId: notifications.siteId,
            siteName: sites.name,
            counts: notifications.counts,
            readAt: notifications.readAt,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .leftJoin(sites, eq(sites.id, notifications.siteId))
          .where(unreadOnly ? and(visible, isNull(notifications.readAt)) : visible)
          .orderBy(
            sql`case when ${notifications.eventType} = 'daily_digest' then 0 else 1 end`,
            desc(notifications.createdAt),
          )
          .limit(limit);
        const [counted] = await db
          .select({ total: count() })
          .from(notifications)
          .where(and(visible, isNull(notifications.readAt)));
        return { notifications: rows, unreadCount: Number(counted?.total ?? 0) };
      },
      {
        query: t.Object({
          unread: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
      },
    )
    .post("/notifications/read-all", async ({ auth }) => {
      const user = requireOrg(auth);
      await db
        .update(notifications)
        .set({ readAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(notifications.userId, user.id),
            eq(notifications.organizationId, user.orgId),
            isNull(notifications.readAt),
          ),
        );
      return { ok: true };
    })
    .post("/notifications/run-digest", async ({ auth }) => {
      const user = requireOrg(auth);
      if (user.role !== "owner" && user.role !== "compliance_manager") {
        throw status(403, { error: "Only an owner or compliance manager can send a summary now" });
      }
      return runDigestForUser(db, { userId: user.id, orgId: user.orgId, manual: true });
    })
    .patch(
      "/notifications/:id",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        const [row] = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.id, params.id),
              eq(notifications.userId, user.id),
              eq(notifications.organizationId, user.orgId),
            ),
          );
        if (!row) throw status(404, { error: "Notification not found" });
        const now = new Date();
        const readAt = body.read === undefined ? row.readAt : body.read ? (row.readAt ?? now) : null;
        const dismissedAt = body.dismissed === undefined ? row.dismissedAt : body.dismissed ? now : null;
        let snoozedUntil = row.snoozedUntil;
        if (body.snoozeUntil === null) snoozedUntil = null;
        if (typeof body.snoozeUntil === "string") {
          const date = new Date(body.snoozeUntil);
          if (Number.isNaN(date.getTime())) throw status(422, { error: "Use an ISO date" });
          snoozedUntil = date;
        }
        const [updated] = await db
          .update(notifications)
          .set({ readAt, dismissedAt, snoozedUntil, updatedAt: now })
          .where(eq(notifications.id, row.id))
          .returning({
            id: notifications.id,
            readAt: notifications.readAt,
            dismissedAt: notifications.dismissedAt,
            snoozedUntil: notifications.snoozedUntil,
          });
        return updated;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          read: t.Optional(t.Boolean()),
          dismissed: t.Optional(t.Boolean()),
          snoozeUntil: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .get("/notification-preferences", async ({ auth }) => {
      const user = requireOrg(auth);
      return loadNotificationState(db, user.id, user.orgId);
    })
    .put(
      "/notification-preferences",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        return saveNotificationState(db, user.id, user.orgId, body);
      },
      { body: t.Object({ settings: settingsBody, preferences: t.Array(preferenceBody) }) },
    );
}

function clampLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 50);
}
