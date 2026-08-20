/**
 * Independent verification that imported requirement text matches the
 * authoritative PDF.
 *
 * Kept separate from the page mapper on purpose. The mapper produces the page
 * numbers; this recomputes agreement from scratch against the database and the
 * preserved PDF, so the quality gate is a genuine second look rather than a
 * replay of the first one's conclusions. If the mapper had a bug, a gate that
 * trusted its output would certify the bug.
 */

import { and, eq, isNotNull, type Database } from "@complifine/db";
import { requirementVersions, standardDocuments, standardVersions } from "@complifine/db";
import { ngramCoverage } from "@complifine/core";
import { extractPdf } from "../pdf/extract.ts";
import { readStoredFile } from "../storage.ts";

export interface TextAgreementRow {
  readonly sourceRequirementId: string;
  readonly page: number;
  readonly coverage: number;
}

export interface TextAgreementReport {
  readonly meanCoverage: number;
  readonly minCoverage: number;
  readonly perRequirement: readonly TextAgreementRow[];
}

/**
 * Cache keyed by the PDF's content hash. The gate runner and the CLI both ask
 * for this, and re-extracting a 240-page PDF twice in one process is pure
 * waste. Keying on the hash rather than the path means a changed file is never
 * served from a stale entry.
 */
const pdfCache = new Map<string, Awaited<ReturnType<typeof extractPdf>>>();

export async function computeTextAgreement(
  db: Database,
  standardVersionId: string,
): Promise<TextAgreementReport> {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.id, standardVersionId));

  if (!version) throw new Error(`Unknown standard version: ${standardVersionId}`);

  const [pcDocument] = await db
    .select()
    .from(standardDocuments)
    .where(
      and(
        eq(standardDocuments.standardVersionId, standardVersionId),
        eq(standardDocuments.documentType, "principles_and_criteria"),
        isNotNull(standardDocuments.storageKey),
      ),
    );

  if (!pcDocument?.storageKey || !pcDocument.fileHash) {
    throw new Error(
      `No fetched Principles & Criteria PDF for ${version.code}. Run \`bun run kb fetch\` first.`,
    );
  }

  let pdf = pdfCache.get(pcDocument.fileHash);
  if (!pdf) {
    pdf = await extractPdf(await readStoredFile(pcDocument.storageKey));
    pdfCache.set(pcDocument.fileHash, pdf);
  }

  const rows = await db
    .select({
      sourceRequirementId: requirementVersions.sourceRequirementId,
      principleText: requirementVersions.principleText,
      criteriaText: requirementVersions.criteriaText,
      sourcePage: requirementVersions.sourcePage,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, standardVersionId))
    .orderBy(requirementVersions.sortKey);

  const perRequirement: TextAgreementRow[] = [];
  let sum = 0;
  let min = 1;

  for (const row of rows) {
    const page = row.sourcePage;
    if (page === null) {
      // Unmapped requirements are the page-provenance gate's business. Scoring
      // them zero here would fail two gates for one defect and obscure which.
      continue;
    }

    const current = pdf.pages[page - 1];
    const next = pdf.pages[page];
    const haystack = next ? `${current?.flatText ?? ""} ${next.flatText}` : (current?.flatText ?? "");

    const needle = row.criteriaText
      ? `${row.principleText} ${row.criteriaText}`
      : row.principleText;

    const coverage = ngramCoverage(needle, haystack);
    sum += coverage;
    min = Math.min(min, coverage);

    perRequirement.push({
      sourceRequirementId: row.sourceRequirementId,
      page,
      coverage: Number(coverage.toFixed(4)),
    });
  }

  return {
    meanCoverage: perRequirement.length > 0 ? sum / perRequirement.length : 0,
    minCoverage: perRequirement.length > 0 ? min : 0,
    perRequirement: perRequirement.sort((a, b) => a.coverage - b.coverage),
  };
}
