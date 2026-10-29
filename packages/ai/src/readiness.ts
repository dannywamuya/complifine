/**
 * Internal readiness for one site and one edition.
 *
 * A count, not a certificate. Unmapped requirements are left out of the
 * evidence term and listed on their own. Draft records never count, because
 * the gap list ignores them.
 */

import { and, desc, eq, inArray, type Database } from "@complifine/db";
import { assessmentItems, assessments, correctiveActions, findings } from "@complifine/db";
import { evidenceGap } from "./evidence-gap.ts";

const MUSTS = new Set(["major_must", "minor_must"]);

export interface ReadinessReport {
  readonly percent: number;
  readonly applicableMusts: number;
  readonly assessed: number;
  readonly evidenceGaps: number;
  readonly openFindings: number;
  readonly overdueActions: number;
  readonly unmapped: number;
  readonly note: string;
}

export async function auditReadiness(
  db: Database,
  input: { readonly organizationId: string; readonly siteId: string; readonly siteType: string; readonly versionId: string },
): Promise<ReadinessReport> {
  const gap = await evidenceGap(db, input);
  const byRequirement = new Map<string, { level?: string; statuses: string[] }>();
  for (const row of gap.rows) {
    if (!row.requirementVersionId) continue;
    const current = byRequirement.get(row.requirementVersionId) ?? { level: row.level, statuses: [] };
    current.statuses.push(row.status);
    if (row.level) current.level = row.level;
    byRequirement.set(row.requirementVersionId, current);
  }

  const musts = [...byRequirement.entries()].filter(([, row]) => row.level && MUSTS.has(row.level));
  const [assessment] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.siteId, input.siteId), eq(assessments.standardVersionId, input.versionId)))
    .orderBy(desc(assessments.createdAt))
    .limit(1);
  const items = assessment
    ? await db.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, assessment.id))
    : [];
  const itemByRequirement = new Map(items.map((item) => [item.requirementVersionId, item]));

  const open = await db
    .select({ requirementVersionId: findings.requirementVersionId })
    .from(findings)
    .where(
      and(
        eq(findings.organizationId, input.organizationId),
        eq(findings.siteId, input.siteId),
        inArray(findings.status, ["open", "in_progress"]),
      ),
    );
  const openRequirements = new Set(open.map((row) => row.requirementVersionId).filter(Boolean));

  const actions = await db
    .select({ dueDate: correctiveActions.dueDate, status: correctiveActions.status })
    .from(correctiveActions)
    .innerJoin(findings, eq(findings.id, correctiveActions.findingId))
    .where(eq(findings.siteId, input.siteId));
  const overdueActions = actions.filter(
    (row) => row.status === "open" && row.dueDate && row.dueDate.getTime() < Date.now(),
  ).length;

  let assessed = 0;
  let ready = 0;
  let evidenceGaps = 0;
  for (const [requirementId, row] of musts) {
    const mapped = row.statuses.filter((status) => status !== "unmapped");
    const evidenceOk = mapped.length === 0 || mapped.every((status) => status === "present");
    if (!evidenceOk) evidenceGaps += 1;
    const item = itemByRequirement.get(requirementId);
    const answered = item && item.response !== "not_assessed";
    if (answered) assessed += 1;
    const passed = item?.response === "compliant" || item?.response === "not_applicable";
    if (answered && passed && evidenceOk && !openRequirements.has(requirementId)) ready += 1;
  }

  const applicableMusts = musts.length;
  return {
    percent: applicableMusts === 0 ? 0 : Math.round((ready / applicableMusts) * 100),
    applicableMusts,
    assessed,
    evidenceGaps,
    openFindings: open.length,
    overdueActions,
    unmapped: gap.counts.unmapped,
    note: "Internal readiness only. A certification body decides whether the site is certified. Draft records are not counted.",
  };
}
