import { describe, expect, test } from "bun:test";
import { farmContextNote, rewriteAskQuestion } from "../src/ask-context.ts";

describe("rewriteAskQuestion", () => {
  test("leaves a bare question alone", () => {
    expect(rewriteAskQuestion({ question: "When can we re-enter?" })).toBe("When can we re-enter?");
  });

  test("appends a version instruction", () => {
    expect(
      rewriteAskQuestion({ question: "Is water testing a Major Must?", version: "ifa-v6-smart-fv" }),
    ).toBe(
      "Is water testing a Major Must?\n\nUse the ifa-v6-smart-fv version unless I named another.",
    );
  });

  test("appends farm context after the version note", () => {
    expect(
      rewriteAskQuestion({
        question: "What applies at harvest?",
        version: "ifa-v6-gfs-fv",
        contextNote: "This question is about company Acme, site Naivasha packhouse.",
      }),
    ).toContain("site Naivasha packhouse");
  });
});

describe("farmContextNote", () => {
  test("returns undefined when nothing is selected", () => {
    expect(farmContextNote({})).toBeUndefined();
  });

  test("names company and site for the agent", () => {
    expect(
      farmContextNote({ organizationName: "Acme Fresh", siteLabel: "Naivasha packhouse" }),
    ).toBe(
      "This question is about company Acme Fresh, site Naivasha packhouse. Use farm tools for that company and site.",
    );
  });

  test("names published editions in the company's scope", () => {
    expect(
      farmContextNote({
        organizationName: "Acme Fresh",
        editionLabels: ["IFA v6 Smart", "IFA v6 GFS"],
      }),
    ).toContain("Cite only these published editions in the company's scope: IFA v6 Smart; IFA v6 GFS.");
  });
});
