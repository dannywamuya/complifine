/**
 * Operator CRM: list/approve producers and send outbound email.
 */

import { Elysia, status, t } from "elysia";
import { and, desc, eq, ilike, isNull, or, type Database } from "@complifine/db";
import {
  crmMessages,
  memberships,
  organizations,
  refreshTokens,
  users,
} from "@complifine/db";
import { ACCOUNT_STATUSES, type AccountStatus } from "@complifine/core";
import { readAuth, requireOperator, type AuthUser } from "./auth/plugin.ts";
import {
  approvedEmailCopy,
  disabledEmailCopy,
  rejectedEmailCopy,
  resolveUserMail,
  sendCrmEmail,
} from "./email/crm.ts";

const statusBody = t.Object({
  status: t.Union([
    t.Literal("pending"),
    t.Literal("active"),
    t.Literal("rejected"),
    t.Literal("disabled"),
  ]),
  note: t.Optional(t.String()),
});

const emailBody = t.Object({
  subject: t.String({ minLength: 1, maxLength: 200 }),
  body: t.String({ minLength: 1, maxLength: 10_000 }),
});

function assertTransition(from: AccountStatus, to: AccountStatus): void {
  const allowed: Record<AccountStatus, readonly AccountStatus[]> = {
    pending: ["active", "rejected"],
    active: ["disabled"],
    rejected: ["active"],
    disabled: ["active"],
  };
  if (!allowed[from].includes(to)) {
    throw status(409, { error: `Cannot change status from ${from} to ${to}` });
  }
}

export function crmRoutes(db: Database) {
  return new Elysia({ name: "complifine-crm" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .get(
      "/crm/users",
      async ({ auth, query }) => {
        requireOperator(auth);
        const conditions = [eq(users.kind, "member")];
        if (query.status && (ACCOUNT_STATUSES as readonly string[]).includes(query.status)) {
          conditions.push(eq(users.accountStatus, query.status as AccountStatus));
        }
        if (query.q?.trim()) {
          const needle = `%${query.q.trim()}%`;
          conditions.push(
            or(
              ilike(users.email, needle),
              ilike(users.name, needle),
              ilike(organizations.name, needle),
            )!,
          );
        }

        const rows = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            accountStatus: users.accountStatus,
            statusNote: users.statusNote,
            createdAt: users.createdAt,
            lastLoginAt: users.lastLoginAt,
            approvedAt: users.approvedAt,
            organizationId: organizations.id,
            organizationName: organizations.name,
            role: memberships.role,
          })
          .from(users)
          .leftJoin(memberships, eq(memberships.userId, users.id))
          .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
          .where(and(...conditions))
          .orderBy(desc(users.createdAt))
          .limit(200);

        return rows;
      },
      {
        query: t.Object({
          status: t.Optional(t.String()),
          q: t.Optional(t.String()),
        }),
        detail: { summary: "List producer accounts (operators)" },
      },
    )
    .get(
      "/crm/users/:id",
      async ({ auth, params }) => {
        requireOperator(auth);
        const [row] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            kind: users.kind,
            accountStatus: users.accountStatus,
            statusNote: users.statusNote,
            createdAt: users.createdAt,
            lastLoginAt: users.lastLoginAt,
            approvedAt: users.approvedAt,
            approvedBy: users.approvedBy,
            organizationId: organizations.id,
            organizationName: organizations.name,
            role: memberships.role,
          })
          .from(users)
          .leftJoin(memberships, eq(memberships.userId, users.id))
          .leftJoin(organizations, eq(organizations.id, memberships.organizationId))
          .where(eq(users.id, params.id))
          .limit(1);
        if (!row || row.kind !== "member") throw status(404, { error: "User not found" });

        const messages = await db
          .select()
          .from(crmMessages)
          .where(eq(crmMessages.userId, params.id))
          .orderBy(desc(crmMessages.createdAt))
          .limit(40);

        return { user: row, messages };
      },
      {
        params: t.Object({ id: t.String() }),
        detail: { summary: "Producer detail and CRM history (operators)" },
      },
    )
    .post(
      "/crm/users/:id/status",
      async ({ auth, params, body }) => {
        const operator = requireOperator(auth);
        const [user] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
        if (!user || user.kind !== "member") throw status(404, { error: "User not found" });

        const next = body.status as AccountStatus;
        assertTransition(user.accountStatus, next);

        const note = body.note?.trim() || null;
        const now = new Date();
        const patch: {
          accountStatus: AccountStatus;
          statusNote: string | null;
          updatedAt: Date;
          approvedAt?: Date | null;
          approvedBy?: string | null;
        } = {
          accountStatus: next,
          statusNote: note,
          updatedAt: now,
        };

        if (next === "active") {
          patch.approvedAt = now;
          patch.approvedBy = operator.id;
        }

        const [updated] = await db
          .update(users)
          .set(patch)
          .where(eq(users.id, user.id))
          .returning();

        if (next === "disabled") {
          await db
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(and(eq(refreshTokens.userId, user.id), isNull(refreshTokens.revokedAt)));
        }

        const to = await resolveUserMail(db, user.id, user.email);
        let mail: { sent: boolean; messageId: string } | null = null;

        if (next === "active" && user.accountStatus === "pending") {
          const copy = approvedEmailCopy(user.name);
          mail = await sendCrmEmail({
            db,
            operatorId: operator.id,
            to,
            subject: copy.subject,
            text: copy.text,
            href: copy.href,
            kind: "approved",
            userId: user.id,
          });
        } else if (next === "rejected") {
          const copy = rejectedEmailCopy(user.name, note);
          mail = await sendCrmEmail({
            db,
            operatorId: operator.id,
            to,
            subject: copy.subject,
            text: copy.text,
            kind: "rejected",
            userId: user.id,
          });
        } else if (next === "disabled") {
          const copy = disabledEmailCopy(user.name, note);
          mail = await sendCrmEmail({
            db,
            operatorId: operator.id,
            to,
            subject: copy.subject,
            text: copy.text,
            kind: "disabled",
            userId: user.id,
          });
        }

        return { user: updated, email: mail };
      },
      {
        params: t.Object({ id: t.String() }),
        body: statusBody,
        detail: { summary: "Approve, reject, disable or re-enable a producer" },
      },
    )
    .post(
      "/crm/users/:id/email",
      async ({ auth, params, body }) => {
        const operator = requireOperator(auth);
        const [user] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
        if (!user || user.kind !== "member") throw status(404, { error: "User not found" });

        const to = await resolveUserMail(db, user.id, user.email);
        const result = await sendCrmEmail({
          db,
          operatorId: operator.id,
          to,
          subject: body.subject,
          text: body.body,
          kind: "manual",
          userId: user.id,
        });
        return { ...result, to };
      },
      {
        params: t.Object({ id: t.String() }),
        body: emailBody,
        detail: { summary: "Email a producer (operators)" },
      },
    )
    .get(
      "/crm/messages",
      async ({ auth, query }) => {
        requireOperator(auth);
        const conditions = [];
        if (query.userId) conditions.push(eq(crmMessages.userId, query.userId));
        if (query.demoRequestId) conditions.push(eq(crmMessages.demoRequestId, query.demoRequestId));

        return db
          .select()
          .from(crmMessages)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(crmMessages.createdAt))
          .limit(Math.min(Number(query.limit ?? 50), 100));
      },
      {
        query: t.Object({
          userId: t.Optional(t.String()),
          demoRequestId: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: { summary: "Recent CRM outbound messages" },
      },
    );
}
