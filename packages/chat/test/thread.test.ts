import { describe, expect, test } from "bun:test";
import { deepestDescendant, descendantsOf, siblingsOf, walkPath } from "../src/thread.ts";

const t = (
  id: string,
  parentId: string | null,
  role: string,
  createdAt: string,
) => ({ id, parentId, role, createdAt });

describe("walkPath", () => {
  test("walks from leaf to root in order", () => {
    const messages = [
      t("u1", null, "user", "2026-01-01T00:00:00Z"),
      t("a1", "u1", "assistant", "2026-01-01T00:00:01Z"),
      t("u2", "a1", "user", "2026-01-01T00:00:02Z"),
      t("a2", "u2", "assistant", "2026-01-01T00:00:03Z"),
    ];
    expect(walkPath(messages, "a2").map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  test("falls back to the newest message when the leaf is missing", () => {
    const messages = [
      t("a", null, "user", "2026-01-01T00:00:00Z"),
      t("b", "a", "assistant", "2026-01-01T00:00:02Z"),
    ];
    expect(walkPath(messages, "missing").map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("branching", () => {
  test("edit creates a sibling user message; siblingsOf lists versions", () => {
    const messages = [
      t("u1", null, "user", "2026-01-01T00:00:00Z"),
      t("a1", "u1", "assistant", "2026-01-01T00:00:01Z"),
      t("u1b", null, "user", "2026-01-01T00:00:02Z"),
      t("a1b", "u1b", "assistant", "2026-01-01T00:00:03Z"),
    ];
    expect(siblingsOf(messages, "u1").map((m) => m.id)).toEqual(["u1", "u1b"]);
    expect(walkPath(messages, "a1b").map((m) => m.id)).toEqual(["u1b", "a1b"]);
    expect(walkPath(messages, "a1").map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  test("regenerate lists assistant siblings and deepestDescendant follows the latest child", () => {
    const messages = [
      t("u1", null, "user", "2026-01-01T00:00:00Z"),
      t("a1", "u1", "assistant", "2026-01-01T00:00:01Z"),
      t("a2", "u1", "assistant", "2026-01-01T00:00:02Z"),
      t("u2", "a2", "user", "2026-01-01T00:00:03Z"),
    ];
    expect(siblingsOf(messages, "a1").map((m) => m.id)).toEqual(["a1", "a2"]);
    expect(deepestDescendant(messages, "a2")).toBe("u2");
    expect(deepestDescendant(messages, "a1")).toBe("a1");
  });

  test("descendantsOf includes the node and every child", () => {
    const messages = [
      t("u1", null, "user", "2026-01-01T00:00:00Z"),
      t("a1", "u1", "assistant", "2026-01-01T00:00:01Z"),
      t("u2", "a1", "user", "2026-01-01T00:00:02Z"),
    ];
    expect(descendantsOf(messages, "a1").sort()).toEqual(["a1", "u2"]);
  });
});
