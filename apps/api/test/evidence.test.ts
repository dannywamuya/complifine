import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

const app = createApp();

async function json(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

describe("evidence tenancy", () => {
  test("another organisation cannot read a document or the gap", async () => {
    const ready = await json("/status");
    if (ready.status !== 200) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const registered = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Ev",
        email: `ev-${suffix}@records.test`,
        password: "password12",
        company: `Ev ${suffix}`,
      }),
    });
    const token = (registered.body as { accessToken: string }).accessToken;
    const other = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Other",
        email: `other-${suffix}@records.test`,
        password: "password12",
        company: `Other ${suffix}`,
      }),
    });
    const tokenB = (other.body as { accessToken: string }).accessToken;
    const site = await json("/sites", {
      method: "POST",
      token,
      body: JSON.stringify({ name: "North", siteType: "farm" }),
    });
    const siteId = (site.body as { id: string }).id;
    await json("/org/scopes", {
      method: "POST",
      token,
      body: JSON.stringify({ versionCode: "ifa-v6-gfs-fv" }),
    });

    const form = new FormData();
    form.set("siteId", siteId);
    form.set("file", new File(["lab"], "water.pdf", { type: "application/pdf" }));
    const uploaded = await json("/documents", { method: "POST", token, body: form });
    expect(uploaded.status).toBe(200);
    const documentId = (uploaded.body as { id: string }).id;

    const stolen = await json(`/documents/${documentId}/file`, { token: tokenB });
    expect(stolen.status).toBe(404);

    const gap = await json(`/sites/${siteId}/evidence-gap?versionCode=ifa-v6-gfs-fv`, { token });
    expect(gap.status).toBe(200);
    expect((gap.body as { counts: { missing: number } }).counts.missing).toBeGreaterThan(0);

    const foreign = await json(`/sites/${siteId}/evidence-gap?versionCode=ifa-v6-gfs-fv`, { token: tokenB });
    expect(foreign.status).toBe(404);
  });
});
