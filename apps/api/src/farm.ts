import { Elysia, status, t } from "elysia";
import { and, desc, eq, inArray, not, type Database } from "@complifine/db";
import {
  applicabilityQuestions,
  controlEvidenceTypes,
  controlRequirements,
  controls,
  evidenceTypes,
  organizationScopes,
  organizations,
  memberships,
  requirementVersions,
  siteScopingAnswers,
  sites,
  standardVersions,
} from "@complifine/db";
import { resolveChecklist } from "@complifine/ai";
import { readAuth, requireOrg, requireUser, type AuthUser } from "./auth/plugin.ts";
import { publishedOnly, assertPublishedVersion } from "./knowledge-access.ts";

export function farmRoutes(db: Database) {
  return new Elysia({ name: "complifine-farm" })
    .derive((ctx): { auth: AuthUser | null } => ({ auth: readAuth(ctx) }))
    .get("/org", async ({ auth }) => {
      const user = requireUser(auth);
      if (!user.orgId) {
        return { organization: null, sites: [], scopes: [], role: user.role };
      }
      const [org] = await db.select().from(organizations).where(eq(organizations.id, user.orgId));
      const orgSites = await db.select().from(sites).where(eq(sites.organizationId, user.orgId));
      const scopes = await db
        .select({
          id: organizationScopes.id,
          versionId: organizationScopes.standardVersionId,
          code: standardVersions.code,
          name: standardVersions.name,
          edition: standardVersions.edition,
        })
        .from(organizationScopes)
        .innerJoin(standardVersions, eq(standardVersions.id, organizationScopes.standardVersionId))
        .where(
          and(
            eq(organizationScopes.organizationId, user.orgId),
            publishedOnly(user) ? eq(standardVersions.status, "published") : undefined,
          ),
        );
      return { organization: org ?? null, sites: orgSites, scopes, role: user.role };
    })
    .post(
      "/org",
      async ({ auth, body }) => {
        const user = requireUser(auth);
        if (!user.orgId) {
          const name = body.name?.trim();
          if (!name) throw status(400, { error: "Company name is required" });
          const [org] = await db
            .insert(organizations)
            .values({
              name,
              country: body.country?.trim() || "KE",
              sedexZc: body.sedexZc?.trim() || null,
            })
            .returning();
          await db.insert(memberships).values({
            userId: user.id,
            organizationId: org!.id,
            role: "owner",
          });
          return org;
        }
        const [org] = await db
          .update(organizations)
          .set({
            name: body.name?.trim() ?? undefined,
            country: body.country?.trim() ?? undefined,
            sedexZc: body.sedexZc?.trim() || null,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, user.orgId))
          .returning();
        return org;
      },
      {
        body: t.Object({
          name: t.Optional(t.String()),
          country: t.Optional(t.String()),
          sedexZc: t.Optional(t.String()),
        }),
      },
    )
    .post(
      "/org/scopes",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        const codes = [
          ...(body.versionCode ? [body.versionCode] : []),
          ...(body.versionCodes ?? []),
        ];
        const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
        if (unique.length === 0) throw status(400, { error: "Choose at least one published version" });
        const versionIds: string[] = [];
        const added: string[] = [];
        for (const code of unique) {
          const version = assertPublishedVersion(
            (await db.select().from(standardVersions).where(eq(standardVersions.code, code)))[0],
            !publishedOnly(user),
            code,
          );
          await db
            .insert(organizationScopes)
            .values({ organizationId: user.orgId, standardVersionId: version.id })
            .onConflictDoNothing();
          versionIds.push(version.id);
          added.push(version.code);
        }
        if (body.replace) {
          await db
            .delete(organizationScopes)
            .where(
              and(
                eq(organizationScopes.organizationId, user.orgId),
                not(inArray(organizationScopes.standardVersionId, versionIds)),
              ),
            );
        }
        return { ok: true, versionCodes: added };
      },
      {
        body: t.Object({
          versionCode: t.Optional(t.String()),
          versionCodes: t.Optional(t.Array(t.String())),
          replace: t.Optional(t.Boolean()),
        }),
      },
    )
    .post(
      "/sites",
      async ({ auth, body }) => {
        const user = requireOrg(auth);
        const [site] = await db
          .insert(sites)
          .values({
            organizationId: user.orgId,
            name: body.name.trim(),
            siteType: body.siteType,
            location: body.location?.trim() || null,
            notes: body.notes?.trim() || null,
          })
          .returning();
        return site;
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          siteType: t.Union([
            t.Literal("farm"),
            t.Literal("packhouse"),
            t.Literal("collection_centre"),
            t.Literal("warehouse"),
          ]),
          location: t.Optional(t.String()),
          notes: t.Optional(t.String()),
        }),
      },
    )
    .get("/sites/:id", async ({ auth, params }) => {
      const user = requireOrg(auth);
      const [site] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, params.id), eq(sites.organizationId, user.orgId)));
      if (!site) throw status(404, { error: "Site not found" });
      const answers = await db
        .select({
          questionId: siteScopingAnswers.questionId,
          answer: siteScopingAnswers.answer,
          questionText: applicabilityQuestions.questionText,
          sourceNumber: applicabilityQuestions.sourceNumber,
          versionId: applicabilityQuestions.standardVersionId,
        })
        .from(siteScopingAnswers)
        .innerJoin(applicabilityQuestions, eq(applicabilityQuestions.id, siteScopingAnswers.questionId))
        .where(eq(siteScopingAnswers.siteId, site.id));
      return { site, answers };
    })
    .post(
      "/sites/:id/answers",
      async ({ auth, params, body }) => {
        const user = requireOrg(auth);
        const [site] = await db
          .select()
          .from(sites)
          .where(and(eq(sites.id, params.id), eq(sites.organizationId, user.orgId)));
        if (!site) throw status(404, { error: "Site not found" });
        for (const item of body.answers) {
          await db
            .insert(siteScopingAnswers)
            .values({ siteId: site.id, questionId: item.questionId, answer: item.answer })
            .onConflictDoUpdate({
              target: [siteScopingAnswers.siteId, siteScopingAnswers.questionId],
              set: { answer: item.answer, updatedAt: new Date() },
            });
        }
        return { ok: true };
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          answers: t.Array(
            t.Object({
              questionId: t.String(),
              answer: t.Union([t.Literal("yes"), t.Literal("no"), t.Literal("unanswered")]),
            }),
          ),
        }),
      },
    )
    .get("/sites/:id/resolution", async ({ auth, params, query }) => {
      const user = requireOrg(auth);
      const [site] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, params.id), eq(sites.organizationId, user.orgId)));
      if (!site) throw status(404, { error: "Site not found" });
      const version = assertPublishedVersion(
        (
          await db
            .select()
            .from(standardVersions)
            .where(eq(standardVersions.code, query.versionCode))
        )[0],
        !publishedOnly(user),
        query.versionCode,
      );
      const saved = await db
        .select({
          questionNumber: applicabilityQuestions.sourceNumber,
          answer: siteScopingAnswers.answer,
        })
        .from(siteScopingAnswers)
        .innerJoin(applicabilityQuestions, eq(applicabilityQuestions.id, siteScopingAnswers.questionId))
        .where(
          and(
            eq(siteScopingAnswers.siteId, site.id),
            eq(applicabilityQuestions.standardVersionId, version.id),
          ),
        );
      const answers = saved
        .filter(
          (row): row is { questionNumber: number; answer: "yes" | "no" } =>
            row.questionNumber !== null && (row.answer === "yes" || row.answer === "no"),
        )
        .map((row) => ({ questionNumber: row.questionNumber, answer: row.answer }));
      return resolveChecklist(db, version.id, answers);
    }, {
      params: t.Object({ id: t.String() }),
      query: t.Object({ versionCode: t.String() }),
    })
    .get("/controls", async ({ auth }) => {
      requireUser(auth);
      const library = await db.select().from(controls).orderBy(controls.slug);
      const mapped = await db
        .select({
          controlId: controlRequirements.controlId,
          criterion: requirementVersions.sourceRequirementId,
          edition: standardVersions.code,
          editionStatus: standardVersions.status,
        })
        .from(controlRequirements)
        .innerJoin(
          requirementVersions,
          eq(requirementVersions.id, controlRequirements.requirementVersionId),
        )
        .innerJoin(standardVersions, eq(standardVersions.id, requirementVersions.standardVersionId));
      const visibleMapped = publishedOnly(auth)
        ? mapped.filter((row) => row.editionStatus === "published")
        : mapped;
      const evidence = await db
        .select({
          controlId: controlEvidenceTypes.controlId,
          slug: evidenceTypes.slug,
          title: evidenceTypes.title,
        })
        .from(controlEvidenceTypes)
        .innerJoin(evidenceTypes, eq(evidenceTypes.id, controlEvidenceTypes.evidenceTypeId));
      return {
        controls: library.map((control) => ({
          ...control,
          requirements: visibleMapped.filter((row) => row.controlId === control.id),
          evidence: evidence.filter((row) => row.controlId === control.id),
        })),
      };
    });
}
