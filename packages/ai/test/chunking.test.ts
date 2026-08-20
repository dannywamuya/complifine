import { describe, expect, test } from "bun:test";
import { chunkHash, chunkProse, chunkRequirements } from "../src/chunking/index.ts";
import { splitIntoSentences, splitText } from "../src/chunking/split.ts";
import { estimateTokens } from "../src/tokens.ts";

describe("splitIntoSentences", () => {
  test("does not split on GLOBALG.A.P. or e.g.", () => {
    const sentences = splitIntoSentences(
      "The GLOBALG.A.P. Number (GGN) is used. See e.g. the trademark policy.",
    );
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain("GLOBALG.A.P.");
    expect(sentences[1]).toContain("e.g.");
  });
});

describe("splitText", () => {
  test("returns a single window when the text fits", () => {
    const windows = splitText("Short clause.", { maxTokens: 800, overlapTokens: 100 });
    expect(windows).toEqual([{ text: "Short clause.", index: 0, tokenCount: estimateTokens("Short clause.") }]);
  });

  test("never cuts a sentence in half, even when it exceeds the budget", () => {
    const long = "A".repeat(2000) + ".";
    const windows = splitText(long, { maxTokens: 50, overlapTokens: 10 });
    expect(windows).toHaveLength(1);
    expect(windows[0]?.text).toBe(long);
  });

  test("overlaps adjacent windows so a rule and its exception stay co-retrievable", () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`);
    const windows = splitText(sentences.join(" "), { maxTokens: 20, overlapTokens: 8 });
    expect(windows.length).toBeGreaterThan(1);
    // The last sentence of window 0 appears at the start of window 1.
    const firstTail = windows[0]!.text.split(". ").at(-1)!;
    expect(windows[1]!.text).toContain(firstTail.slice(0, 20));
  });
});

describe("chunkRequirements", () => {
  test("emits one chunk per criterion, never split, with identity in the text", () => {
    const chunks = chunkRequirements([
      {
        requirementVersionId: "req-1",
        sourceRequirementId: "FV-Smart 32.10.06",
        levelLabel: "Major Must",
        principleText: "The farm has documented procedures addressing re-entry times.",
        criteriaText: "Procedures are available and implemented.",
        sectionId: "sec-32-10",
        sectionPath: ["FV 32 PLANT PROTECTION PRODUCTS", "FV 32.10 Mixing and handling"],
        sourcePage: 76,
        sortKey: 321006,
      },
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkType).toBe("requirement");
    expect(chunks[0]?.text).toContain("FV-Smart 32.10.06");
    expect(chunks[0]?.text).toContain("Major Must");
    expect(chunks[0]?.text).toContain("Principle:");
    expect(chunks[0]?.text).toContain("Criteria:");
    expect(chunks[0]?.heading).toContain("FV 32.10 Mixing and handling");
    expect(chunks[0]?.contentHash).toBe(
      chunkHash(chunks[0]!.heading, chunks[0]!.text),
    );
  });

  test("orders by sortKey rather than input order", () => {
    const chunks = chunkRequirements([
      {
        requirementVersionId: "b",
        sourceRequirementId: "FV-Smart 02.01",
        levelLabel: "Major Must",
        principleText: "Later.",
        criteriaText: null,
        sectionId: null,
        sectionPath: [],
        sourcePage: null,
        sortKey: 201,
      },
      {
        requirementVersionId: "a",
        sourceRequirementId: "FV-Smart 01.01",
        levelLabel: "Minor Must",
        principleText: "Earlier.",
        criteriaText: null,
        sectionId: null,
        sectionPath: [],
        sourcePage: null,
        sortKey: 101,
      },
    ]);

    expect(chunks.map((chunk) => chunk.requirementVersionId)).toEqual(["a", "b"]);
    expect(chunks[0]?.ordinal).toBe(0);
    expect(chunks[1]?.ordinal).toBe(1);
  });
});

describe("chunkProse", () => {
  test("skips empty bodies and prefixes every window with its heading", () => {
    const chunks = chunkProse([
      {
        sectionId: "empty",
        identifier: "9",
        title: "Empty",
        body: "   ",
        ancestorPath: [],
        sourcePage: 1,
        order: 9,
      },
      {
        sectionId: "filled",
        identifier: "7.1.1",
        title: "Certification rules",
        body: "Major Musts: 100% compliance with all applicable Major Must P&Cs is compulsory.",
        ancestorPath: ["7 CERTIFICATION PROCESS"],
        sourcePage: 25,
        order: 711,
      },
    ]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunkType).toBe("section");
    expect(chunks[0]?.text.startsWith("7 CERTIFICATION PROCESS · 7.1.1 Certification rules")).toBe(
      true,
    );
    expect(chunks[0]?.text).not.toContain("(part 1 of 1)");
  });
});
