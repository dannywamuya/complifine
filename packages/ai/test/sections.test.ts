import { describe, expect, test } from "bun:test";
import { parseAnswerSections } from "../src/agent/prompt.ts";

describe("parseAnswerSections", () => {
  test("splits the three named headings", () => {
    const parsed = parseAnswerSections(
      [
        "## At a glance",
        "Re-entry after spraying is a Major Must.",
        "",
        "## What the standard says",
        "Procedures must be in place [FV-Smart 32.10.06].",
        "",
        "## What this means",
        "Keep people out of the field until the label interval has passed.",
      ].join("\n"),
    );

    expect(parsed.summary).toContain("Major Must");
    expect(parsed.detail).toContain("FV-Smart 32.10.06");
    expect(parsed.practical).toContain("Keep people out");
  });

  test("uses the first paragraph as a summary when there are no headings", () => {
    const parsed = parseAnswerSections(
      "Workers must wait for the re-entry interval.\n\nThe criterion is a Major Must.",
    );
    expect(parsed.summary).toBe("Workers must wait for the re-entry interval.");
    expect(parsed.detail).toBe("The criterion is a Major Must.");
    expect(parsed.practical).toBe("");
  });

  test("also splits the casual heading names", () => {
    const parsed = parseAnswerSections(
      [
        "## In short",
        "Re-entry after spraying is a Major Must.",
        "",
        "## From the standard",
        "Procedures must be in place [FV-Smart 32.10.06].",
        "",
        "## On site",
        "Keep people out of the field until the label interval has passed.",
      ].join("\n"),
    );

    expect(parsed.summary).toContain("Major Must");
    expect(parsed.detail).toContain("FV-Smart 32.10.06");
    expect(parsed.practical).toContain("Keep people out");
  });

  test("tolerates a half-written stream that only has the summary heading", () => {
    const parsed = parseAnswerSections("## At a glance\nYou must");
    expect(parsed.summary).toBe("You must");
    expect(parsed.detail).toBe("");
  });
});
