import { describe, expect, test } from "bun:test";
import { titleFromFirstMessage } from "../src/title.ts";

describe("titleFromFirstMessage", () => {
  test("uses the first line, trimmed", () => {
    expect(titleFromFirstMessage("  When can workers re-enter?  ")).toBe("When can workers re-enter?");
  });

  test("ellipsizes long questions", () => {
    const title = titleFromFirstMessage("a".repeat(120), 40);
    expect(title.endsWith("…")).toBe(true);
    expect(title.length).toBe(40);
  });

  test("empty input becomes New chat", () => {
    expect(titleFromFirstMessage("   ")).toBe("New chat");
  });
});
