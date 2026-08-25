import { describe, expect, test } from "bun:test";
import { env } from "@complifine/core";
import { createApp } from "../src/app.ts";

const app = createApp();

function cookieHeader(response: Response): string {
  const lines =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return lines
    .filter(Boolean)
    .map((line) => line.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

async function json(path: string, init?: RequestInit) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    }),
  );
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, cookies: cookieHeader(response) };
}

async function databaseReachable(): Promise<boolean> {
  try {
    const { status } = await json("/status");
    return status === 200;
  } catch {
    return false;
  }
}

describe("published knowledge isolation", () => {
  test("members and anonymous callers only list published versions", async () => {
    if (!(await databaseReachable())) return;
    const { status, body } = await json("/versions");
    expect(status).toBe(200);
    for (const version of body.versions ?? []) {
      expect(version.status).toBe("published");
    }
  });

  test("an unpublished version code is 404 for a member, not 403", async () => {
    if (!(await databaseReachable())) return;

    const operatorEnv = env();
    const operator = await json("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: operatorEnv.OPERATOR_EMAIL,
        password: operatorEnv.OPERATOR_PASSWORD,
      }),
    });
    if (operator.status !== 200) return;

    const catalog = await json("/versions", { headers: { Cookie: operator.cookies } });
    const draft = (catalog.body.versions ?? []).find(
      (version: { status: string }) => version.status !== "published",
    ) as { code: string } | undefined;
    if (!draft) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const member = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Published Farmer",
        email: `published-${suffix}@farm.test`,
        password: "password12",
        company: `Published Farm ${suffix}`,
      }),
    });
    expect(member.status).toBe(200);

    const hidden = await json(`/versions/${draft.code}`, {
      headers: { Cookie: member.cookies },
    });
    expect(hidden.status).toBe(404);

    const visible = await json(`/versions/${draft.code}`, {
      headers: { Cookie: operator.cookies },
    });
    expect(visible.status).toBe(200);
  });

  test("review and promote require an operator", async () => {
    if (!(await databaseReachable())) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const member = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Promote Farmer",
        email: `promote-${suffix}@farm.test`,
        password: "password12",
        company: `Promote Farm ${suffix}`,
      }),
    });
    expect(member.status).toBe(200);

    const review = await json("/versions/ifa-v6-smart-fv/reviews", {
      method: "POST",
      headers: { Cookie: member.cookies },
      body: JSON.stringify({ decision: "approved", notes: "no" }),
    });
    expect([401, 403]).toContain(review.status);

    const promote = await json("/versions/ifa-v6-smart-fv/promote", {
      method: "POST",
      headers: { Cookie: member.cookies },
      body: JSON.stringify({ to: "retired" }),
    });
    expect([401, 403]).toContain(promote.status);

    const anon = await json("/versions/ifa-v6-smart-fv/promote", {
      method: "POST",
      body: JSON.stringify({ to: "retired", actor: "anon" }),
    });
    expect([401, 403]).toContain(anon.status);
  });

  test("GET /kb/health is operator-only", async () => {
    if (!(await databaseReachable())) return;
    const anon = await json("/kb/health");
    expect([401, 403]).toContain(anon.status);

    const operatorEnv = env();
    const operator = await json("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: operatorEnv.OPERATOR_EMAIL,
        password: operatorEnv.OPERATOR_PASSWORD,
      }),
    });
    if (operator.status !== 200) return;
    const health = await json("/kb/health", { headers: { Cookie: operator.cookies } });
    expect(health.status).toBe(200);
    expect(health.body.summary).toBeDefined();
    expect(Array.isArray(health.body.editions)).toBe(true);
    expect(health.body.briefing?.headline).toBeTruthy();
  });
});
