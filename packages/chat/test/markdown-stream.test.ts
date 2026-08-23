import { describe, expect, test } from "bun:test";
import { extractArtifacts, stabilizeMarkdown } from "../src/markdown-stream.ts";

describe("stabilizeMarkdown", () => {
  test("closes an unclosed fenced code block", () => {
    const out = stabilizeMarkdown("hello\n```ts\nconst x = 1");
    expect(out.endsWith("```")).toBe(true);
  });

  test("closes unclosed inline code", () => {
    expect(stabilizeMarkdown("use `code")).toContain("`");
    expect(stabilizeMarkdown("use `code` still").startsWith("use `code`")).toBe(true);
  });

  test("closes unclosed display math", () => {
    expect(stabilizeMarkdown("$$\\frac{1}{2}").trim().endsWith("$$")).toBe(true);
  });

  test("leaves complete markdown alone", () => {
    const src = "# Hi\n\n```js\n1\n```\n\n`ok`";
    expect(stabilizeMarkdown(src)).toBe(src);
  });
});

describe("extractArtifacts", () => {
  test("pulls fenced blocks out of an answer", () => {
    const arts = extractArtifacts("intro\n```sql\nSELECT 1\n```\n");
    expect(arts).toEqual([{ language: "sql", code: "SELECT 1", title: "sql artifact" }]);
  });
});
