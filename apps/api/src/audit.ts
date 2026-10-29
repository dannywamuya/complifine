/**
 * Self-assessment, findings and the readiness count.
 *
 * Completing an assessment writes a finding for every partial or non-compliant
 * item. Closing a finding, and verifying a corrective action, is limited to
 * the owner and the compliance manager.
 */

import { Elysia, status, t } from "elysia";
import { and, desc, eq, inArray, type Database } from "@complifine/db";
import {
  assessmentItems,
  assessments,
  correctiveActions,
  findings,
  requirementVersions,
  sites,
  standardVersions,
} from "@complifine/db";
import { applicableIds, auditReadiness } from "@complifine/ai";
import { readAuth, requireOrg, type AuthUser } from "./auth/plugin.ts";
import { assertPublishedVersion, publishedOnly } from "./knowledge-access.ts";

type OrgUser = AuthUser & { orgId: string };

export function auditRoutes(db: Database) {
  return new Elysia({ name: "complifine-audit" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .post(
      "/assessments",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot assess" });
        const site = await ownedSite(db, user.orgId, body.siteId);
        const version = assertPublishedVersion(
          (await db.select().from(standardVersions).where(eq(standardVersions.code, body.versionCode)))[0],
          !publishedOnly(user),
          body.versionCode,
        );
        const [created] = await db
          .insert(assessments)
          .values({
            organizationId: user.orgId,
            siteId: site.id,
            standardVersionId: version.id,
            assessorId: user.id,
          })
          .returning();
        const applicable = await applicableIds(db, site.id, version.id);
        if (applicable.length) {
          await db.insert(assessmentItems).values(
            applicable.map((id) => ({ assessmentId: created!.id, requirementVersionId: id })),
          );
        }
        return created;
      },
      { body: t.Object({ siteId: t.String(), versionCode: t.String() }) },
    )
    .get("/assessments/:id", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const [assessment] = await db
        .select()
        .from(assessments)
        .where(and(eq(assessments.id, params.id), eq(assessments.organizationId, user.orgId)));
      if (!assessment) throw status(404, { error: "Assessment not found" });
      const items = await db
        .select({
          id: assessmentItems.id,
          requirementVersionId: assessmentItems.requirementVersionId,
          criterion: requirementVersions.sourceRequirementId,
          level: requirementVersions.level,
          principle: requirementVersions.principleText,
          response: assessmentItems.response,
          comment: assessmentItems.comment,
          evidenceId: assessmentItems.evidenceId,
        })
        .from(assessmentItems)
        .innerJoin(requirementVersions, eq(requirementVersions.id, assessmentItems.requirementVersionId))
        .where(eq(assessmentItems.assessmentId, assessment.id));
      return { assessment, items };
    })
    .patch(
      "/assessments/:id/items",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot assess" });
        const [assessment] = await db
          .select()
          .from(assessments)
          .where(and(eq(assessments.id, params.id), eq(assessments.organizationId, user.orgId)));
        if (!assessment) throw status(404, { error: "Assessment not found" });
        if (assessment.status === "complete") throw status(409, { error: "This assessment is complete" });
        const [item] = await db
          .update(assessmentItems)
          .set({
            response: body.response,
            comment: body.comment,
            evidenceId: body.evidenceId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(assessmentItems.assessmentId, assessment.id),
              eq(assessmentItems.requirementVersionId, body.requirementVersionId),
            ),
          )
          .returning();
        if (!item) throw status(404, { error: "That requirement is not in this assessment" });
        return item;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          requirementVersionId: t.String(),
          response: t.Union([
            t.Literal("compliant"),
            t.Literal("partial"),
            t.Literal("non_compliant"),
            t.Literal("not_applicable"),
            t.Literal("not_assessed"),
          ]),
          comment: t.Optional(t.String()),
          evidenceId: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .post("/assessments/:id/complete", async ({ auth, params }) => {
      const user = requireOrg(auth);
      if (user.role === "viewer") throw status(403, { error: "Viewers cannot assess" });
      const [assessment] = await db
        .select()
        .from(assessments)
        .where(and(eq(assessments.id, params.id), eq(assessments.organizationId, user.orgId)));
      if (!assessment) throw status(404, { error: "Assessment not found" });
      if (assessment.status === "complete") throw status(409, { error: "This assessment is already complete" });
      const items = await db
        .select()
        .from(assessmentItems)
        .where(eq(assessmentItems.assessmentId, assessment.id));
      for (const item of items) {
        if (item.response !== "partial" && item.response !== "non_compliant") continue;
        await db.insert(findings).values({
          organizationId: user.orgId,
          siteId: assessment.siteId,
          assessmentId: assessment.id,
          requirementVersionId: item.requirementVersionId,
          description: item.comment?.trim() || `Assessed ${item.response.replace("_", " ")}`,
          severity: item.response === "non_compliant" ? "major" : "minor",
          status: "open",
        });
      }
      const [updated] = await db
        .update(assessments)
        .set({ status: "complete", updatedAt: new Date() })
        .where(eq(assessments.id, assessment.id))
        .returning();
      return updated;
    })
    .get(
      "/findings",
      async ({ auth, query }) => {
        const user = requireOrg(auth);
        if (query.siteId) await ownedSite(db, user.orgId, query.siteId);
        const rows = await db
          .select()
          .from(findings)
          .where(
            and(
              eq(findings.organizationId, user.orgId),
              query.siteId ? eq(findings.siteId, query.siteId) : undefined,
            ),
          )
          .orderBy(desc(findings.createdAt));
        return { findings: await withRequirement(db, rows) };
      },
      { query: t.Object({ siteId: t.Optional(t.String()) }) },
    )
    .post(
      "/findings",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot open findings" });
        const site = await ownedSite(db, user.orgId, body.siteId);
        if (body.requirementVersionId) await knownRequirement(db, body.requirementVersionId);
        const [created] = await db
          .insert(findings)
          .values({
            organizationId: user.orgId,
            siteId: site.id,
            requirementVersionId: body.requirementVersionId,
            section: body.section,
            description: body.description,
            severity: body.severity ?? "minor",
            dueDate: body.dueDate ? new Date(body.dueDate) : null,
            responsibleId: user.id,
          })
          .returning();
        const [presented] = await withRequirement(db, [created!]);
        return presented;
      },
      {
        body: t.Object({
          siteId: t.String(),
          description: t.String({ minLength: 1 }),
          requirementVersionId: t.Optional(t.String()),
          section: t.Optional(t.String()),
          severity: t.Optional(t.Union([t.Literal("major"), t.Literal("minor"), t.Literal("observation")])),
          dueDate: t.Optional(t.String()),
        }),
      },
    )
    .patch(
      "/findings/:id",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        const [row] = await db
          .select()
          .from(findings)
          .where(and(eq(findings.id, params.id), eq(findings.organizationId, user.orgId)));
        if (!row) throw status(404, { error: "Finding not found" });
        if (body.status === "closed") assertVerifier(user);
        const [updated] = await db
          .update(findings)
          .set({
            status: body.status ?? row.status,
            description: body.description ?? row.description,
            dueDate: body.dueDate === undefined ? row.dueDate : body.dueDate ? new Date(body.dueDate) : null,
            checkedBy: body.status === "closed" ? user.id : row.checkedBy,
            updatedAt: new Date(),
          })
          .where(eq(findings.id, row.id))
          .returning();
        const [presented] = await withRequirement(db, [updated!]);
        return presented;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          status: t.Optional(t.Union([t.Literal("open"), t.Literal("in_progress"), t.Literal("closed")])),
          description: t.Optional(t.String()),
          dueDate: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .post(
      "/findings/:id/actions",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        if (user.role === "viewer") throw status(403, { error: "Viewers cannot add corrective actions" });
        const [row] = await db
          .select()
          .from(findings)
          .where(and(eq(findings.id, params.id), eq(findings.organizationId, user.orgId)));
        if (!row) throw status(404, { error: "Finding not found" });
        const [created] = await db
          .insert(correctiveActions)
          .values({
            findingId: row.id,
            ownerId: user.id,
            rootCause: body.rootCause,
            action: body.action,
            preventiveAction: body.preventiveAction,
            dueDate: body.dueDate ? new Date(body.dueDate) : null,
            completionEvidenceId: body.completionEvidenceId,
          })
          .returning();
        return created;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          action: t.String({ minLength: 1 }),
          rootCause: t.Optional(t.String()),
          preventiveAction: t.Optional(t.String()),
          dueDate: t.Optional(t.String()),
          completionEvidenceId: t.Optional(t.String()),
        }),
      },
    )
    .patch(
      "/corrective-actions/:id",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        const [row] = await db
          .select({ action: correctiveActions, orgId: findings.organizationId })
          .from(correctiveActions)
          .innerJoin(findings, eq(findings.id, correctiveActions.findingId))
          .where(eq(correctiveActions.id, params.id));
        if (!row || row.orgId !== user.orgId) throw status(404, { error: "Corrective action not found" });
        if (body.status === "verified") assertVerifier(user);
        const [updated] = await db
          .update(correctiveActions)
          .set({
            status: body.status ?? row.action.status,
            rootCause: body.rootCause ?? row.action.rootCause,
            action: body.action ?? row.action.action,
            preventiveAction: body.preventiveAction ?? row.action.preventiveAction,
            completionEvidenceId: body.completionEvidenceId ?? row.action.completionEvidenceId,
            verifiedBy: body.status === "verified" ? user.id : row.action.verifiedBy,
            verifiedAt: body.status === "verified" ? new Date() : row.action.verifiedAt,
            updatedAt: new Date(),
          })
          .where(eq(correctiveActions.id, params.id))
          .returning();
        return updated;
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          status: t.Optional(t.Union([t.Literal("open"), t.Literal("done"), t.Literal("verified")])),
          rootCause: t.Optional(t.String()),
          action: t.Optional(t.String()),
          preventiveAction: t.Optional(t.String()),
          completionEvidenceId: t.Optional(t.String()),
        }),
      },
    )
    .get(
      "/sites/:id/requirements",
      async ({ auth, params, query }) => {
        const user = requireOrg(auth);
        const site = await ownedSite(db, user.orgId, params.id);
        const version = assertPublishedVersion(
          (await db.select().from(standardVersions).where(eq(standardVersions.code, query.versionCode)))[0],
          !publishedOnly(user),
          query.versionCode,
        );
        const ids = await applicableIds(db, site.id, version.id);
        if (ids.length === 0) return { requirements: [] };
        const rows = await db
          .select({
            id: requirementVersions.id,
            criterion: requirementVersions.sourceRequirementId,
            level: requirementVersions.level,
            principle: requirementVersions.principleText,
            sortKey: requirementVersions.sortKey,
          })
          .from(requirementVersions)
          .where(inArray(requirementVersions.id, ids));
        rows.sort((a, b) => a.sortKey - b.sortKey || a.criterion.localeCompare(b.criterion));
        return {
          requirements: rows.map(({ sortKey: _sortKey, ...row }) => row),
        };
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ versionCode: t.String() }),
      },
    )
    .get(
      "/sites/:id/readiness",
      async ({ auth, params, query }) => {
        const user = requireOrg(auth);
        const site = await ownedSite(db, user.orgId, params.id);
        const version = assertPublishedVersion(
          (await db.select().from(standardVersions).where(eq(standardVersions.code, query.versionCode)))[0],
          !publishedOnly(user),
          query.versionCode,
        );
        return auditReadiness(db, {
          organizationId: user.orgId,
          siteId: site.id,
          siteType: site.siteType,
          versionId: version.id,
        });
      },
      {
        params: t.Object({ id: t.String() }),
        query: t.Object({ versionCode: t.String() }),
      },
    );
}

function assertVerifier(user: OrgUser): void {
  if (user.role !== "owner" && user.role !== "compliance_manager") {
    throw status(403, { error: "Only an owner or compliance manager can close or verify" });
  }
}

async function knownRequirement(db: Database, id: string) {
  const [row] = await db
    .select({ id: requirementVersions.id })
    .from(requirementVersions)
    .where(eq(requirementVersions.id, id));
  if (!row) throw status(422, { error: "Requirement not found" });
}

async function withRequirement<T extends { requirementVersionId: string | null }>(db: Database, rows: T[]) {
  const ids = [...new Set(rows.map((row) => row.requirementVersionId).filter((id): id is string => Boolean(id)))];
  const linked =
    ids.length === 0
      ? []
      : await db
          .select({
            id: requirementVersions.id,
            criterion: requirementVersions.sourceRequirementId,
            level: requirementVersions.level,
            principle: requirementVersions.principleText,
          })
          .from(requirementVersions)
          .where(inArray(requirementVersions.id, ids));
  const byId = new Map(linked.map((row) => [row.id, row]));
  return rows.map((row) => ({
    ...row,
    requirement: row.requirementVersionId ? (byId.get(row.requirementVersionId) ?? null) : null,
  }));
}

async function ownedSite(db: Database, orgId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.organizationId, orgId)));
  if (!site) throw status(404, { error: "Site not found" });
  return site;
}

