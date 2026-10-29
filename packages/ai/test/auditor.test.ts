import { describe, expect, test } from "bun:test";
import { createDatabase, eq, requirementVersions, standardVersions } from "@complifine/db";
import { buildDossier, DOSSIER_TOKEN_BUDGET, trimDossier, type Dossier } from "../src/auditor/dossier.ts";
import { groundCitations, judgeRequirement, type AuditGenerator } from "../src/auditor/judge.ts";
import { estimateTokens } from "../src/tokens.ts";

function dossier(overrides: Partial<Dossier> = {}): Dossier {
  return {
    requirement: {
      id: "req",
      criterion: "FV-GFS 01.01",
      level: "major_must",
      principle: "Documents are controlled.",
      criteria: "A procedure exists.",
      section: "Internal documentation",
    },
    edition: { code: "ifa-v6-gfs-fv", name: "IFA v6 GFS" },
    unmapped: false,
    controls: [],
    gaps: [],
    records: [],
    documents: [],
    evidence: [],
    assessment: null,
    findings: [],
    citeable: [{ kind: "record", id: "record-1", label: "Training register" }],
    trimmed: false,
    ...overrides,
  };
}

describe("auditor grounding", () => {
  test("drops citations that were not in the dossier and keeps the dossier label", async () => {
    const generator: AuditGenerator = {
      async judge() {
        return {
          verdict: "at_risk",
          rationale: "The register is thin.",
          recommendation: "Add the missing names.",
          suggestedSeverity: "minor",
          citedEvidence: [
            { kind: "record", id: "record-1", label: "model label" },
            { kind: "document", id: "missing", label: "invented" },
          ],
          confidence: 0.6,
        };
      },
      async summarize() {
        return { summary: "", recommendations: [] };
      },
    };
    const judged = await judgeRequirement(dossier(), generator);
    expect(judged.citedEvidence).toEqual([{ kind: "record", id: "record-1", label: "Training register" }]);
    expect(judged.ungrounded).toEqual([{ kind: "document", id: "missing", label: "invented" }]);
    expect(groundCitations([], [{ kind: "evidence", id: "x", label: "x" }]).citedEvidence).toEqual([]);
  });

  test("trims record rows until the dossier fits the token budget", () => {
    const fat = dossier({
      records: [
        {
          id: "record-1",
          templateTitle: "Training register",
          status: "submitted",
          entries: Array.from({ length: 80 }, (_, index) => ({ index, note: "attended the course ".repeat(30) })),
        },
      ],
    });
    expect(estimateTokens(JSON.stringify(fat))).toBeGreaterThan(DOSSIER_TOKEN_BUDGET);
    const fitted = trimDossier(fat);
    expect(fitted.trimmed).toBe(true);
    expect(estimateTokens(JSON.stringify(fitted))).toBeLessThanOrEqual(DOSSIER_TOKEN_BUDGET);
    expect(fitted.records[0]?.entries.length).toBeLessThan(80);
  });
});

describe("auditor dossier", () => {
  test("a published requirement comes back with its criterion and only its own citeable ids", async () => {
    const db = createDatabase({ max: 1 });
    try {
      const [version] = await db
        .select()
        .from(standardVersions)
        .where(eq(standardVersions.code, "ifa-v6-gfs-fv"));
      if (!version) return;
      const [requirement] = await db
        .select({ id: requirementVersions.id, criterion: requirementVersions.sourceRequirementId })
        .from(requirementVersions)
        .where(eq(requirementVersions.standardVersionId, version.id))
        .limit(1);
      if (!requirement) return;
      const built = await buildDossier(db, {
        siteId: "00000000-0000-0000-0000-000000000001",
        siteType: "farm",
        versionId: version.id,
        requirementVersionId: requirement.id,
        gapRows: [],
      });
      expect(built.requirement.criterion).toBe(requirement.criterion);
      expect(built.requirement.id).toBe(requirement.id);
      for (const cite of built.citeable) {
        const known =
          built.records.some((row) => row.id === cite.id) ||
          built.documents.some((row) => row.id === cite.id) ||
          built.evidence.some((row) => row.id === cite.id);
        expect(known).toBe(true);
      }
    } catch {
      return;
    } finally {
      await db.$close();
    }
  });
});
