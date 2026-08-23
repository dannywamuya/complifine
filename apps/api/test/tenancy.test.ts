import { describe, expect, test } from "bun:test";
import { createDatabase, users } from "@complifine/db";
import { createApp } from "../src/app.ts";
import { hashPassword } from "../src/auth/crypto.ts";

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

  test("a member without an organisation can create a farm profile", async () => {
    if (!(await databaseReachable())) return;

    const database = createDatabase({ max: 1 });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `orphan-${suffix}@farm.test`;
    try {
      await database.insert(users).values({
        email,
        name: "Orphan Farmer",
        passwordHash: await hashPassword("password12"),
        kind: "member",
      });

      const login = await json("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: "password12" }),
      });
      expect(login.status).toBe(200);
      const token = (login.body as { accessToken: string }).accessToken;

      const empty = await json("/org", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(empty.status).toBe(200);
      expect((empty.body as { organization: unknown }).organization).toBeNull();

      const created = await json("/org", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: `New Farm ${suffix}`, country: "KE" }),
      });
      expect(created.status).toBe(200);
      expect((created.body as { name: string }).name).toBe(`New Farm ${suffix}`);

      const loaded = await json("/org", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(loaded.status).toBe(200);
      expect((loaded.body as { organization: { name: string } | null }).organization?.name).toBe(
        `New Farm ${suffix}`,
      );
    } finally {
      await database.$close();
    }
  });
});
