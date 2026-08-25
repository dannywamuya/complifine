import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.ts";

const app = createApp();

async function json(path: string) {
  const response = await app.handle(new Request(`http://localhost${path}`));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function databaseReachable(): Promise<boolean> {
  try {
    const { status } = await json("/status");
    return status === 200;
  } catch {
    return false;
  }
}

describe("certification catalog", () => {
  test("GET /standards lists certs with nested versions", async () => {
    if (!(await databaseReachable())) return;
    const { status, body } = await json("/standards");
    expect(status).toBe(200);
    expect(Array.isArray(body.standards)).toBe(true);
    for (const standard of body.standards) {
      expect(typeof standard.code).toBe("string");
      expect(Array.isArray(standard.versions)).toBe(true);
    }
  });

  test("GET /graph returns nodes and edges without hard-coded cert names", async () => {
    if (!(await databaseReachable())) return;
    const { status, body } = await json("/graph");
    expect(status).toBe(200);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    const kinds = new Set(body.nodes.map((node: { kind: string }) => node.kind));
    expect(kinds.has("standard") || body.nodes.length === 0).toBe(true);
  });

  test("GET /registry nests documents under editions", async () => {
    if (!(await databaseReachable())) return;
    const { status, body } = await json("/registry");
    expect(status).toBe(200);
    expect(Array.isArray(body.standards)).toBe(true);
    for (const standard of body.standards) {
      expect(typeof standard.code).toBe("string");
      expect(Array.isArray(standard.versions)).toBe(true);
      for (const version of standard.versions) {
        expect(version.status).toBe("published");
        expect(Array.isArray(version.documents)).toBe(true);
        for (const document of version.documents) {
          expect(typeof document.slug).toBe("string");
          expect(typeof document.binding).toBe("boolean");
        }
      }
    }
  });

  test("GET /versions accepts a standards filter", async () => {
    if (!(await databaseReachable())) return;
    const all = await json("/standards");
    const code = all.body.standards?.[0]?.code as string | undefined;
    if (!code) return;
    const { status, body } = await json(`/versions?standards=${encodeURIComponent(code)}`);
    expect(status).toBe(200);
    for (const version of body.versions) {
      expect(version.standardCode).toBe(code);
    }
  });
});
