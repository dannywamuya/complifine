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
      email: `${name}-${suffix}@records.test`,
      password: "password12",
      company: `${name} ${suffix}`,
    }),
  });
  expect(created.status).toBe(200);
  const token = (created.body as { accessToken: string }).accessToken;
  const site = await json("/sites", {
    method: "POST",
    token,
    body: JSON.stringify({ name: `Site ${name}`, siteType: "farm" }),
  });
  expect(site.status).toBe(200);
  return { token, siteId: (site.body as { id: string }).id };
}

async function template(token: string, slug: string) {
  const listed = await json("/form-templates?siteType=farm", { token });
  expect(listed.status).toBe(200);
  const found = (listed.body as { templates: Array<{ id: string; slug: string }> }).templates.find(
    (row) => row.slug === slug,
  );
  expect(found).toBeTruthy();
  return found!.id;
}

describe("form records", () => {
  test("another organisation cannot read a record", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const a = await register(suffix, "a");
    const b = await register(suffix, "b");
    const templateId = await template(a.token, "training-record");

    const record = await json("/form-records", {
      method: "POST",
      token: a.token,
      body: JSON.stringify({
        siteId: a.siteId,
        templateId,
        header: { course: "Hygiene", date: "2026-10-01", trainers: "Mary" },
      }),
    });
    expect(record.status).toBe(200);
    const id = (record.body as { id: string }).id;

    const stolen = await json(`/form-records/${id}`, { token: b.token });
    expect(stolen.status).toBe(404);
  });

  test("an invalid entry is rejected and a valid submit creates evidence", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "owner");
    const templateId = await template(owner.token, "training-record");
    const record = await json("/form-records", {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        siteId: owner.siteId,
        templateId,
        header: { course: "First aid", date: "2026-10-01", trainers: "Mary" },
      }),
    });
    const id = (record.body as { id: string }).id;

    const invalid = await json(`/form-records/${id}/entries`, {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({ data: { signed: true } }),
    });
    expect(invalid.status).toBe(422);

    const entry = await json(`/form-records/${id}/entries`, {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({ data: { trainee: "Amina", signed: true } }),
    });
    expect(entry.status).toBe(200);

    const submitted = await json(`/form-records/${id}`, {
      method: "PATCH",
      token: owner.token,
      body: JSON.stringify({ status: "submitted" }),
    });
    expect(submitted.status).toBe(200);
    const evidenceId = (submitted.body as { evidence: { id: string } }).evidence.id;
    expect(evidenceId).toBeTruthy();
    expect((submitted.body as { freshness: string }).freshness).toBe("current");
  });

  test("a daily record older than its cadence is stale", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "daily");
    const templateId = await template(owner.token, "toilet-cleaning");
    const record = await json("/form-records", {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        siteId: owner.siteId,
        templateId,
        header: { location: "Packhouse block" },
      }),
    });
    const id = (record.body as { id: string }).id;
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const entry = await json(`/form-records/${id}/entries`, {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        recordedAt: old,
        data: {
          item: "toilet-bowls-and-cistern",
          date: "2026-01-01",
          cleaned: true,
          cleaned_by: "Amina",
          checked_by: "Mary",
        },
      }),
    });
    expect(entry.status).toBe(200);

    const submitted = await json(`/form-records/${id}`, {
      method: "PATCH",
      token: owner.token,
      body: JSON.stringify({ status: "submitted" }),
    });
    expect(submitted.status).toBe(200);
    expect((submitted.body as { freshness: string }).freshness).toBe("stale");
  });

  test("a variant cannot change columns", async () => {
    if (!(await databaseReachable())) return;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const owner = await register(suffix, "variant");
    const templateId = await template(owner.token, "training-record");
    const rejected = await json(`/form-templates/${templateId}/variant`, {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        docRef: "DOC-08",
        entryFields: [{ key: "extra", label: "Extra", type: "text" }],
      }),
    });
    expect(rejected.status).toBe(422);

    const created = await json(`/form-templates/${templateId}/variant`, {
      method: "POST",
      token: owner.token,
      body: JSON.stringify({
        docRef: "DOC-08",
        headerDefaults: { trainers: "Site manager" },
      }),
    });
    expect(created.status).toBe(200);
    const columns = (created.body as { definition: { entryFields: Array<{ key: string }> } }).definition
      .entryFields;
    expect(columns.map((field) => field.key)).toEqual(["trainee", "signed"]);
    expect((created.body as { docRef: string }).docRef).toBe("DOC-08");
  });
});
