import { describe, expect, test } from "bun:test";
import { EVAL_CASES, retrievalCases } from "../src/eval/cases.ts";

describe("evaluation suite", () => {
  test("every case has a unique id", () => {
    const ids = EVAL_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every case is a real question, not a placeholder", () => {
    for (const testCase of EVAL_CASES) {
      expect(testCase.question.trim().length).toBeGreaterThan(8);
      expect(testCase.category).toBeTruthy();
    }
  });

  test("refusal cases never carry retrieval ground truth", () => {
    for (const testCase of EVAL_CASES.filter((item) => item.category === "refusal")) {
      expect(testCase.expectRefusal).toBe(true);
      expect(testCase.expectedCriteria ?? []).toEqual([]);
      expect(testCase.expectedHeadings ?? []).toEqual([]);
    }
  });

  test("tool-oriented cases are excluded from the retrieval suite", () => {
    const ids = new Set(retrievalCases().map((testCase) => testCase.id));
    expect(ids.has("cross-gfs-only")).toBe(false);
    expect(ids.has("cross-postharvest-transition")).toBe(false);
    expect(ids.has("appl-no-irrigation")).toBe(false);
    expect(ids.has("para-reentry")).toBe(true);
    expect(ids.has("id-reentry")).toBe(true);
  });

  test("the retrieval suite is large enough to catch a silent regression", () => {
    expect(retrievalCases().length).toBeGreaterThanOrEqual(30);
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(40);
  });

  test("paraphrase cases do not contain the criterion number they are looking for", () => {
    for (const testCase of EVAL_CASES.filter((item) => item.category === "paraphrase")) {
      for (const criterion of testCase.expectedCriteria ?? []) {
        expect(testCase.question.includes(criterion)).toBe(false);
      }
    }
  });
});
