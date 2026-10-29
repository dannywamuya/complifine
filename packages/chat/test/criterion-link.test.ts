import { describe, expect, test } from "bun:test";
import { criterionLinkId, isInventedCriterionHref, prettifyAnswerLinks } from "../src/criterion-link.ts";

describe("criterionLinkId", () => {
  test("canonicalises a GLOBALG.A.P. number", () => {
    expect(criterionLinkId("FV GFS 1.4")).toBe("FV-GFS 01.04");
    expect(criterionLinkId("[FV-Smart 03.02]")).toBe("FV-Smart 03.02");
  });

  test("rejects section titles and tool labels", () => {
    expect(criterionLinkId("Internal readiness")).toBeNull();
    expect(criterionLinkId("Applicability")).toBeNull();
  });
});

describe("prettifyAnswerLinks", () => {
  test("turns a review path into a Review link and expands the following numbers", () => {
    const text = [
      "- Corrective action record — supports FV-GFS 01.03 and 01.04",
      "  Review: /app/records/b2899454-7fc1-46f6-9d6c-239b96a4f028/c8e771b7-7851-4cdf-aad1-1bc3108c5096",
      "- Pesticide and fertiliser stock inventory — supports FV-GFS 05.02, 29.02.01 and 32.11.01",
      "  Review: /app/records/9f749503-f24e-4c17-a0a5-57480ccf9005/5b6c2bdf-1482-495d-9292-94a0c58dd288",
    ].join("\n");
    expect(prettifyAnswerLinks(text)).toBe(
      [
        "- Corrective action record — supports FV-GFS 01.03 and FV-GFS 01.04",
        "  [Review](/app/records/b2899454-7fc1-46f6-9d6c-239b96a4f028/c8e771b7-7851-4cdf-aad1-1bc3108c5096)",
        "- Pesticide and fertiliser stock inventory — supports FV-GFS 05.02, FV-GFS 29.02.01 and FV-GFS 32.11.01",
        "  [Review](/app/records/9f749503-f24e-4c17-a0a5-57480ccf9005/5b6c2bdf-1482-495d-9292-94a0c58dd288)",
      ].join("\n"),
    );
  });

  test("leaves an existing markdown link and code spans alone", () => {
    const linked = "[Review](/app/records/b2899454-7fc1-46f6-9d6c-239b96a4f028/c8e771b7-7851-4cdf-aad1-1bc3108c5096)";
    expect(prettifyAnswerLinks(linked)).toBe(linked);
    expect(prettifyAnswerLinks("`/app/records/b2899454-7fc1-46f6-9d6c-239b96a4f028/c8e771b7-7851-4cdf-aad1-1bc3108c5096`")).toContain("`/app/records/");
  });
});

describe("isInventedCriterionHref", () => {
  test("flags criteria paths that are not criterion numbers", () => {
    expect(isInventedCriterionHref("/app/criteria/Internal%20readiness")).toBe(true);
    expect(isInventedCriterionHref("http://localhost:3000/app/criteria/Applicability")).toBe(true);
    expect(isInventedCriterionHref("/app/criteria/FV-GFS%2001.04")).toBe(false);
    expect(isInventedCriterionHref("/app/company")).toBe(false);
  });
});
