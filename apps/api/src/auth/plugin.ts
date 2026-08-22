/**
 * Auth: JWT cookie sessions, register, login, refresh, logout, /me.
 */

import { Elysia, status, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { and, eq, isNull, type Database } from "@complifine/db";
import { memberships, organizations, refreshTokens, users } from "@complifine/db";
import { env, type MembershipRole, type UserKind } from "@complifine/core";
import {
  hashPassword,
  hashRefreshToken,
  isEmail,
  newRefreshToken,
  normalizeEmail,
  verifyPassword,
} from "./crypto.ts";

export const ACCESS_COOKIE = "cf_access";
export const REFRESH_COOKIE = "cf_refresh";
const ACCESS_MAX_AGE = 60 * 15;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export interface AccessClaims {
  readonly sub: string;
  readonly email: string;
  readonly kind: UserKind;
  readonly orgId?: string;
  readonly role?: MembershipRole;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly kind: UserKind;
  readonly orgId: string | null;
  readonly role: MembershipRole | null;
}

function cookieAttrs(maxAge: number) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: env().NODE_ENV === "production",
    maxAge,
  };
}

export function requireUser(auth: AuthUser | null): AuthUser {
  if (!auth) throw status(401, { error: "Sign in required" });
  return auth;
}

export function requireOperator(auth: AuthUser | null): AuthUser {
  const user = requireUser(auth);
  if (user.kind !== "operator") throw status(403, { error: "Operator access required" });
  return user;
}

export function requireOrg(auth: AuthUser | null): AuthUser & { orgId: string } {
  const user = requireUser(auth);
  if (!user.orgId) throw status(400, { error: "Create or select an organisation first" });
  return user as AuthUser & { orgId: string };
}

/** Nested Elysia plugins do not inherit the global `auth` derive in their types. */
export function readAuth(ctx: object): AuthUser | null {
  if (!("auth" in ctx)) return null;
  const auth = (ctx as { auth?: AuthUser | null }).auth;
  return auth ?? null;
}

function cookieToken(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function assertOrgMember(db: Database, userId: string, organizationId: string) {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)));
  if (!row) throw status(403, { error: "Not a member of that organisation" });
}

export function authModule(db: Database) {
  return new Elysia({ name: "complifine-auth" })
    .use(jwt({ name: "accessJwt", secret: env().JWT_SECRET, exp: "15m" }))
    .derive(async ({ accessJwt, cookie, headers }): Promise<{ auth: AuthUser | null }> => {
      const bearer = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      const token = bearer ?? cookieToken(cookie[ACCESS_COOKIE]?.value);
      if (!token) return { auth: null };

      const claims = (await accessJwt.verify(token)) as AccessClaims | false;
      if (!claims || !claims.sub) return { auth: null };

      const [user] = await db.select().from(users).where(eq(users.id, claims.sub));
      if (!user) return { auth: null };

      let orgId = claims.orgId ?? null;
      let role = claims.role ?? null;
      if (!orgId && user.kind === "member") {
        const [membership] = await db
          .select()
          .from(memberships)
          .where(eq(memberships.userId, user.id))
          .limit(1);
        orgId = membership?.organizationId ?? null;
        role = membership?.role ?? null;
      }

      return {
        auth: {
          id: user.id,
          email: user.email,
          name: user.name,
          kind: user.kind,
          orgId,
          role,
        },
      };
    })
    .post("/auth/register", async ({ body, accessJwt, cookie, request }) => {
      const email = normalizeEmail(body.email);
      if (!isEmail(email)) throw status(400, { error: "Enter a valid email address" });
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) throw status(409, { error: "An account with that email already exists" });

      const [user] = await db
        .insert(users)
        .values({
          email,
          name: body.name.trim(),
          passwordHash: await hashPassword(body.password),
          kind: "member",
        })
        .returning();
      const [org] = await db
        .insert(organizations)
        .values({ name: body.company.trim(), country: body.country?.trim() || "KE" })
        .returning();
      await db.insert(memberships).values({
        userId: user!.id,
        organizationId: org!.id,
        role: "owner",
      });
      return issueSession(db, user!, org!.id, "owner", accessJwt, cookie, request);
    }, {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ minLength: 3 }),
        password: t.String({ minLength: 8 }),
        company: t.String({ minLength: 1 }),
        country: t.Optional(t.String()),
      }),
      detail: { summary: "Register a producer organisation and its owner" },
    })
    .post("/auth/login", async ({ body, accessJwt, cookie, request }) => {
      const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(body.email)));
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        throw status(401, { error: "Email or password is wrong" });
      }
      const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      return issueSession(
        db,
        user,
        membership?.organizationId ?? null,
        membership?.role ?? null,
        accessJwt,
        cookie,
        request,
      );
    }, {
      body: t.Object({ email: t.String(), password: t.String() }),
      detail: { summary: "Sign in" },
    })
    .post("/auth/refresh", async ({ accessJwt, cookie, request }) => {
      const raw = cookieToken(cookie[REFRESH_COOKIE]?.value);
      if (!raw) throw status(401, { error: "No refresh token" });
      const [stored] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, hashRefreshToken(raw)), isNull(refreshTokens.revokedAt)));
      if (!stored || stored.expiresAt.getTime() < Date.now()) {
        throw status(401, { error: "Refresh token is invalid" });
      }
      await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
      const [user] = await db.select().from(users).where(eq(users.id, stored.userId));
      if (!user) throw status(401, { error: "Account no longer exists" });
      const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
      return issueSession(
        db,
        user,
        membership?.organizationId ?? null,
        membership?.role ?? null,
        accessJwt,
        cookie,
        request,
      );
    }, { detail: { summary: "Rotate the refresh token" } })
    .post("/auth/logout", async ({ cookie }) => {
      const raw = cookieToken(cookie[REFRESH_COOKIE]?.value);
      if (raw) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.tokenHash, hashRefreshToken(raw)));
      }
      cookie[ACCESS_COOKIE]?.remove();
      cookie[REFRESH_COOKIE]?.remove();
      return { ok: true };
    }, { detail: { summary: "Sign out" } })
    .get("/auth/me", ({ auth }) => {
      const user = requireUser(auth);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        kind: user.kind,
        orgId: user.orgId,
        role: user.role,
      };
    }, { detail: { summary: "Current user" } })
    .as("global");
}

async function issueSession(
  db: Database,
  user: typeof users.$inferSelect,
  orgId: string | null,
  role: MembershipRole | null,
  accessJwt: { sign: (payload: Record<string, string | undefined>) => Promise<string> },
  cookie: Record<string, { set: (value: Record<string, unknown>) => void; remove: () => void } | undefined>,
  request: Request,
) {
  const claims: Record<string, string | undefined> = {
    sub: user.id,
    email: user.email,
    kind: user.kind,
    ...(orgId ? { orgId } : {}),
    ...(role ? { role } : {}),
  };
  const access = await accessJwt.sign(claims);
  const refresh = newRefreshToken();
  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: refresh.hash,
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE * 1000),
    userAgent: request.headers.get("user-agent"),
  });
  cookie[ACCESS_COOKIE]?.set({ value: access, ...cookieAttrs(ACCESS_MAX_AGE) });
  cookie[REFRESH_COOKIE]?.set({ value: refresh.raw, ...cookieAttrs(REFRESH_MAX_AGE) });
  return {
    user: { id: user.id, email: user.email, name: user.name, kind: user.kind, orgId, role },
    accessToken: access,
  };
}
