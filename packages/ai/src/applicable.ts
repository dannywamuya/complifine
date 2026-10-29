/**
 * Requirement versions that apply to a site for one edition.
 *
 * Empty scoping answers exclude nothing: the publisher's rules only drop a
 * criterion when an exempting answer is on file.
 */

import { and, eq, type Database } from "@complifine/db";
import { applicabilityQuestions, requirementVersions, siteScopingAnswers } from "@complifine/db";
import { resolveChecklist, type ChecklistAnswer } from "./agent/tools.ts";

export async function applicableIds(db: Database, siteId: string, versionId: string): Promise<string[]> {
  const saved = await db
    .select({ questionNumber: applicabilityQuestions.sourceNumber, answer: siteScopingAnswers.answer })
    .from(siteScopingAnswers)
    .innerJoin(applicabilityQuestions, eq(applicabilityQuestions.id, siteScopingAnswers.questionId))
    .where(and(eq(siteScopingAnswers.siteId, siteId), eq(applicabilityQuestions.standardVersionId, versionId)));
  const answers: ChecklistAnswer[] = saved
    .filter(
      (row): row is { questionNumber: number; answer: "yes" | "no" } =>
        row.questionNumber !== null && (row.answer === "yes" || row.answer === "no"),
    )
    .map((row) => ({ questionNumber: row.questionNumber, answer: row.answer }));
  const resolution = await resolveChecklist(db, versionId, answers);
  const excluded = new Set(resolution.exclusions.map((row) => row.criterion));
  const requirements = await db
    .select({ id: requirementVersions.id, criterion: requirementVersions.sourceRequirementId })
    .from(requirementVersions)
    .where(eq(requirementVersions.standardVersionId, versionId));
  return requirements.filter((row) => row.criterion && !excluded.has(row.criterion)).map((row) => row.id);
}
