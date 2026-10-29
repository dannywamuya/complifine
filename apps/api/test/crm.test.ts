import { afterEach, describe, expect, test } from "bun:test";
import { and, createDatabase, crmMessages, eq, isNull, refreshTokens, users } from "@complifine/db";
import { env, resetEnvCache } from "@complifine/core";
import { createApp } from "../src/app.ts";
import { hashPassword } from "../src/auth/crypto.ts";
import { setResendClient, type ResendClient } from "../src/email/resend.ts";

const app = createApp();

async function json(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`);
  const response = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, response };
}

async function databaseReachable(): Promise<boolean> {
  try {
    return (await json("/status")).status === 200;
  } catch {
    return false;
  }
}

async function operatorToken(): Promise<string | null> {
  const login = await json("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: env().OPERATOR_EMAIL,
      password: env().OPERATOR_PASSWORD,
    }),
  });
  if (login.status !== 200) return null;
  return (login.body as { accessToken: string }).accessToken;
}

afterEach(() => {
  setResendClient(null);
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.APP_BASE_URL;
  resetEnvCache();
});

describe("CRM approval gate", () => {
  test("pending members cannot sign in until an operator approves", async () => {
    if (!(await databaseReachable())) return;

    const database = createDatabase({ max: 1 });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `pending-${suffix}@crm.test`;
    const password = "password12";

    try {
      const [user] = await database
        .insert(users)
        .values({
          email,
          name: "Pending Farmer",
          passwordHash: await hashPassword(password),
          kind: "member",
          accountStatus: "pending",
        })
        .returning();

      const blocked = await json("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      expect(blocked.status).toBe(403);
      expect((blocked.body as { code?: string }).code).toBe("account_pending");

      const token = await operatorToken();
      if (!token) return;

      process.env.RESEND_API_KEY = "re_test";
      process.env.RESEND_FROM_EMAIL = "CompliFine <notify@example.com>";
      process.env.APP_BASE_URL = "https://complifine.com";
      resetEnvCache();
      const sent: string[] = [];
      const fake: ResendClient = {
        emails: {
          send: async (payload) => {
            sent.push(payload.subject);
            return { data: { id: "msg_crm" }, error: null };
          },
        },
      };
      setResendClient(fake);

      const approved = await json(`/crm/users/${user!.id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({ status: "active" }),
      });
      expect(approved.status).toBe(200);
      expect(sent.some((subject) => subject.includes("approved"))).toBe(true);

      const messages = await database
        .select()
        .from(crmMessages)
        .where(eq(crmMessages.userId, user!.id));
      expect(messages.length).toBeGreaterThan(0);

      const login = await json("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      expect(login.status).toBe(200);
      expect((login.body as { accessToken?: string }).accessToken).toBeTruthy();
    } finally {
      await database.$close();
    }
  });

  test("disable revokes refresh tokens and blocks login", async () => {
    if (!(await databaseReachable())) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const registered = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Active Farmer",
        email: `active-${suffix}@crm.test`,
        password: "password12",
        company: `CRM Farm ${suffix}`,
      }),
    });
    expect(registered.status).toBe(200);
    const userId = (registered.body as { user: { id: string } }).user.id;
    const memberToken = (registered.body as { accessToken: string }).accessToken;

    const token = await operatorToken();
    if (!token) return;

    const disabled = await json(`/crm/users/${userId}/status`, {
      method: "POST",
      token,
      body: JSON.stringify({ status: "disabled", note: "spam" }),
    });
    expect(disabled.status).toBe(200);

    const database = createDatabase({ max: 1 });
    try {
      const open = await database
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      expect(open).toHaveLength(0);
    } finally {
      await database.$close();
    }

    const me = await json("/auth/me", { token: memberToken });
    expect(me.status).toBe(401);

    const login = await json("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: `active-${suffix}@crm.test`,
        password: "password12",
      }),
    });
    expect(login.status).toBe(403);
    expect((login.body as { code?: string }).code).toBe("account_disabled");
  });

  test("operator can email a producer and a demo lead", async () => {
    if (!(await databaseReachable())) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const registered = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Mail Farmer",
        email: `mail-${suffix}@crm.test`,
        password: "password12",
        company: `Mail Farm ${suffix}`,
      }),
    });
    expect(registered.status).toBe(200);
    const userId = (registered.body as { user: { id: string } }).user.id;

    const demo = await json("/demo-requests", {
      method: "POST",
      body: JSON.stringify({
        name: "Lead",
        company: "Lead Co",
        email: `lead-${suffix}@crm.test`,
        interests: "both",
      }),
    });
    expect(demo.status).toBe(200);
    const demoId = (demo.body as { id: string }).id;

    const token = await operatorToken();
    if (!token) return;

    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "CompliFine <notify@example.com>";
    resetEnvCache();
    const subjects: string[] = [];
    setResendClient({
      emails: {
        send: async (payload) => {
          subjects.push(payload.subject);
          return { data: { id: "msg" }, error: null };
        },
      },
    });

    const userMail = await json(`/crm/users/${userId}/email`, {
      method: "POST",
      token,
      body: JSON.stringify({ subject: "Hello producer", body: "Welcome aboard." }),
    });
    expect(userMail.status).toBe(200);
    expect((userMail.body as { sent: boolean }).sent).toBe(true);

    const demoMail = await json(`/demo-requests/${demoId}/email`, {
      method: "POST",
      token,
      body: JSON.stringify({ subject: "Demo follow-up", body: "When works for a call?" }),
    });
    expect(demoMail.status).toBe(200);
    expect((demoMail.body as { request: { status: string } }).request.status).toBe("contacted");
    expect(subjects).toEqual(["Hello producer", "Demo follow-up"]);

    const listed = await json("/crm/users?status=active", { token });
    expect(listed.status).toBe(200);
    expect(
      (listed.body as Array<{ email: string }>).some((row) => row.email === `mail-${suffix}@crm.test`),
    ).toBe(true);
  });
});
