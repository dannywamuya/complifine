import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

describe("CompliFine API", () => {
  const app = createApp();

  test("GET /health reports liveness without touching the database", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "complifine-api" });
  });

  test("GET /swagger/json describes the service", async () => {
    const response = await app.handle(new Request("http://localhost/swagger/json"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { openapi?: string; info?: { title?: string } };
    expect(body.openapi).toMatch(/^3\./);
    expect(body.info?.title).toBe("CompliFine API");
  });

  test("POST /ingest without a session is rejected", async () => {
    const response = await app.handle(
      new Request("http://localhost/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "registry" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test("POST /demo-requests without a name is rejected", async () => {
    const response = await app.handle(
      new Request("http://localhost/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: "Kili Fresh", email: "ops@example.com", interests: "both" }),
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  test("POST /auth/register with a short password is rejected", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Ada",
          email: "ada@farm.ke",
          password: "short",
          company: "Kili Fresh",
        }),
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
