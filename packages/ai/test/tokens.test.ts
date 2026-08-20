import { describe, expect, test } from "bun:test";
import { estimateTokens, tokenBudgetToChars } from "../src/tokens.ts";

describe("token estimation", () => {
  test("empty text is zero tokens", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("a short word is at least one token", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  test("character budget and token budget round-trip within one token", () => {
    const chars = tokenBudgetToChars(800);
    expect(estimateTokens("x".repeat(chars))).toBeLessThanOrEqual(800);
    expect(estimateTokens("x".repeat(chars + 4))).toBeGreaterThan(800);
  });
});
