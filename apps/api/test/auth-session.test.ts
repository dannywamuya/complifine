import { describe, expect, test } from "bun:test";
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

function withoutCookie(header: string, name: string): string {
  return header
    .split("; ")
    .filter((part) => part && !part.startsWith(`${name}=`))
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
  return { status: response.status, body, cookies: cookieHeader(response), response };
}

async function databaseReachable(): Promise<boolean> {
  try {
    const { status } = await json("/status");
    return status === 200;
  } catch {
    return false;
  }
}

describe("auth session refresh", () => {
  test("a valid refresh cookie reissues access without rotating the refresh token", async () => {
    if (!(await databaseReachable())) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const registered = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Session Farmer",
        email: `session-${suffix}@farm.test`,
        password: "password12",
        company: `Session Farm ${suffix}`,
      }),
    });
    expect(registered.status).toBe(200);
    expect(registered.cookies).toContain("cf_refresh=");
    expect(registered.cookies).toContain("cf_access=");

    const refreshOnly = withoutCookie(registered.cookies, "cf_access");
    expect(refreshOnly).toContain("cf_refresh=");
    expect(refreshOnly).not.toContain("cf_access=");

    const me = await json("/auth/me", { headers: { Cookie: refreshOnly } });
    expect(me.status).toBe(200);
    expect((me.body as { email: string }).email).toBe(`session-${suffix}@farm.test`);
    expect(me.cookies).toContain("cf_access=");

    const first = await json("/auth/refresh", {
      method: "POST",
      headers: { Cookie: refreshOnly },
    });
    const second = await json("/auth/refresh", {
      method: "POST",
      headers: { Cookie: refreshOnly },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("no cookies is still unauthenticated", async () => {
    if (!(await databaseReachable())) return;
    const { status } = await json("/auth/me");
    expect(status).toBe(401);
  });
});
