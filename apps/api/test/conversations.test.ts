import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

const app = createApp();

describe("conversations API", () => {
  test("GET /conversations requires a session", async () => {
    const response = await app.handle(new Request("http://localhost/conversations"));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string };
    expect(typeof body.error).toBe("string");
  });

  test("POST /conversations requires a session", async () => {
    const response = await app.handle(
      new Request("http://localhost/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test" }),
      }),
    );
    expect(response.status).toBe(401);
  });
});
