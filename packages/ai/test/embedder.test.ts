import { describe, expect, test } from "bun:test";
import { hashEmbedder, hashEmbedding, isQuotaExhausted } from "../src/embed/provider.ts";

describe("hashEmbedder", () => {
  test("identical text has cosine similarity 1", async () => {
    const embedder = hashEmbedder(32);
    const { embeddings } = await embedder.embed(["re-entry times", "re-entry times"]);
    const [a, b] = embeddings;
    const cosine = a!.reduce((sum, value, i) => sum + value * b![i]!, 0);
    expect(cosine).toBeCloseTo(1, 10);
  });

  test("empty text still produces a unit vector pgvector can compare", () => {
    const vector = hashEmbedding("", 8);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 10);
    expect(vector.some((value) => value !== 0)).toBe(true);
  });

  test("shared vocabulary increases similarity monotonically", () => {
    const a = hashEmbedding("plant protection product re-entry", 64);
    const close = hashEmbedding("plant protection product application", 64);
    const far = hashEmbedding("energy efficiency greenhouse gases", 64);
    const cosine = (x: number[], y: number[]) =>
      x.reduce((sum, value, i) => sum + value * y[i]!, 0);
    expect(cosine(a, close)).toBeGreaterThan(cosine(a, far));
  });
});

describe("isQuotaExhausted", () => {
  test("recognises OpenAI's billing 429 bodies", () => {
    expect(
      isQuotaExhausted(`{"error":{"code":"insufficient_quota","type":"insufficient_quota"}}`),
    ).toBe(true);
    expect(isQuotaExhausted(`{"error":{"code":"credit_balance_exhausted"}}`)).toBe(true);
    expect(isQuotaExhausted(`{"error":{"code":"rate_limit_exceeded"}}`)).toBe(false);
  });
});
