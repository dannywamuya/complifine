/**
 * Elysia application.
 *
 * Routes are grouped by the thing they are about, not by the HTTP verb. Each
 * group is a function so the OpenAPI description lives next to the handler
 * rather than in a separate spec that can drift.
 */

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import {
  and,
  asc,
  count,
  createDatabase,
  desc,
  eq,
  ilike,
  inArray,
  or,
} from "@complifine/db";
import {
  applicabilityQuestions,
  chunkEmbeddings,
  knowledgeReviews,
  qualityGateResults,
  requirementApplicability,
  requirementVersions,
  standardDocuments,
  standardSections,
  standardVersions,
  standards,
  users,
} from "@complifine/db";
import {
  AUTHORITY_LEVEL_LABELS,
  DOCUMENT_TYPE_LABELS,
  requirementLevelLabel,
  VERSION_TRANSITIONS,
  env,
  hasAiCredentials,
  type AuthorityLevel,
  type DocumentType,
  type VersionStatus,
} from "@complifine/core";
import {
  ask,
  askStream,
  embedderForQuery,
  resolveChecklist,
  search,
} from "@complifine/ai";
import { recordReview, runGates, transitionVersion } from "@complifine/ingestion";
import { adminRoutes } from "./admin.ts";
import { conversationRoutes, finishAssistant, insertTurn, ownedSiteId } from "./conversations.ts";
import { knowledgeGraph, listStandards, lookupRequirementIds, parseCodeList } from "./catalog.ts";
import { httpError } from "./errors.ts";
import { authModule } from "./auth/plugin.ts";
import { demoRoutes } from "./demo.ts";
import { farmRoutes } from "./farm.ts";

const chatTurn = t.Object({
  role: t.Union([t.Literal("user"), t.Literal("assistant")]),
  content: t.String(),
});

export function createApp(database = createDatabase()) {
  const db = database;

  return (
    new Elysia({ name: "complifine-api" })
      .use(
        cors({
          origin: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
          ],
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
          allowedHeaders: ["Content-Type", "Accept", "Authorization"],
          credentials: true,
        }),
      )
      .use(
        openapi({
          path: "/swagger",
          documentation: {
            info: {
              title: "CompliFine API",
              version: "0.1.0",
              description:
                "Multi-standard compliance knowledge base: certifications, versions, criteria, hybrid search, the agent, and quality gates.",
            },
            servers: [{ url: `http://localhost:${env().API_PORT}` }],
          },
        }),
      )
      .decorate("db", db)
      .use(authModule(db))
      .use(demoRoutes(db))
      .use(farmRoutes(db))
      .use(conversationRoutes(db))
      .use(adminRoutes(db))
      .onError(({ code, error, set }) => {
        const message = error instanceof Error ? error.message : String(error);
        if (code === "NOT_FOUND") {
          set.status = 404;
          return { error: message };
        }
        if (code === "VALIDATION") {
          set.status = 422;
          return { error: message };
        }
        const cause = error instanceof Error ? error.cause : undefined;
        console.error("[api]", code, message, cause ?? error);
        set.status = 500;
        return { error: message };
      })

      .get("/health", () => ({ ok: true, service: "complifine-api" }), {
        detail: { summary: "Liveness probe" },
      })

      .get(
        "/ready",
        async ({ set }) => {
          try {
            const migrationRows = await db.$client<{ n: number }[]>`
              SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations
            `;
            const migrations = migrationRows[0]?.n ?? 0;
            const operators = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.kind, "operator"))
              .limit(1);
            const ready = migrations > 0 && operators.length > 0;
            set.status = ready ? 200 : 503;
            return {
              ok: ready,
              service: "complifine-api",
              migrations,
              operator: operators.length > 0,
            };
          } catch {
            set.status = 503;
            return {
              ok: false,
              service: "complifine-api",
              migrations: 0,
              operator: false,
            };
          }
        },
        { detail: { summary: "Readiness: schema applied and operator seeded" } },
      )

      .get(
        "/status",
        async () => {
          const versions = await db
            .select({
              id: standardVersions.id,
              code: standardVersions.code,
              name: standardVersions.name,
              edition: standardVersions.edition,
              status: standardVersions.status,
              standardId: standardVersions.standardId,
              standardCode: standards.code,
              standardName: standards.name,
            })
            .from(standardVersions)
            .innerJoin(standards, eq(standards.id, standardVersions.standardId))
            .orderBy(standardVersions.code);
          const chunks = await db
            .select({
              model: chunkEmbeddings.model,
              vectors: count(),
            })
            .from(chunkEmbeddings)
            .groupBy(chunkEmbeddings.model);

          const details = [];
          for (const version of versions) {
            const [requirements] = await db
              .select({ value: count() })
              .from(requirementVersions)
              .where(eq(requirementVersions.standardVersionId, version.id));
            const documents = await db
              .select({
                type: standardDocuments.documentType,
                status: standardDocuments.status,
              })
              .from(standardDocuments)
              .where(eq(standardDocuments.standardVersionId, version.id));

            details.push({
              code: version.code,
              name: version.name,
              edition: version.edition,
              status: version.status,
              standardCode: version.standardCode,
              standardName: version.standardName,
              criteria: Number(requirements?.value ?? 0),
              documents: documents.length,
              fetched: documents.filter((document) => document.status !== "registered").length,
            });
          }

          return {
            ai: {
              credentials: hasAiCredentials(),
              embeddings: chunks,
            },
            versions: details,
          };
        },
        { detail: { summary: "Knowledge-base coverage at a glance" } },
      )

      .get(
        "/standards",
        async () => listStandards(db),
        { detail: { summary: "Certifications and their ingested versions" } },
      )

      .get(
        "/graph",
        async ({ query }) =>
          knowledgeGraph(db, {
            standardCodes: parseCodeList(query.standards),
            detail: query.detail === "sections" ? "sections" : "overview",
          }),
        {
          query: t.Object({
            standards: t.Optional(t.String()),
            detail: t.Optional(t.String()),
          }),
          detail: { summary: "Aggregated knowledge graph of certs, versions, controls and links" },
        },
      )

      // ---------------------------------------------------------------------
      // Versions
      // ---------------------------------------------------------------------
      .get(
        "/versions",
        async ({ query }) => {
          const standardCodes = parseCodeList(query.standards);
          const rows = await db
            .select({
              id: standardVersions.id,
              code: standardVersions.code,
              name: standardVersions.name,
              edition: standardVersions.edition,
              version: standardVersions.version,
              scope: standardVersions.scope,
              status: standardVersions.status,
              levelScheme: standardVersions.levelScheme,
              effectiveDate: standardVersions.effectiveDate,
              publishedAt: standardVersions.publishedAt,
              standardCode: standards.code,
              standardName: standards.name,
              publisher: standards.publisher,
              criteria: count(requirementVersions.id),
            })
            .from(standardVersions)
            .innerJoin(standards, eq(standards.id, standardVersions.standardId))
            .leftJoin(
              requirementVersions,
              eq(requirementVersions.standardVersionId, standardVersions.id),
            )
            .where(standardCodes.length ? inArray(standards.code, standardCodes) : undefined)
            .groupBy(standardVersions.id, standards.id)
            .orderBy(standardVersions.code);

          return { versions: rows };
        },
        {
          query: t.Object({ standards: t.Optional(t.String()) }),
          detail: { summary: "List ingested standard versions" },
        },
      )

      .get(
        "/versions/:code",
        async ({ params }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);

          const [standard] = await db
            .select()
            .from(standards)
            .where(eq(standards.id, version.standardId));

          const levels = await db
            .select({
              level: requirementVersions.level,
              count: count(),
            })
            .from(requirementVersions)
            .where(eq(requirementVersions.standardVersionId, version.id))
            .groupBy(requirementVersions.level);

          const documents = await db
            .select({
              slug: standardDocuments.slug,
              title: standardDocuments.title,
              type: standardDocuments.documentType,
              authorityLevel: standardDocuments.authorityLevel,
              status: standardDocuments.status,
              pageCount: standardDocuments.pageCount,
              sourceUrl: standardDocuments.sourceUrl,
              fileHash: standardDocuments.fileHash,
              retrievedAt: standardDocuments.retrievedAt,
            })
            .from(standardDocuments)
            .where(eq(standardDocuments.standardVersionId, version.id))
            .orderBy(asc(standardDocuments.authorityLevel), asc(standardDocuments.slug));

          return {
            ...version,
            allowedNext: VERSION_TRANSITIONS[version.status as VersionStatus],
            standard,
            levels: Object.fromEntries(
              levels.map((row) => [requirementLevelLabel(row.level, version.levelScheme), Number(row.count)]),
            ),
            levelOptions: levels.map((row) => ({
              code: row.level,
              label: requirementLevelLabel(row.level, version.levelScheme),
              count: Number(row.count),
            })),
            documents: documents.map((document) => ({
              ...document,
              type: DOCUMENT_TYPE_LABELS[document.type],
              authority: AUTHORITY_LEVEL_LABELS[document.authorityLevel as AuthorityLevel],
            })),
          };
        },
        {
          params: t.Object({ code: t.String() }),
          detail: { summary: "One version, with documents and level counts" },
        },
      )

      .get(
        "/versions/:code/gates",
        async ({ params, query }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);

          if (query.refresh === "true") {
            const report = await runGates(db, version.id);
            return report;
          }

          const stored = await db
            .select()
            .from(qualityGateResults)
            .where(eq(qualityGateResults.standardVersionId, version.id))
            .orderBy(qualityGateResults.gate);

          if (stored.length === 0) {
            return runGates(db, version.id);
          }

          return {
            results: stored.map((row) => ({
              gate: row.gate,
              description: row.description,
              blocking: row.blocking,
              passed: row.passed,
              expected: row.expected,
              actual: row.actual,
              failures: row.failures,
            })),
            passed: stored.filter((row) => row.blocking && !row.passed).length === 0,
            blockingFailures: stored.filter((row) => row.blocking && !row.passed).length,
            advisoryFailures: stored.filter((row) => !row.blocking && !row.passed).length,
          };
        },
        {
          params: t.Object({ code: t.String() }),
          query: t.Object({ refresh: t.Optional(t.String()) }),
          detail: { summary: "Quality-gate results for a version" },
        },
      )

      .get(
        "/versions/:code/sections",
        async ({ params }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);

          const sections = await db
            .select({
              id: standardSections.id,
              parentId: standardSections.parentId,
              number: standardSections.sourceIdentifier,
              title: standardSections.title,
              depth: standardSections.depth,
              order: standardSections.sectionOrder,
              page: standardSections.sourcePage,
            })
            .from(standardSections)
            .innerJoin(standardDocuments, eq(standardDocuments.id, standardSections.documentId))
            .where(
              and(
                eq(standardSections.standardVersionId, version.id),
                eq(standardDocuments.documentType, "checklist"),
              ),
            )
            .orderBy(asc(standardSections.sectionOrder));

          return { sections };
        },
        {
          params: t.Object({ code: t.String() }),
          detail: { summary: "Checklist section tree" },
        },
      )

      .get(
        "/versions/:code/requirements",
        async ({ params, query }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);

          const conditions = [eq(requirementVersions.standardVersionId, version.id)];
          if (query.level) {
            const levels = query.level.split(",").map((part) => part.trim()).filter(Boolean);
            if (levels.length) conditions.push(inArray(requirementVersions.level, levels));
          }
          if (query.q) {
            conditions.push(
              or(
                ilike(requirementVersions.sourceRequirementId, `%${query.q}%`),
                ilike(requirementVersions.principleText, `%${query.q}%`),
                ilike(requirementVersions.criteriaText, `%${query.q}%`),
              )!,
            );
          }

          const limit = Math.min(Number(query.limit ?? 50), 200);
          const offset = Math.max(Number(query.offset ?? 0), 0);

          const rows = await db
            .select({
              id: requirementVersions.id,
              criterion: requirementVersions.sourceRequirementId,
              level: requirementVersions.level,
              principle: requirementVersions.principleText,
              page: requirementVersions.sourcePage,
              naExempt: requirementVersions.naExempt,
              section: standardSections.title,
              sectionNumber: standardSections.sourceIdentifier,
            })
            .from(requirementVersions)
            .leftJoin(standardSections, eq(standardSections.id, requirementVersions.sectionId))
            .where(and(...conditions))
            .orderBy(asc(requirementVersions.sortKey))
            .limit(limit)
            .offset(offset);

          const [total] = await db
            .select({ value: count() })
            .from(requirementVersions)
            .where(and(...conditions));

          return {
            total: Number(total?.value ?? 0),
            limit,
            offset,
            requirements: rows.map((row) => ({
              ...row,
              level: requirementLevelLabel(row.level, version.levelScheme),
            })),
          };
        },
        {
          params: t.Object({ code: t.String() }),
          query: t.Object({
            q: t.Optional(t.String()),
            level: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
          }),
          detail: { summary: "Paginated criteria for a version" },
        },
      )

      .get(
        "/versions/:code/applicability",
        async ({ params }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);

          const questions = await db
            .select({
              id: applicabilityQuestions.id,
              number: applicabilityQuestions.sourceNumber,
              question: applicabilityQuestions.questionText,
              justification: applicabilityQuestions.justificationTemplate,
              exemptingAnswer: applicabilityQuestions.exemptingAnswer,
              affected: count(requirementApplicability.id),
            })
            .from(applicabilityQuestions)
            .leftJoin(
              requirementApplicability,
              eq(requirementApplicability.questionId, applicabilityQuestions.id),
            )
            .where(eq(applicabilityQuestions.standardVersionId, version.id))
            .groupBy(applicabilityQuestions.id)
            .orderBy(asc(applicabilityQuestions.displayOrder));

          return { questions };
        },
        {
          params: t.Object({ code: t.String() }),
          detail: { summary: "Scoping questions for a version" },
        },
      )

      .post(
        "/versions/:code/scope",
        async ({ params, body }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);
          return resolveChecklist(db, version.id, body.answers);
        },
        {
          params: t.Object({ code: t.String() }),
          body: t.Object({
            answers: t.Array(
              t.Object({
                questionNumber: t.Number(),
                answer: t.Union([t.Literal("yes"), t.Literal("no")]),
              }),
            ),
          }),
          detail: { summary: "Resolve the applicable checklist for a producer" },
        },
      )

      .post(
        "/versions/:code/reviews",
        async ({ params, body }) => {
          await recordReview(db, {
            versionCode: params.code,
            reviewer: body.reviewer,
            decision: body.decision,
            notes: body.notes,
          });
          return { ok: true };
        },
        {
          params: t.Object({ code: t.String() }),
          body: t.Object({
            reviewer: t.String({ minLength: 1 }),
            decision: t.Union([
              t.Literal("approved"),
              t.Literal("rejected"),
              t.Literal("changes_requested"),
            ]),
            notes: t.Optional(t.String()),
          }),
          detail: { summary: "Record a human review decision" },
        },
      )

      .post(
        "/versions/:code/promote",
        async ({ params, body }) => {
          const result = await transitionVersion(db, {
            versionCode: params.code,
            to: body.to as never,
            actor: body.actor,
            notes: body.notes,
            force: body.force,
          });
          return result;
        },
        {
          params: t.Object({ code: t.String() }),
          body: t.Object({
            to: t.String(),
            actor: t.String({ minLength: 1 }),
            notes: t.Optional(t.String()),
            force: t.Optional(t.Boolean()),
          }),
          detail: { summary: "Advance a version through the publication state machine" },
        },
      )

      .get(
        "/versions/:code/reviews",
        async ({ params }) => {
          const version = await versionByCode(db, params.code);
          if (!version) return httpError(404, `Unknown version "${params.code}"`);
          const reviews = await db
            .select()
            .from(knowledgeReviews)
            .where(eq(knowledgeReviews.standardVersionId, version.id))
            .orderBy(desc(knowledgeReviews.createdAt));
          return { reviews };
        },
        {
          params: t.Object({ code: t.String() }),
          detail: { summary: "Review history for a version" },
        },
      )

      // ---------------------------------------------------------------------
      // Requirements and documents
      // ---------------------------------------------------------------------
      .get(
        "/requirements/:id",
        async ({ params, query }) => {
          const candidates = await lookupRequirementIds(params.id);
          const conditions = [
            or(
              inArray(requirementVersions.sourceRequirementId, candidates),
              ilike(requirementVersions.sourceRequirementId, `%${params.id}%`),
            )!,
          ];
          if (query.version) {
            const version = await versionByCode(db, query.version);
            if (!version) return httpError(404, `Unknown version "${query.version}"`);
            conditions.push(eq(requirementVersions.standardVersionId, version.id));
          }

          const rows = await db
            .select({
              id: requirementVersions.id,
              criterion: requirementVersions.sourceRequirementId,
              level: requirementVersions.level,
              principle: requirementVersions.principleText,
              criteria: requirementVersions.criteriaText,
              page: requirementVersions.sourcePage,
              naExempt: requirementVersions.naExempt,
              phuRelated: requirementVersions.phuRelated,
              status: requirementVersions.status,
              edition: standardVersions.code,
              editionName: standardVersions.name,
              levelScheme: standardVersions.levelScheme,
              section: standardSections.title,
              sectionNumber: standardSections.sourceIdentifier,
              document: standardDocuments.title,
              sourceUrl: standardDocuments.sourceUrl,
            })
            .from(requirementVersions)
            .innerJoin(
              standardVersions,
              eq(standardVersions.id, requirementVersions.standardVersionId),
            )
            .leftJoin(standardSections, eq(standardSections.id, requirementVersions.sectionId))
            .leftJoin(standardDocuments, eq(standardDocuments.id, requirementVersions.documentId))
            .where(and(...conditions));

          if (rows.length === 0) {
            return httpError(404, `No criterion "${params.id}"`);
          }

          return {
            requirements: rows.map((row) => ({
              ...row,
              level: requirementLevelLabel(row.level, row.levelScheme),
            })),
          };
        },
        {
          params: t.Object({ id: t.String() }),
          query: t.Object({ version: t.Optional(t.String()) }),
          detail: { summary: "Full text of one criterion, in every edition that has it" },
        },
      )

      .get(
        "/documents",
        async ({ query }) => {
          const standardCodes = parseCodeList(query.standards);
          const conditions = [];
          if (query.version) {
            const version = await versionByCode(db, query.version);
            if (version) conditions.push(eq(standardDocuments.standardVersionId, version.id));
          }
          if (standardCodes.length) {
            conditions.push(inArray(standards.code, standardCodes));
          }
          if (query.type) {
            conditions.push(eq(standardDocuments.documentType, query.type as DocumentType));
          }

          const rows = await db
            .select({
              slug: standardDocuments.slug,
              title: standardDocuments.title,
              type: standardDocuments.documentType,
              authorityLevel: standardDocuments.authorityLevel,
              edition: standardVersions.code,
              standardCode: standards.code,
              standardName: standards.name,
              filename: standardDocuments.filename,
              sourceUrl: standardDocuments.sourceUrl,
              pages: standardDocuments.pageCount,
              status: standardDocuments.status,
              retrievedAt: standardDocuments.retrievedAt,
              sha256: standardDocuments.fileHash,
              licenseNote: standardDocuments.licenseNote,
            })
            .from(standardDocuments)
            .innerJoin(
              standardVersions,
              eq(standardVersions.id, standardDocuments.standardVersionId),
            )
            .innerJoin(standards, eq(standards.id, standardVersions.standardId))
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(asc(standardDocuments.authorityLevel), asc(standardDocuments.slug));

          return {
            documents: rows.map((row) => ({
              ...row,
              type: DOCUMENT_TYPE_LABELS[row.type],
              authority: AUTHORITY_LEVEL_LABELS[row.authorityLevel as AuthorityLevel],
              binding: (row.authorityLevel as AuthorityLevel) <= 3,
            })),
          };
        },
        {
          query: t.Object({
            version: t.Optional(t.String()),
            standards: t.Optional(t.String()),
            type: t.Optional(t.String()),
          }),
          detail: { summary: "Source documents, with authority and provenance" },
        },
      )

      // ---------------------------------------------------------------------
      // Search and ask
      // ---------------------------------------------------------------------
      .get(
        "/search",
        async ({ query }) => {
          const choice = await embedderForQuery(db);
          const result = await search(db, choice.embedder, query.q, {
            versionCode: query.version,
            limit: query.limit ? Number(query.limit) : 10,
            maxAuthorityLevel: query.normative === "true" ? 3 : undefined,
            chunkTypes:
              query.kind === "regulations"
                ? ["section"]
                : query.kind === "requirements"
                  ? ["requirement"]
                  : undefined,
          });

          return {
            strategy: result.strategy,
            durationMs: result.durationMs,
            embedder: choice.embedder?.model ?? null,
            hits: result.hits.map((hit) => ({
              criterion: hit.requirementId,
              level: hit.requirementLevel
                ? requirementLevelLabel(hit.requirementLevel)
                : null,
              heading: hit.heading,
              section: hit.sectionTitle,
              edition: hit.versionCode,
              document: hit.documentTitle,
              authority: AUTHORITY_LEVEL_LABELS[hit.authorityLevel as AuthorityLevel],
              page: hit.sourcePage,
              text: hit.text,
              score: hit.score,
              lexicalRank: hit.lexicalRank,
              semanticRank: hit.semanticRank,
            })),
          };
        },
        {
          query: t.Object({
            q: t.String({ minLength: 2 }),
            version: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            normative: t.Optional(t.String()),
            kind: t.Optional(t.String()),
          }),
          detail: { summary: "Hybrid search over the knowledge base" },
        },
      )

      .post(
        "/ask",
        async ({ body, auth }) => {
          if (!hasAiCredentials()) {
            return httpError(
              503,
              "OPENAI_API_KEY is not set. Search still works; generation does not.",
            );
          }

          const choice = await embedderForQuery(db);
          const siteId = await ownedSiteId(db, body.siteId, auth?.orgId);
          const result = await ask(body.question, {
            db,
            embedder: choice.embedder,
            conversationId: body.conversationId,
            history: body.history,
            persist: true,
            userId: auth?.id,
            organizationId: auth?.orgId ?? undefined,
            siteId: siteId ?? undefined,
          });

          return {
            runId: result.runId,
            conversationId: result.conversationId,
            answer: result.answer,
            citations: result.citations,
            ungroundedCitations: result.ungroundedCitations,
            toolCalls: result.toolCalls.map((call) => ({
              name: call.name,
              args: call.args,
              durationMs: call.durationMs,
              error: call.error,
            })),
            usage: result.usage,
            durationMs: result.durationMs,
          };
        },
        {
          body: t.Object({
            question: t.String({ minLength: 2 }),
            conversationId: t.Optional(t.String()),
            siteId: t.Optional(t.String()),
            history: t.Optional(t.Array(chatTurn)),
          }),
          detail: { summary: "Ask the compliance agent" },
        },
      )

      .post(
        "/ask/stream",
        async ({ body, request, auth }) => {
          if (!hasAiCredentials()) {
            return httpError(
              503,
              "OPENAI_API_KEY is not set. Search still works; generation does not.",
            );
          }

          const choice = await embedderForQuery(db);
          const encoder = new TextEncoder();
          const conversationId = body.conversationId ?? crypto.randomUUID();
          const siteId = await ownedSiteId(db, body.siteId, auth?.orgId);

          const stream = new ReadableStream({
            async start(controller) {
              const send = (event: { type: string } & Record<string, unknown>) => {
                controller.enqueue(
                  encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
                );
              };

              let turn: { userMessageId: string; assistantMessageId: string } | null = null;
              let answer = "";
              let completed:
                | {
                    citations?: unknown;
                    ungrounded?: unknown;
                    tools?: unknown;
                    runId?: string;
                    durationMs?: number;
                  }
                | null = null;
              let failed: string | null = null;

              if (auth) {
                try {
                  turn = await insertTurn(db, {
                    conversationId,
                    userId: auth.id,
                    organizationId: auth.orgId,
                    siteId,
                    parentId: body.parentId ?? null,
                    question: body.userContent ?? body.question,
                    attachments: body.attachments,
                    userMessageId: body.userMessageId,
                    assistantMessageId: body.assistantMessageId,
                    skipUser: Boolean(body.skipUser),
                  });
                } catch (error) {
                  send({
                    type: "error",
                    message: error instanceof Error ? error.message : String(error),
                  } as { type: string });
                  controller.close();
                  return;
                }
              }

              try {
                for await (const event of askStream(body.question, {
                  db,
                  embedder: choice.embedder,
                  conversationId,
                  history: body.history,
                  persist: true,
                  abortSignal: request.signal,
                  userId: auth?.id,
                  organizationId: auth?.orgId ?? undefined,
                  siteId: siteId ?? undefined,
                })) {
                  if (event.type === "start" && turn) {
                    send({
                      ...event,
                      conversationId,
                      userMessageId: turn.userMessageId,
                      assistantMessageId: turn.assistantMessageId,
                    });
                  } else {
                    send(event);
                  }
                  if (event.type === "text") answer += event.text;
                  if (event.type === "done") {
                    answer = event.answer;
                    completed = {
                      citations: event.citations,
                      ungrounded: event.ungroundedCitations,
                      tools: event.toolCalls,
                      runId: event.runId,
                      durationMs: event.durationMs,
                    };
                  }
                  if (event.type === "error") failed = event.message;
                }
              } catch (error) {
                failed = error instanceof Error ? error.message : String(error);
                send({
                  type: "error",
                  message: failed,
                } as { type: string });
              } finally {
                if (turn) {
                  const aborted = request.signal.aborted;
                  await finishAssistant(db, turn.assistantMessageId, {
                    content: answer,
                    status: aborted ? "stopped" : failed ? "error" : "complete",
                    error: aborted ? null : failed,
                    ...completed,
                    runId: completed?.runId,
                    durationMs: completed?.durationMs,
                  }).catch(() => undefined);
                }
                controller.close();
              }
            },
          });

          const origin = request.headers.get("origin") ?? "http://localhost:3000";
          const allowed = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
          ];

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
              "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "http://localhost:3000",
              "Access-Control-Allow-Credentials": "true",
            },
          });
        },
        {
          body: t.Object({
            question: t.String({ minLength: 2 }),
            conversationId: t.Optional(t.String()),
            parentId: t.Optional(t.Union([t.String(), t.Null()])),
            userMessageId: t.Optional(t.String()),
            assistantMessageId: t.Optional(t.String()),
            skipUser: t.Optional(t.Boolean()),
            userContent: t.Optional(t.String()),
            siteId: t.Optional(t.String()),
            history: t.Optional(t.Array(chatTurn)),
            attachments: t.Optional(
              t.Array(
                t.Object({
                  id: t.String(),
                  kind: t.Union([t.Literal("image"), t.Literal("file")]),
                  name: t.String(),
                  size: t.Number(),
                  mime: t.String(),
                  dataUrl: t.Optional(t.String()),
                }),
              ),
            ),
          }),
          detail: { summary: "Ask the compliance agent, streaming tokens and tool calls" },
        },
      )

  );
}

export async function versionByCode(db: ReturnType<typeof createDatabase>, code: string) {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.code, code));
  return version ?? null;
}
