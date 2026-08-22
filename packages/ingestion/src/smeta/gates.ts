/**
 * Quality gates for SMETA 7.0.
 *
 * Workplace Requirement counts are not hard-coded: the official file is
 * member-gated, so inventing a number would either block publish forever or
 * rubber-stamp a guessed corpus. ETI Base Code clause counts ARE known.
 */

import { and, count, eq, sql, type Database } from "@complifine/db";
import { requirementVersions, standardDocuments } from "@complifine/db";
import { ETI_CLAUSES } from "./eti-clauses.ts";
import { verifyStoredFile } from "../storage.ts";
import type { Gate, GateContext, GateOutcome } from "../gates.ts";

const etiClauseCount: Gate = {
  name: "eti-clause-count",
  description: "The version holds every official ETI Base Code clause",
  blocking: true,
  async run({ db, standardVersionId }) {
    const [row] = await db
      .select({ value: count() })
      .from(requirementVersions)
      .where(
        and(
          eq(requirementVersions.standardVersionId, standardVersionId),
          eq(requirementVersions.level, "eti_clause"),
        ),
      );
    const actual = row?.value ?? 0;
    const expected = ETI_CLAUSES.length;
    return {
      passed: actual === expected,
      expected: `${expected} ETI clauses (official Base Code outline)`,
      actual: `${actual} ETI clauses`,
    };
  },
};

const uniqueKeys: Gate = {
  name: "unique-stable-keys",
  description: "Every requirement has a unique non-null stable key",
  blocking: true,
  async run({ db, standardVersionId }) {
    const dupes = await db.execute<{ key: string; n: number }>(sql`
      SELECT r.stable_key AS key, count(*)::int AS n
      FROM requirement_versions rv
      JOIN requirements r ON r.id = rv.requirement_id
      WHERE rv.standard_version_id = ${standardVersionId}
      GROUP BY r.stable_key
      HAVING count(*) > 1
    `);
    return {
      passed: dupes.length === 0,
      expected: "unique stable keys",
      actual: dupes.length === 0 ? "all unique" : `${dupes.length} duplicates`,
      failures: [...dupes],
    };
  },
};

const fetchedEti: Gate = {
  name: "eti-file-integrity",
  description: "The ETI Base Code PDF is stored and hashes match",
  blocking: true,
  async run({ db, standardVersionId }) {
    const [doc] = await db
      .select()
      .from(standardDocuments)
      .where(
        and(
          eq(standardDocuments.standardVersionId, standardVersionId),
          eq(standardDocuments.documentType, "base_code"),
        ),
      );
    if (!doc?.storageKey || !doc.fileHash) {
      return {
        passed: false,
        expected: "fetched ETI Base Code PDF",
        actual: "missing",
      };
    }
    const ok = await verifyStoredFile(doc.storageKey, doc.fileHash);
    return {
      passed: ok,
      expected: doc.fileHash,
      actual: ok ? doc.fileHash : "hash mismatch or missing bytes",
    };
  },
};

const wrAdvisory: Gate = {
  name: "workplace-requirements-present",
  description: "Member-gated Workplace Requirements have been dropped and parsed",
  blocking: false,
  async run({ db, standardVersionId }) {
    const [row] = await db
      .select({ value: count() })
      .from(requirementVersions)
      .where(
        and(
          eq(requirementVersions.standardVersionId, standardVersionId),
          sql`${requirementVersions.level} IN ('nc', 'car', 'msa')`,
        ),
      );
    const actual = row?.value ?? 0;
    return {
      passed: actual > 0,
      expected: "at least one SMETA Workplace Requirement (member PDF drop)",
      actual: `${actual} WRs`,
    };
  },
};

export const SMETA_GATES: readonly Gate[] = [
  etiClauseCount,
  uniqueKeys,
  fetchedEti,
  wrAdvisory,
];

export type { Gate, GateContext, GateOutcome };
