import { describe, expect, test } from "bun:test";
import type { FormDefinition } from "@complifine/core";
import { interpretExtraction } from "../src/capture/extract.ts";
import { rankTemplates } from "../src/capture/classify.ts";

const register: FormDefinition = {
  layout: "table",
  headerFields: [
    { key: "course", label: "Course", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
  ],
  entryFields: [
    { key: "trainee", label: "Trainee", type: "person", required: true },
    { key: "signed", label: "Signed", type: "boolean" },
  ],
};

const grid: FormDefinition = {
  layout: "grid",
  headerFields: [],
  entryFields: [
    { key: "date", label: "Date", type: "date", required: true },
    { key: "result", label: "Result", type: "select", options: ["OK", "Not OK"], required: true },
  ],
  fixedItems: [
    { key: "sinks", label: "Sinks" },
    { key: "floor", label: "Floor" },
  ],
};

const plan: FormDefinition = {
  layout: "plan",
  headerFields: [],
  entryFields: [
    { key: "risk", label: "Risk", type: "select", options: ["Low", "Medium", "High"], required: true },
    { key: "action", label: "Action", type: "text" },
  ],
  fixedItems: [{ key: "flooding", label: "Flooding" }],
};

function field(key: string, value: string | number | boolean | null, confidence = 0.9, source = "page") {
  return { key, value, confidence, source };
}

describe("capture extraction", () => {
  test("a register keeps confidence and blanks a bad date", () => {
    const draft = interpretExtraction(register, {
      header: [field("course", "Hygiene", 0.8, "Hygiene training"), field("date", "yesterday", 0.4, "yesterday")],
      entries: [{ item: null, fields: [field("trainee", "Amina", 0.95, "Amina"), field("signed", true, 0.7, "signed")] }],
    });
    expect(draft.header.course).toBe("Hygiene");
    expect(draft.header.date).toBeNull();
    expect(draft.headerExtraction.date?.confidence).toBe(0);
    expect(draft.headerExtraction.date?.source).toBe("yesterday");
    expect(draft.headerExtraction.course?.confidence).toBe(0.8);
    expect(draft.entries[0]?.data.trainee).toBe("Amina");
    expect(draft.entries[0]?.extraction.trainee?.confidence).toBe(0.95);
  });

  test("a grid matches a fixed row and rejects an unknown result", () => {
    const draft = interpretExtraction(grid, {
      header: [],
      entries: [
        {
          item: "Sinks and taps",
          fields: [field("date", "2026-10-01"), field("result", "perfect")],
        },
      ],
    });
    expect(draft.entries[0]?.data.item).toBe("sinks");
    expect(draft.entries[0]?.data.result).toBeNull();
    expect(draft.entries[0]?.extraction.result?.confidence).toBe(0);
    expect(draft.entries[0]?.data.date).toBe("2026-10-01");
  });

  test("a plan keeps a listed risk and the source of a guessed one", () => {
    const draft = interpretExtraction(plan, {
      header: [],
      entries: [
        {
          item: "flooding",
          fields: [field("risk", "high", 0.6, "high"), field("action", "Drain the block", 0.8)],
        },
      ],
    });
    expect(draft.entries[0]?.data.item).toBe("flooding");
    expect(draft.entries[0]?.data.risk).toBe("High");
    expect(draft.entries[0]?.data.action).toBe("Drain the block");
    expect(draft.entries[0]?.extraction.risk?.confidence).toBe(0.6);
  });

  test("classification ranks the template whose columns appear in the text", () => {
    const ranked = rankTemplates("Amina signed the hygiene training register", [
      { id: "1", slug: "spray", title: "Spray record", labels: ["Product", "Rate"] },
      { id: "2", slug: "training", title: "Training record", labels: ["Trainee", "Signed"] },
    ]);
    expect(ranked[0]?.slug).toBe("training");
  });
});
