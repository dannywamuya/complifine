import { describe, expect, test } from "bun:test";
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

describe("pending work", () => {
  test("counts match overdue templates, and a draft moves one into pending", async () => {
    const ready = await json("/status");
    if (ready.status !== 200) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const created = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Pending",
        email: `pending-${suffix}@notify.test`,
        password: "password12",
        company: `Pending ${suffix}`,
      }),
    });
    expect(created.status).toBe(200);
    const token = (created.body as { accessToken: string }).accessToken;
    const site = await json("/sites", {
      method: "POST",
      token,
      body: JSON.stringify({ name: "Pending farm", siteType: "farm" }),
    });
    expect(site.status).toBe(200);
    const siteId = (site.body as { id: string }).id;

    const before = await json(`/sites/${siteId}/pending`, { token });
    expect(before.status).toBe(200);
    const first = before.body as {
      counts: { overdue: number; due: number; pending: number; missing: number };
      items: Array<{ eventType: string; urgency: string; templateId?: string }>;
    };
    const sum = first.counts.overdue + first.counts.due + first.counts.pending + first.counts.missing;
    expect(sum).toBe(first.items.length);
    expect(first.counts.overdue).toBe(first.items.filter((item) => item.urgency === "overdue").length);
    expect(first.counts.due).toBe(0);
    expect(first.counts.pending).toBe(0);
    expect(first.counts.overdue).toBeGreaterThan(0);

    const templateId = first.items.find((item) => item.eventType === "record_overdue")?.templateId;
    expect(templateId).toBeTruthy();
    const draft = await json("/form-records", {
      method: "POST",
      token,
      body: JSON.stringify({ siteId, templateId }),
    });
    expect(draft.status).toBe(200);

    const after = await json(`/sites/${siteId}/pending`, { token });
    const second = after.body as typeof first;
    expect(second.counts.pending).toBe(1);
    expect(second.counts.overdue).toBe(first.counts.overdue - 1);
    expect(second.counts.overdue + second.counts.due + second.counts.pending + second.counts.missing).toBe(
      second.items.length,
    );
    expect(second.items.some((item) => item.eventType === "record_draft" && item.templateId === templateId)).toBe(
      true,
    );
    expect(second.items.some((item) => item.eventType === "record_overdue" && item.templateId === templateId)).toBe(
      false,
    );
  });
});
