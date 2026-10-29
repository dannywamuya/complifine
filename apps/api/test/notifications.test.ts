import { afterEach, describe, expect, test } from "bun:test";
import { createDatabase, eq, evidence, memberships } from "@complifine/db";
import { resetEnvCache } from "@complifine/core";
import { withinLeadDays } from "../src/digest.ts";
import { setResendClient, type ResendClient } from "../src/email/resend.ts";
import type { PendingItem } from "../src/pending.ts";
import { createApp } from "../src/app.ts";

const app = createApp();

async function json(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`);
  const response = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function databaseReachable(): Promise<boolean> {
  try {
    return (await json("/status")).status === 200;
  } catch {
    return false;
  }
}

async function register(suffix: string, name: string) {
  const created = await json("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      email: `${name}-${suffix}@notify.test`,
      password: "password12",
      company: `${name} ${suffix}`,
    }),
  });
  expect(created.status).toBe(200);
  const token = (created.body as { accessToken: string }).accessToken;
  const userId = (created.body as { user: { id: string } }).user.id;
  return { token, userId, email: `${name}-${suffix}@notify.test` };
}

async function addSite(token: string) {
  const site = await json("/sites", {
    method: "POST",
    token,
    body: JSON.stringify({ name: "North field", siteType: "farm" }),
  });
  expect(site.status).toBe(200);
  return (site.body as { id: string }).id;
}

describe("notification preferences", () => {
  test("defaults fill in, and an invalid hour or timezone is rejected", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "prefs");
    const loaded = await json("/notification-preferences", { token: owner.token });
    expect(loaded.status).toBe(200);
    const body = loaded.body as {
      settings: { deliveryHourLocal: number; timezone: string; siteIds: string[] | null };
      preferences: Array<{ eventType: string; channel: string; enabled: boolean; digest: string; leadDays: number }>;
    };
    expect(body.settings.deliveryHourLocal).toBe(7);
    expect(body.settings.timezone).toBe("Africa/Nairobi");
    expect(body.settings.siteIds).toBeNull();
    const inApp = body.preferences.filter((row) => row.channel === "in_app");
    expect(inApp.map((row) => row.eventType)).toEqual([
      "record_overdue",
      "record_due",
      "record_sent_back",
      "record_draft",
      "evidence_missing",
      "evidence_expired",
      "daily_digest",
      "audit_complete",
    ]);
    expect(inApp.find((row) => row.eventType === "record_draft")?.enabled).toBe(false);
    expect(inApp.find((row) => row.eventType === "record_overdue")?.enabled).toBe(true);
    expect(inApp.find((row) => row.eventType === "audit_complete")?.digest).toBe("immediate");
    expect(inApp.filter((row) => row.eventType !== "audit_complete").every((row) => row.digest === "daily")).toBe(true);
    expect(inApp.every((row) => row.leadDays === 7)).toBe(true);
    const email = body.preferences.filter((row) => row.channel === "email");
    expect(email).toHaveLength(inApp.length);
    expect(email.every((row) => row.enabled === false)).toBe(true);

    const hour = await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({
        settings: { ...body.settings, deliveryHourLocal: 24 },
        preferences: inApp,
      }),
    });
    expect(hour.status).toBe(422);

    const zone = await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({
        settings: { ...body.settings, timezone: "Not/Azone" },
        preferences: inApp,
      }),
    });
    expect(zone.status).toBe(422);

    const saved = await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({
        settings: { ...body.settings, deliveryHourLocal: 8 },
        preferences: inApp.map((row) => (row.eventType === "record_due" ? { ...row, leadDays: 3 } : row)),
      }),
    });
    expect(saved.status).toBe(200);
    const next = saved.body as typeof body;
    expect(next.settings.deliveryHourLocal).toBe(8);
    expect(next.preferences.find((row) => row.eventType === "record_due")?.leadDays).toBe(3);
  });
});

describe("notification tenancy", () => {
  test("another person cannot read or change a notification", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const a = await register(suffix, "owner-a");
    const b = await register(suffix, "owner-b");
    await addSite(a.token);
    const ran = await json("/notifications/run-digest", { method: "POST", token: a.token });
    expect(ran.status).toBe(200);
    expect((ran.body as { inserted: number }).inserted).toBeGreaterThan(0);

    const mine = await json("/notifications", { token: a.token });
    const id = (mine.body as { notifications: Array<{ id: string }> }).notifications[0]?.id;
    expect(id).toBeTruthy();

    const theirs = await json("/notifications", { token: b.token });
    expect(theirs.status).toBe(200);
    expect((theirs.body as { notifications: unknown[]; unreadCount: number }).notifications).toEqual([]);
    expect((theirs.body as { unreadCount: number }).unreadCount).toBe(0);

    const stolen = await json(`/notifications/${id}`, {
      method: "PATCH",
      token: b.token,
      body: JSON.stringify({ read: true }),
    });
    expect(stolen.status).toBe(404);
  });

  test("a viewer cannot send the summary", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const viewer = await register(suffix, "viewer");
    const db = createDatabase({ max: 1 });
    try {
      await db
        .update(memberships)
        .set({ role: "viewer", updatedAt: new Date() })
        .where(eq(memberships.userId, viewer.userId));
    } finally {
      await db.$close();
    }
    const signed = await json("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: viewer.email, password: "password12" }),
    });
    expect(signed.status).toBe(200);
    const token = (signed.body as { accessToken: string }).accessToken;
    const denied = await json("/notifications/run-digest", { method: "POST", token });
    expect(denied.status).toBe(403);
  });
});

describe("daily digest", () => {
  test("a due record outside the lead window is skipped, and a second run inserts nothing", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "lead");
    const siteId = await addSite(owner.token);
    const listed = await json("/form-templates?siteType=farm", { token: owner.token });
    const templateId = (listed.body as { templates: Array<{ id: string; slug: string }> }).templates.find(
      (row) => row.slug === "crate-cleaning",
    )?.id;
    expect(templateId).toBeTruthy();
    const record = await json("/form-records", {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({ siteId, templateId }),
    });
    expect(record.status).toBe(200);
    const recordId = (record.body as { id: string }).id;
    const entry = await json(`/form-records/${recordId}/entries`, {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({ data: { date: "2026-10-22", count: 3, cleaned_by: "Amina" } }),
    });
    expect(entry.status).toBe(200);
    const submitted = await json(`/form-records/${recordId}`, {
      method: "PATCH",
      token: owner.token,
      body: JSON.stringify({ status: "submitted" }),
    });
    expect(submitted.status).toBe(200);
    const evidenceId = (submitted.body as { evidence: { id: string } }).evidence.id;
    const db = createDatabase({ max: 1 });
    try {
      await db
        .update(evidence)
        .set({ expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), updatedAt: new Date() })
        .where(eq(evidence.id, evidenceId));
    } finally {
      await db.$close();
    }

    const prefs = await json("/notification-preferences", { token: owner.token });
    const state = prefs.body as {
      settings: Record<string, unknown>;
      preferences: Array<{ eventType: string; leadDays: number }>;
    };
    const zero = await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({
        settings: state.settings,
        preferences: state.preferences.map((row) => (row.eventType === "record_due" ? { ...row, leadDays: 0 } : row)),
      }),
    });
    expect(zero.status).toBe(200);

    const first = await json("/notifications/run-digest", { method: "POST", token: owner.token });
    expect(first.status).toBe(200);
    const afterZero = await json("/notifications?limit=50", { token: owner.token });
    const rows = (afterZero.body as { notifications: Array<{ eventType: string }> }).notifications;
    expect(rows.some((row) => row.eventType === "record_due")).toBe(false);

    await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({
        settings: state.settings,
        preferences: state.preferences.map((row) => (row.eventType === "record_due" ? { ...row, leadDays: 7 } : row)),
      }),
    });
    const second = await json("/notifications/run-digest", { method: "POST", token: owner.token });
    expect((second.body as { inserted: number }).inserted).toBeGreaterThan(0);
    const afterSeven = await json("/notifications?limit=50", { token: owner.token });
    const dueRows = (afterSeven.body as { notifications: Array<{ eventType: string }> }).notifications.filter(
      (row) => row.eventType === "record_due",
    );
    expect(dueRows).toHaveLength(1);

    const again = await json("/notifications/run-digest", { method: "POST", token: owner.token });
    expect((again.body as { inserted: number }).inserted).toBe(0);
    const stable = await json("/notifications?limit=50", { token: owner.token });
    expect(
      (stable.body as { notifications: Array<{ eventType: string }> }).notifications.filter(
        (row) => row.eventType === "record_due",
      ),
    ).toHaveLength(1);
  });

  test("digest off suppresses a draft, and turning it on inserts it once", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "drafts");
    const siteId = await addSite(owner.token);
    const listed = await json("/form-templates?siteType=farm", { token: owner.token });
    const templateId = (listed.body as { templates: Array<{ id: string; slug: string }> }).templates.find(
      (row) => row.slug === "training-record",
    )?.id;
    expect(templateId).toBeTruthy();
    const record = await json("/form-records", {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        siteId,
        templateId,
        header: { course: "Hygiene", date: "2026-10-01", trainers: "Mary" },
      }),
    });
    expect(record.status).toBe(200);

    const first = await json("/notifications/run-digest", { method: "POST", token: owner.token });
    expect(first.status).toBe(200);
    const hidden = await json("/notifications?limit=50", { token: owner.token });
    expect(
      (hidden.body as { notifications: Array<{ eventType: string }> }).notifications.some(
        (row) => row.eventType === "record_draft",
      ),
    ).toBe(false);

    const prefs = await json("/notification-preferences", { token: owner.token });
    const state = prefs.body as {
      settings: Record<string, unknown>;
      preferences: Array<{ eventType: string; channel: string; enabled: boolean }>;
    };
    const enabled = await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({
        settings: state.settings,
        preferences: state.preferences.map((row) =>
          row.eventType === "record_draft" && row.channel === "in_app" ? { ...row, enabled: true } : row,
        ),
      }),
    });
    expect(enabled.status).toBe(200);
    const second = await json("/notifications/run-digest", { method: "POST", token: owner.token });
    expect((second.body as { inserted: number }).inserted).toBe(1);
    const shown = await json("/notifications?limit=50", { token: owner.token });
    expect(
      (shown.body as { notifications: Array<{ eventType: string }> }).notifications.filter(
        (row) => row.eventType === "record_draft",
      ),
    ).toHaveLength(1);
    const third = await json("/notifications/run-digest", { method: "POST", token: owner.token });
    expect((third.body as { inserted: number }).inserted).toBe(0);
  });

  test("a due item is inside a 7 day lead and outside a 0 day lead", () => {
    const soon: PendingItem = {
      kind: "record",
      urgency: "due",
      eventType: "record_due",
      title: "Crate cleaning record",
      href: "/app/records/new",
      subjectKey: "site:template",
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
    const overdue: PendingItem = { ...soon, eventType: "record_overdue", urgency: "overdue", expiresAt: null };
    expect(withinLeadDays(soon, 0, new Date())).toBe(false);
    expect(withinLeadDays(soon, 7, new Date())).toBe(true);
    expect(withinLeadDays(overdue, 0, new Date())).toBe(true);
  });

  test("email sends one summary per site, not one message per item", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "emailer");
    const siteId = await addSite(owner.token);
    const listed = await json("/form-templates?siteType=farm", { token: owner.token });
    const templateId = (listed.body as { templates: Array<{ id: string; slug: string }> }).templates.find(
      (row) => row.slug === "training-record",
    )?.id;
    expect(templateId).toBeTruthy();
    const record = await json("/form-records", {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        siteId,
        templateId,
        header: { course: "Hygiene", date: "2026-10-01", trainers: "Mary" },
      }),
    });
    expect(record.status).toBe(200);

    const prefs = await json("/notification-preferences", { token: owner.token });
    const state = prefs.body as {
      settings: Record<string, unknown>;
      preferences: Array<{ eventType: string; channel: string; enabled: boolean; digest: string; leadDays: number }>;
    };
    const mirrored = state.preferences.map((row) => {
      if (row.eventType === "record_draft") return { ...row, enabled: true };
      if (row.channel === "email") {
        const inApp = state.preferences.find(
          (other) => other.channel === "in_app" && other.eventType === row.eventType,
        );
        return { ...row, enabled: inApp?.enabled ?? false };
      }
      return row;
    });
    const saved = await json("/notification-preferences", {
      method: "PUT",
      token: owner.token,
      body: JSON.stringify({ settings: state.settings, preferences: mirrored }),
    });
    expect(saved.status).toBe(200);

    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "CompliFine <notify@example.com>";
    process.env.APP_BASE_URL = "https://complifine.com";
    resetEnvCache();
    const sent: Array<{ to: string[]; subject: string; text: string }> = [];
    const fake: ResendClient = {
      emails: {
        send: async (payload) => {
          sent.push({ to: payload.to, subject: payload.subject, text: payload.text });
          return { data: { id: "msg_1" }, error: null };
        },
      },
    };
    setResendClient(fake);

    try {
      const first = await json("/notifications/run-digest", { method: "POST", token: owner.token });
      expect(first.status).toBe(200);
      // in-app: item (+ maybe digest); email: one summary only
      expect((first.body as { inserted: number }).inserted).toBeGreaterThanOrEqual(2);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toEqual([owner.email]);
      expect(sent[0]?.subject).toMatch(/pending|draft|overdue|due|missing/i);

      const again = await json("/notifications/run-digest", { method: "POST", token: owner.token });
      expect((again.body as { inserted: number }).inserted).toBe(0);
      expect(sent).toHaveLength(1);
    } finally {
      setResendClient(null);
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;
      delete process.env.APP_BASE_URL;
      resetEnvCache();
    }
  });
});

afterEach(() => {
  setResendClient(null);
});
