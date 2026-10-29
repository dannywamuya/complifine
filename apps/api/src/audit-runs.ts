/**
 * On-demand AI audit, and the combined readiness view.
 *
 * Starting a run judges records and evidence. Accepting a verdict is the only
 * way that judgement becomes a self-assessment answer. Opening a finding is a
 * second confirmation. Viewers can read both and change neither.
 */

import { Elysia, status, t } from "elysia";
import { and, desc, eq, inArray, type Database } from "@complifine/db";
import {
  assessmentItems,
  assessments,
  auditRunItems,
  auditRuns,
  findings,
  formRecords,
  requirementVersions,
  sites,
  standardSections,
  standardVersions,
} from "@complifine/db";
import {
  applicableIds,
  auditReadiness,
  evidenceGap,
  responseForVerdict,
  runAudit,
  type AuditGenerator,
} from "@complifine/ai";
import { type AssessmentResponse, type EvidenceGapStatus, auditConcurrency } from "@complifine/core";
import { readAuth, requireOrg, type AuthUser } from "./auth/plugin.ts";
import { assertPublishedVersion, publishedOnly } from "./knowledge-access.ts";
import { resolveEmailAddress, sendNotificationEmail } from "./email/resend.ts";
import { readOrgFile } from "./org-storage.ts";

const VERDICT = t.Union([
  t.Literal("likely_compliant"),
  t.Literal("at_risk"),
  t.Literal("likely_non_compliant"),
  t.Literal("not_applicable"),
  t.Literal("insufficient_evidence"),
]);
const RESPONSE = t.Union([
  t.Literal("compliant"),
  t.Literal("partial"),
  t.Literal("non_compliant"),
  t.Literal("not_applicable"),
  t.Literal("not_assessed"),
]);

const GAP_RANK: Record<EvidenceGapStatus, number> = {
  missing: 0,
  expired: 1,
  stale: 2,
  unmapped: 3,
  present: 4,
};

export interface AuditRouteOptions {
  readonly generator?: AuditGenerator;
  readonly awaitAudit?: boolean;
  readonly concurrency?: number;
}

export function auditRunRoutes(db: Database, options: AuditRouteOptions = {}) {
  return new Elysia({ name: "complifine-audit-runs" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .post(
      "/sites/:id/audit-runs",
      async ({ auth, params, body, set }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot run an audit" });
        const site = await ownedSite(db, user.orgId, params.id);
        const version = await publishedVersion(db, user, body.versionCode);
        const [active] = await db
          .select({ id: auditRuns.id })
          .from(auditRuns)
          .where(
            and(
              eq(auditRuns.siteId, site.id),
              eq(auditRuns.standardVersionId, version.id),
              inArray(auditRuns.status, ["queued", "running"]),
            ),
          );
        if (active) throw status(409, { error: "An audit is already running for this site and edition" });
        const [created] = await db
          .insert(auditRuns)
          .values({
            organizationId: user.orgId,
            siteId: site.id,
            standardVersionId: version.id,
            requestedBy: user.id,
            status: "running",
            model: process.env.AGENT_MODEL || "gpt-5",
            startedAt: new Date(),
          })
          .returning();
        const task = runAudit(db, created!.id, {
          generator: options.generator,
          concurrency: options.concurrency ?? auditConcurrency(),
          readFile: readOrgFile,
          onEmailNotice: async (notice) => {
            const to = await resolveEmailAddress(db, notice.userId);
            if (!to) return;
            await sendNotificationEmail({
              to,
              subject: notice.title,
              text: notice.body,
              href: notice.href,
            });
          },
        });
        if (options.awaitAudit) await task;
        else void task;
        const [fresh] = await db.select().from(auditRuns).where(eq(auditRuns.id, created!.id));
        set.status = 202;
        return fresh;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ versionCode: t.String() }),
      },
    )
    .get(
      "/sites/:id/audit-runs",
      async ({ auth, params, query }) => {
        const user = requireOrg(auth);
        const site = await ownedSite(db, user.orgId, params.id);
        const version = query.versionCode ? await publishedVersion(db, user, query.versionCode) : null;
        const rows = await db
          .select()
          .from(auditRuns)
          .where(
            and(
              eq(auditRuns.siteId, site.id),
              eq(auditRuns.organizationId, user.orgId),
              version ? eq(auditRuns.standardVersionId, version.id) : undefined,
            ),
          )
          .orderBy(desc(auditRuns.createdAt))
          .limit(10);
        return { runs: rows };
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ versionCode: t.Optional(t.String()) }),
      },
    )
    .get("/audit-runs/:id", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const run = await ownedRun(db, user.orgId, params.id);
      const items = await itemsWithRequirement(db, run.id);
      return { run, items };
    })
    .post(
      "/audit-runs/:id/items/:itemId/accept",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const run = await ownedRun(db, user.orgId, params.id);
        const item = await ownedItem(db, run.id, params.itemId);
        const response = body.response ?? responseForVerdict(item.verdict);
        if (!response) throw status(422, { error: "Choose a response. This verdict does not imply one." });
        await writeResponse(db, user, run, item.requirementVersionId, response);
        const [updated] = await db
          .update(auditRunItems)
          .set({ acceptedAt: new Date(), acceptedBy: user.id, updatedAt: new Date() })
          .where(eq(auditRunItems.id, item.id))
          .returning();
        return updated;
      },
      {
        params: t.Object({ id: t.String(), itemId: t.String() }),
        body: t.Object({ response: t.Optional(RESPONSE) }),
      },
    )
    .post(
      "/audit-runs/:id/accept",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        assertWriter(user);
        const run = await ownedRun(db, user.orgId, params.id);
        const wanted = new Set(body.verdicts);
        const items = await db.select().from(auditRunItems).where(eq(auditRunItems.auditRunId, run.id));
        let accepted = 0;
        for (const item of items) {
          if (!wanted.has(item.verdict) || item.acceptedAt) continue;
          const response = responseForVerdict(item.verdict);
          if (!response) continue;
          await writeResponse(db, user, run, item.requirementVersionId, response);
          await db
            .update(auditRunItems)
            .set({ acceptedAt: new Date(), acceptedBy: user.id, updatedAt: new Date() })
            .where(eq(auditRunItems.id, item.id));
          accepted += 1;
        }
        return { accepted };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ verdicts: t.Array(VERDICT) }),
      },
    )
    .post("/audit-runs/:id/items/:itemId/finding", async ({ auth, params }) => {
      const user = requireOrg(auth);
      assertWriter(user);
      const run = await ownedRun(db, user.orgId, params.id);
      const item = await ownedItem(db, run.id, params.itemId);
      if (item.findingId) {
        const [existing] = await db.select().from(findings).where(eq(findings.id, item.findingId));
        if (existing) return existing;
      }
      const [created] = await db
        .insert(findings)
        .values({
          organizationId: user.orgId,
          siteId: run.siteId,
          requirementVersionId: item.requirementVersionId,
          description: item.rationale.trim() || item.recommendation.trim() || "Raised from the audit simulation",
          severity: item.suggestedSeverity ?? (item.verdict === "likely_non_compliant" ? "major" : "minor"),
          status: "open",
          responsibleId: user.id,
        })
        .returning();
      await db
        .update(auditRunItems)
        .set({ findingId: created!.id, updatedAt: new Date() })
        .where(eq(auditRunItems.id, item.id));
      return created;
    })
    .get(
      "/sites/:id/compliance",
      async ({ auth, params, query }) => {
        const user = requireOrg(auth);
        const site = await ownedSite(db, user.orgId, params.id);
        const version = await publishedVersion(db, user, query.versionCode);
        const readiness = await auditReadiness(db, {
          organizationId: user.orgId,
          siteId: site.id,
          siteType: site.siteType,
          versionId: version.id,
        });
        const gap = await evidenceGap(db, { siteId: site.id, siteType: site.siteType, versionId: version.id });
        const [assessment] = await db
          .select()
          .from(assessments)
          .where(and(eq(assessments.siteId, site.id), eq(assessments.standardVersionId, version.id)))
          .orderBy(desc(assessments.createdAt))
          .limit(1);
        const answers = assessment
          ? await db.select().from(assessmentItems).where(eq(assessmentItems.assessmentId, assessment.id))
          : [];
        const answerByRequirement = new Map(answers.map((row) => [row.requirementVersionId, row]));
        const [run] = await db
          .select()
          .from(auditRuns)
          .where(and(eq(auditRuns.siteId, site.id), eq(auditRuns.standardVersionId, version.id)))
          .orderBy(desc(auditRuns.createdAt))
          .limit(1);
        const judged = run ? await itemsWithRequirement(db, run.id) : [];
        const judgedByRequirement = new Map(judged.map((row) => [row.requirementVersionId, row]));
        const ids = await applicableIds(db, site.id, version.id);
        const requirements =
          ids.length === 0
            ? []
            : await db
                .select({
                  id: requirementVersions.id,
                  criterion: requirementVersions.sourceRequirementId,
                  level: requirementVersions.level,
                  principle: requirementVersions.principleText,
                  section: standardSections.title,
                  sortKey: requirementVersions.sortKey,
                })
                .from(requirementVersions)
                .leftJoin(standardSections, eq(standardSections.id, requirementVersions.sectionId))
                .where(inArray(requirementVersions.id, ids));
        requirements.sort((a, b) => a.sortKey - b.sortKey || a.criterion.localeCompare(b.criterion));
        const open = await db
          .select({ id: findings.id, requirementVersionId: findings.requirementVersionId })
          .from(findings)
          .where(
            and(
              eq(findings.siteId, site.id),
              inArray(findings.status, ["open", "in_progress"]),
            ),
          );
        const recordIds = [
          ...new Set(
            judged.flatMap((row) =>
              (row.citedEvidence ?? []).filter((cite) => cite.kind === "record").map((cite) => cite.id),
            ),
          ),
        ];
        const recordTemplates =
          recordIds.length === 0
            ? []
            : await db
                .select({ id: formRecords.id, templateId: formRecords.templateId })
                .from(formRecords)
                .where(inArray(formRecords.id, recordIds));
        const templateByRecord = new Map(recordTemplates.map((row) => [row.id, row.templateId]));
        const openByRequirement = new Map<string, string[]>();
        for (const row of open) {
          if (!row.requirementVersionId) continue;
          const list = openByRequirement.get(row.requirementVersionId) ?? [];
          list.push(row.id);
          openByRequirement.set(row.requirementVersionId, list);
        }
        const gapByRequirement = new Map<string, EvidenceGapStatus[]>();
        for (const row of gap.rows) {
          if (!row.requirementVersionId) continue;
          const list = gapByRequirement.get(row.requirementVersionId) ?? [];
          list.push(row.status);
          gapByRequirement.set(row.requirementVersionId, list);
        }
        return {
          readiness,
          assessment: assessment ? { id: assessment.id, status: assessment.status } : null,
          run: run ? { ...run, items: judged } : null,
          requirements: requirements.map((row) => {
            const judgement = judgedByRequirement.get(row.id);
            const openIds = openByRequirement.get(row.id) ?? [];
            return {
              id: row.id,
              criterion: row.criterion,
              level: row.level,
              principle: row.principle,
              section: row.section,
              response: answerByRequirement.get(row.id)?.response ?? "not_assessed",
              evidenceStatus: worstGap(gapByRequirement.get(row.id) ?? []),
              verdict: judgement?.verdict ?? null,
              auditItemId: judgement?.id ?? null,
              rationale: judgement?.rationale ?? null,
              recommendation: judgement?.recommendation ?? null,
              citedEvidence: (judgement?.citedEvidence ?? []).map((cite) => ({
                ...cite,
                href:
                  cite.kind === "document"
                    ? `/api/documents/${cite.id}/file`
                    : cite.kind === "record" && templateByRecord.get(cite.id)
                      ? `/app/records/${templateByRecord.get(cite.id)}/${cite.id}`
                      : null,
              })),
              acceptedAt: judgement?.acceptedAt ?? null,
              openFindings: openIds.length,
              openFindingId: openIds[0] ?? null,
            };
          }),
        };
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ versionCode: t.String() }),
      },
    );
}

function worstGap(statuses: EvidenceGapStatus[]): EvidenceGapStatus {
  if (statuses.length === 0) return "present";
  return [...statuses].sort((a, b) => GAP_RANK[a] - GAP_RANK[b])[0]!;
}

function assertWriter(user: AuthUser & { orgId: string }): void {
  if (user.role === "viewer") throw status(403, { error: "Viewers cannot change the assessment" });
}

async function publishedVersion(db: Database, user: AuthUser & { orgId: string }, versionCode: string) {
  return assertPublishedVersion(
    (await db.select().from(standardVersions).where(eq(standardVersions.code, versionCode)))[0],
    !publishedOnly(user),
    versionCode,
  );
}

async function ownedSite(db: Database, orgId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, orgId)));
  if (!site) throw status(404, { error: "Site not found" });
  return site;
}

async function ownedRun(db: Database, orgId: string, id: string) {
  const [run] = await db
    .select()
    .from(auditRuns)
    .where(and(eq(auditRuns.id, id), eq(auditRuns.organizationId, orgId)));
  if (!run) throw status(404, { error: "Audit not found" });
  return run;
}

async function ownedItem(db: Database, runId: string, itemId: string) {
  const [item] = await db
    .select()
    .from(auditRunItems)
    .where(and(eq(auditRunItems.id, itemId), eq(auditRunItems.auditRunId, runId)));
  if (!item) throw status(404, { error: "Audit item not found" });
  return item;
}

async function itemsWithRequirement(db: Database, runId: string) {
  return db
    .select({
      id: auditRunItems.id,
      requirementVersionId: auditRunItems.requirementVersionId,
      criterion: requirementVersions.sourceRequirementId,
      level: requirementVersions.level,
      principle: requirementVersions.principleText,
      verdict: auditRunItems.verdict,
      rationale: auditRunItems.rationale,
      recommendation: auditRunItems.recommendation,
      suggestedSeverity: auditRunItems.suggestedSeverity,
      citedEvidence: auditRunItems.citedEvidence,
      ungrounded: auditRunItems.ungrounded,
      confidence: auditRunItems.confidence,
      acceptedAt: auditRunItems.acceptedAt,
      findingId: auditRunItems.findingId,
    })
    .from(auditRunItems)
    .innerJoin(requirementVersions, eq(requirementVersions.id, auditRunItems.requirementVersionId))
    .where(eq(auditRunItems.auditRunId, runId));
}

async function writeResponse(
  db: Database,
  user: AuthUser & { orgId: string },
  run: { siteId: string; standardVersionId: string },
  requirementVersionId: string,
  response: AssessmentResponse,
): Promise<void> {
  const assessment = await ensureDraftAssessment(db, user, run.siteId, run.standardVersionId);
  const [existing] = await db
    .select({ id: assessmentItems.id })
    .from(assessmentItems)
    .where(
      and(eq(assessmentItems.assessmentId, assessment.id), eq(assessmentItems.requirementVersionId, requirementVersionId)),
    );
  if (!existing) {
    await db.insert(assessmentItems).values({ assessmentId: assessment.id, requirementVersionId, response });
    return;
  }
  await db
    .update(assessmentItems)
    .set({ response, updatedAt: new Date() })
    .where(eq(assessmentItems.id, existing.id));
}

async function ensureDraftAssessment(
  db: Database,
  user: AuthUser & { orgId: string },
  siteId: string,
  versionId: string,
) {
  const [latest] = await db
    .select()
    .from(assessments)
    .where(and(eq(assessments.siteId, siteId), eq(assessments.standardVersionId, versionId)))
    .orderBy(desc(assessments.createdAt))
    .limit(1);
  if (latest && latest.status === "draft") return latest;
  const [created] = await db
    .insert(assessments)
    .values({
      organizationId: user.orgId,
      siteId,
      standardVersionId: versionId,
      assessorId: user.id,
    })
    .returning();
  const ids = await applicableIds(db, siteId, versionId);
  if (ids.length > 0) {
    await db.insert(assessmentItems).values(ids.map((id) => ({ assessmentId: created!.id, requirementVersionId: id })));
  }
  return created!;
}
