import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

const app = createApp();

async function json(path: string, init?: RequestInit) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    }),
  );
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, response };
}

async function databaseReachable(): Promise<boolean> {
  try {
    const { status } = await json("/status");
    return status === 200;
  } catch {
    return false;
  }
}

describe("farm tenancy", () => {
  test("one organisation cannot read another's site", async () => {
    if (!(await databaseReachable())) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const a = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner A",
        email: `a-${suffix}@farm.test`,
        password: "password12",
        company: `Farm A ${suffix}`,
      }),
    });
    const b = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Owner B",
        email: `b-${suffix}@farm.test`,
        password: "password12",
        company: `Farm B ${suffix}`,
      }),
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const tokenA = (a.body as { accessToken: string }).accessToken;
    const tokenB = (b.body as { accessToken: string }).accessToken;

    const created = await json("/sites", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: `Naivasha ${suffix}`, siteType: "farm" }),
    });
    expect(created.status).toBe(200);
    const siteId = (created.body as { id: string }).id;

    const stolen = await json(`/sites/${siteId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(stolen.status).toBe(404);

    const own = await json(`/sites/${siteId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(own.status).toBe(200);
  });
});
