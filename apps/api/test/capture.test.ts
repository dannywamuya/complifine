import { describe, expect, test } from "bun:test";
import { and, companyDocuments, createDatabase, eq, evidence } from "@complifine/db";
import type { CaptureGenerator } from "@complifine/ai";
import { createApp } from "../src/app.ts";

const generator: CaptureGenerator = async () => ({
  header: [
    { key: "course", value: "Hygiene", confidence: 0.9, source: "Hygiene" },
    { key: "date", value: "2026-10-01", confidence: 0.9, source: "1 Oct" },
    { key: "trainers", value: "Mary", confidence: 0.8, source: "Mary" },
  ],
  entries: [
    {
      item: null,
      fields: [
        { key: "trainee", value: "Amina", confidence: 0.95, source: "Amina" },
        { key: "signed", value: true, confidence: 0.7, source: "signed" },
      ],
    },
  ],
});

const app = createApp(createDatabase(), { capture: generator });

async function json(path: string, init?: RequestInit & { token?: string }) {
  const headers = new Headers(init?.headers);
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await app.handle(new Request(`http://localhost${path}`, { ...init, headers }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

describe("capture drafts", () => {
  test("a capture stays a draft until someone confirms it", async () => {
    const status = await json("/status");
    if (status.status !== 200) return;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const registered = await json("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Capture",
        email: `capture-${suffix}@records.test`,
        password: "password12",
        company: `Capture ${suffix}`,
      }),
    });
    expect(registered.status).toBe(200);
    const token = (registered.body as { accessToken: string }).accessToken;
    const site = await json("/sites", {
      method: "POST",
      token,
      body: JSON.stringify({ name: "Field", siteType: "farm" }),
    });
    const siteId = (site.body as { id: string }).id;
    const listed = await json("/form-templates?siteType=farm", { token });
    const templateId = (listed.body as { templates: Array<{ id: string; slug: string }> }).templates.find(
      (row) => row.slug === "training-record",
    )!.id;

    const form = new FormData();
    form.set("siteId", siteId);
    form.set("templateId", templateId);
    form.set("file", new File(["Hygiene, Amina, Mary"], "register.csv", { type: "text/csv" }));
    const captured = await json("/form-records/capture", { method: "POST", token, body: form });
    expect(captured.status).toBe(200);
    const draftId = (captured.body as { drafts: Array<{ id: string; entries: unknown[] }> }).drafts[0]?.id;
    expect(draftId).toBeTruthy();

    const db = createDatabase({ max: 1 });
    try {
      const rows = await db.select().from(evidence).where(eq(evidence.siteId, siteId));
      expect(rows.length).toBe(0);
      const docs = await db
        .select()
        .from(companyDocuments)
        .where(and(eq(companyDocuments.siteId, siteId), eq(companyDocuments.purpose, "capture_source")));
      expect(docs.length).toBe(1);
    } finally {
      await db.$close();
    }

    const confirmed = await json(`/form-records/${draftId}/confirm`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    });
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as { evidence: { id: string }; status: string }).status).toBe("submitted");
    expect((confirmed.body as { evidence: { id: string } }).evidence.id).toBeTruthy();
  });
});
