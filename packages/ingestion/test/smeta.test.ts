import { describe, expect, test } from "bun:test";
import { parseEtiBaseCode } from "../src/smeta/eti-parser.ts";
import { ETI_CLAUSES, etiStableKey } from "../src/smeta/eti-clauses.ts";
import { parseWorkplaceRequirements } from "../src/smeta/workplace-requirements.ts";
import { adapterFor, smetaAdapter, globalGapAdapter } from "../src/adapters/index.ts";

const FIXTURE_PAGES = ETI_CLAUSES.map((clause, index) => ({
  number: index + 1,
  text: `${clause.number} ${clause.title}\nWorkers must follow this clause as published.`,
}));

describe("ETI Base Code parser", () => {
  test("matches every official clause from the outline", () => {
    const parsed = parseEtiBaseCode(FIXTURE_PAGES);
    expect(parsed.unmatchedHeadings).toEqual([]);
    expect(parsed.clauses).toHaveLength(ETI_CLAUSES.length);
    expect(parsed.clauses[0]!.number).toBe("1");
    expect(parsed.clauses[0]!.body).toContain("workers must follow");
  });

  test("stable keys follow eti:{number}", () => {
    expect(etiStableKey("3.3")).toBe("eti:3.3");
  });
});

describe("Workplace Requirements parser", () => {
  test("extracts numbered NC items and flags 4-pillar environment rows", () => {
    const parsed = parseWorkplaceRequirements([
      {
        number: 1,
        text: [
          "0.1 Management systems",
          "The site shall have a documented system.",
          "3.1 A safe and hygienic working environment",
          "Workers shall not be exposed to hazards.",
          "10.1 Environmental permits and greenhouse gas",
          "The site holds the required environmental permits.",
          "1.A.1 Collaborative Action Required on wages",
        ].join("\n"),
      },
    ]);
    expect(parsed.map((row) => row.number)).toContain("0.1");
    expect(parsed.map((row) => row.number)).toContain("3.1");
    const env = parsed.find((row) => row.number === "10.1");
    expect(env?.pillar).toBe("4-pillar");
    const car = parsed.find((row) => row.number === "1.A.1");
    expect(car?.level).toBe("car");
  });
});

describe("adapter registry", () => {
  test("resolves GLOBALG.A.P. and SMETA, and refuses an unknown code", () => {
    expect(adapterFor("globalgap-ifa")).toBe(globalGapAdapter);
    expect(adapterFor("smeta")).toBe(smetaAdapter);
    expect(() => adapterFor("brcgs")).toThrow(/No ingestion adapter/);
  });
});
