import { describe, expect, test } from "bun:test";
import { extractCitations } from "../src/agent/prompt.ts";

describe("extractCitations", () => {
  test("canonicalises criterion citations regardless of spacing and case", () => {
    const citations = extractCitations(
      "Re-entry procedures are a Major Must [fv smart 32.10.06].",
    );
    expect(citations).toEqual([
      { raw: "fv smart 32.10.06", criterionId: "FV-Smart 32.10.06", kind: "criterion" },
    ]);
  });

  test("accepts a document citation by title and page", () => {
    const citations = extractCitations(
      "Certificate validity may be extended by four months [General Regulations Part I, 7.3].",
    );
    expect(citations).toHaveLength(1);
    expect(citations[0]?.kind).toBe("document");
    expect(citations[0]?.criterionId).toBeNull();
  });

  test("ignores ordinary brackets that are not citations", () => {
    expect(extractCitations("The producer (or group) must keep records [see above].")).toEqual([]);
  });

  test("deduplicates the same citation written twice", () => {
    const citations = extractCitations(
      "Keep records [FV-Smart 01.02]. They must be current [FV-Smart 01.02].",
    );
    expect(citations).toHaveLength(1);
  });

  test("pads a dropped leading zero so FV-Smart 3.1 cites 03.01", () => {
    const citations = extractCitations("Competence is required [FV-Smart 3.2].");
    expect(citations[0]?.criterionId).toBe("FV-Smart 03.02");
  });
});
