import { describe, expect, test } from "bun:test";
import {
  AUTHORITY_LEVELS,
  canTransition,
  DOCUMENT_TYPE_AUTHORITY,
  DOCUMENT_TYPES,
  EDITION_ID_PREFIX,
  isNormative,
  parseRequirementLevel,
  REQUIREMENT_LEVEL_LABELS,
  REQUIREMENT_LEVELS,
  VERSION_STATUSES,
  VERSION_TRANSITIONS,
} from "../src/enums.ts";

describe("parseRequirementLevel", () => {
  test("parses the spellings used in the P&C PDF", () => {
    expect(parseRequirementLevel("Major Must")).toBe("major_must");
    expect(parseRequirementLevel("Minor Must")).toBe("minor_must");
    expect(parseRequirementLevel("Recommendation")).toBe("recommendation");
  });

  // The checklist workbook's `Level` lookup table abbreviates this one. Failing
  // to handle it would leave the 20 Recommendation-level Smart criteria
  // unclassified and break the 103/67/20 level-count gate.
  test("parses the abbreviation used in the checklist Level table", () => {
    expect(parseRequirementLevel("Recom.")).toBe("recommendation");
    expect(parseRequirementLevel("Recom")).toBe("recommendation");
  });

  test("ignores casing and surrounding whitespace", () => {
    expect(parseRequirementLevel("  major must ")).toBe("major_must");
    expect(parseRequirementLevel("MAJOR MUST")).toBe("major_must");
    expect(parseRequirementLevel("MinorMust")).toBe("minor_must");
  });

  // Returning null rather than defaulting is the point: silently downgrading an
  // unrecognised level to Recommendation would hide an audit blocker.
  test("returns null for placeholders and unknown labels", () => {
    for (const value of ["-", "X", "Merged", "", null, undefined]) {
      expect(parseRequirementLevel(value)).toBeNull();
    }
  });

  test("every canonical level round-trips through its display label", () => {
    for (const level of REQUIREMENT_LEVELS) {
      expect(parseRequirementLevel(REQUIREMENT_LEVEL_LABELS[level])).toBe(level);
    }
  });
});

describe("authority levels", () => {
  test("rank official sources above interpretation", () => {
    expect(AUTHORITY_LEVELS.OFFICIAL_STANDARD).toBeLessThan(AUTHORITY_LEVELS.OFFICIAL_CHECKLIST);
    expect(AUTHORITY_LEVELS.OFFICIAL_CHECKLIST).toBeLessThan(AUTHORITY_LEVELS.CB_GUIDANCE);
    expect(AUTHORITY_LEVELS.COMPANY_PRACTICE).toBeLessThan(AUTHORITY_LEVELS.AI_INTERPRETATION);
  });

  // The IFA guideline states on its own cover page that it "is a recommendation
  // for consideration", so it must never be cited as the basis of a requirement.
  test("treat P&Cs, regulations and checklists as normative, guidance and weaker as not", () => {
    expect(isNormative(AUTHORITY_LEVELS.OFFICIAL_STANDARD)).toBe(true);
    expect(isNormative(AUTHORITY_LEVELS.OFFICIAL_REGULATIONS)).toBe(true);
    expect(isNormative(AUTHORITY_LEVELS.OFFICIAL_CHECKLIST)).toBe(true);
    expect(isNormative(AUTHORITY_LEVELS.OFFICIAL_GUIDANCE)).toBe(false);
    expect(isNormative(AUTHORITY_LEVELS.OFFICIAL_UPDATE)).toBe(false);
    expect(isNormative(AUTHORITY_LEVELS.CB_GUIDANCE)).toBe(false);
    expect(isNormative(AUTHORITY_LEVELS.AI_INTERPRETATION)).toBe(false);
  });

  test("every document type declares a default authority level", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_AUTHORITY[type]).toBeGreaterThanOrEqual(1);
      expect(DOCUMENT_TYPE_AUTHORITY[type]).toBeLessThanOrEqual(8);
    }
  });

  test("the P&Cs outrank the checklist that restates them", () => {
    expect(DOCUMENT_TYPE_AUTHORITY.principles_and_criteria).toBeLessThan(
      DOCUMENT_TYPE_AUTHORITY.checklist,
    );
  });

  // The AGRINFO/COLEAD PDF in the research folder is exactly this: a summary
  // that reads like the standard but is not it.
  test("a third-party summary is never normative", () => {
    expect(isNormative(DOCUMENT_TYPE_AUTHORITY.third_party_summary)).toBe(false);
  });
});

describe("version publication state machine", () => {
  test("walks the full happy path", () => {
    const path = [
      "draft",
      "ingesting",
      "extracted",
      "validation",
      "review",
      "approved",
      "published",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  test("forbids reaching published without passing through review and approval", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("extracted", "published")).toBe(false);
    expect(canTransition("validation", "approved")).toBe(false);
    expect(canTransition("review", "published")).toBe(false);
  });

  test("allows stepping back one stage to re-run a failed step", () => {
    expect(canTransition("extracted", "ingesting")).toBe(true);
    expect(canTransition("validation", "extracted")).toBe(true);
    expect(canTransition("review", "validation")).toBe(true);
    expect(canTransition("approved", "review")).toBe(true);
  });

  test("treats retired as terminal", () => {
    expect(VERSION_TRANSITIONS.retired).toEqual([]);
    for (const status of VERSION_STATUSES) {
      expect(canTransition("retired", status)).toBe(false);
    }
  });

  test("only a published version can be retired", () => {
    for (const status of VERSION_STATUSES) {
      if (status === "published") continue;
      expect(canTransition(status, "retired")).toBe(false);
    }
    expect(canTransition("published", "retired")).toBe(true);
  });

  test("no status transitions to itself", () => {
    for (const status of VERSION_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  test("every status is reachable from draft", () => {
    const reached = new Set(["draft"]);
    const queue = ["draft"];
    while (queue.length > 0) {
      for (const next of VERSION_TRANSITIONS[queue.shift() as keyof typeof VERSION_TRANSITIONS]) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    expect(reached.size).toBe(VERSION_STATUSES.length);
  });
});

describe("editions", () => {
  // PRD section 8: the two editions are parallel and must not be conflated.
  test("each edition has its own criterion prefix", () => {
    expect(EDITION_ID_PREFIX.smart).toBe("FV-Smart");
    expect(EDITION_ID_PREFIX.gfs).toBe("FV-GFS");
    expect(EDITION_ID_PREFIX.smart).not.toBe(EDITION_ID_PREFIX.gfs);
  });
});
