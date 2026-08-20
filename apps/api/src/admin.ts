/**
 * Operator routes: jobs, drift, edition diff, audit, and starting pipelines.
 *
 * Starting a stage returns immediately. The work happens in the CLI process,
 * which writes `ingestion_jobs` the console already polls.
 */

import { Elysia, t } from "elysia";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, type Database } from "@complifine/db";
import {
  auditLogs,
  ingestionEvents,
  ingestionJobs,
  requirementRelationships,
  requirementVersions,
  standardVersions,
} from "@complifine/db";
import { REQUIREMENT_LEVEL_LABELS } from "@complifine/core";
import {
  checkForDrift,
  linkEditions,
  storageUsage,
  type JobContext,
} from "@complifine/ingestion";
import { httpError } from "./errors.ts";
import {
  runningProcess,
  startIndex,
  startPipeline,
} from "./pipeline.ts";

function silentJob(): JobContext {
  return {
    jobId: "00000000-0000-0000-0000-000000000000",
    runId: "00000000-0000-0000-0000-000000000000",
    log: async () => undefined,
    debug: async () => undefined,
    info: async () => undefined,
    warn: async () => undefined,
    error: async () => undefined,
    count: () => undefined,
  };
}

const stepSchema = t.Union([
  t.Literal("registry"),
  t.Literal("fetch"),
  t.Literal("parse"),
  t.Literal("pages"),
  t.Literal("prose"),
  t.Literal("link"),
  t.Literal("gates"),
  t.Literal("all"),
]);

export function adminRoutes(db: Database) {
  const smartReq = alias(requirementVersions, "smart_requirement");
  const gfsReq = alias(requirementVersions, "gfs_requirement");

  return (
    new Elysia({ name: "complifine-admin" })
      .get(
        "/jobs",
        async ({ query }) => {
          const limit = Math.min(Number(query.limit ?? 40), 100);
          const rows = await db
            .select({
              id: ingestionJobs.id,
              runId: ingestionJobs.runId,
              stage: ingestionJobs.stage,
              status: ingestionJobs.status,
              stats: ingestionJobs.stats,
              error: ingestionJobs.error,
              durationMs: ingestionJobs.durationMs,
              startedAt: ingestionJobs.startedAt,
              finishedAt: ingestionJobs.finishedAt,
              versionCode: standardVersions.code,
            })
            .from(ingestionJobs)
            .leftJoin(
              standardVersions,
              eq(standardVersions.id, ingestionJobs.standardVersionId),
            )
            .orderBy(desc(ingestionJobs.startedAt), desc(ingestionJobs.createdAt))
            .limit(limit);

          return { running: runningProcess(), jobs: rows };
        },
        {
          query: t.Object({ limit: t.Optional(t.String()) }),
          detail: { summary: "Recent ingestion jobs" },
        },
      )

      .get(
        "/jobs/:id",
        async ({ params }) => {
          const [job] = await db
            .select({
              id: ingestionJobs.id,
              runId: ingestionJobs.runId,
              stage: ingestionJobs.stage,
              status: ingestionJobs.status,
              stats: ingestionJobs.stats,
              error: ingestionJobs.error,
              errorStack: ingestionJobs.errorStack,
              durationMs: ingestionJobs.durationMs,
              startedAt: ingestionJobs.startedAt,
              finishedAt: ingestionJobs.finishedAt,
              versionCode: standardVersions.code,
            })
            .from(ingestionJobs)
            .leftJoin(
              standardVersions,
              eq(standardVersions.id, ingestionJobs.standardVersionId),
            )
            .where(eq(ingestionJobs.id, params.id));

          if (!job) return httpError(404, `Unknown job "${params.id}"`);

          const events = await db
            .select({
              id: ingestionEvents.id,
              level: ingestionEvents.level,
              message: ingestionEvents.message,
              payload: ingestionEvents.payload,
              createdAt: ingestionEvents.createdAt,
            })
            .from(ingestionEvents)
            .where(eq(ingestionEvents.jobId, job.id))
            .orderBy(asc(ingestionEvents.createdAt));

          return { job, events, running: runningProcess() };
        },
        {
          params: t.Object({ id: t.String() }),
          detail: { summary: "One ingestion job and its event log" },
        },
      )

      .post(
        "/ingest",
        ({ body }) => {
          try {
            const started = startPipeline({
              step: body.step,
              version: body.version,
              force: body.force,
            });
            return { ok: true, ...started };
          } catch (error) {
            return httpError(409, (error as Error).message);
          }
        },
        {
          body: t.Object({
            step: stepSchema,
            version: t.Optional(t.String()),
            force: t.Optional(t.Boolean()),
          }),
          detail: { summary: "Start an ingestion stage in a child process" },
        },
      )

      .post(
        "/index",
        ({ body }) => {
          try {
            const started = startIndex({ force: body.force });
            return { ok: true, ...started };
          } catch (error) {
            return httpError(409, (error as Error).message);
          }
        },
        {
          body: t.Object({ force: t.Optional(t.Boolean()) }),
          detail: { summary: "Start embedding in a child process" },
        },
      )

      .post(
        "/watch",
        async () => checkForDrift(db),
        { detail: { summary: "HEAD known sources and scrape for undeclared documents" } },
      )

      .get(
        "/diff",
        async () =>
          linkEditions(db, silentJob(), {
            smartVersionCode: "ifa-v6-smart-fv",
            gfsVersionCode: "ifa-v6-gfs-fv",
            write: false,
          }),
        { detail: { summary: "Smart vs GFS correspondence, without writing" } },
      )

      .get(
        "/relationships",
        async () => {
          const rows = await db
            .select({
              type: requirementRelationships.relationshipType,
              origin: requirementRelationships.origin,
              confidence: requirementRelationships.confidence,
              from: smartReq.sourceRequirementId,
              fromLevel: smartReq.level,
              to: gfsReq.sourceRequirementId,
              toLevel: gfsReq.level,
            })
            .from(requirementRelationships)
            .innerJoin(smartReq, eq(smartReq.id, requirementRelationships.fromRequirementVersionId))
            .innerJoin(gfsReq, eq(gfsReq.id, requirementRelationships.toRequirementVersionId))
            .orderBy(asc(smartReq.sortKey));

          return {
            relationships: rows.map((row) => ({
              ...row,
              fromLevel: REQUIREMENT_LEVEL_LABELS[row.fromLevel],
              toLevel: REQUIREMENT_LEVEL_LABELS[row.toLevel],
            })),
          };
        },
        { detail: { summary: "Stored Smart ↔ GFS relationships" } },
      )

      .get(
        "/audit",
        async ({ query }) => {
          const limit = Math.min(Number(query.limit ?? 40), 100);
          const rows = await db
            .select()
            .from(auditLogs)
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);
          return { audit: rows };
        },
        {
          query: t.Object({ limit: t.Optional(t.String()) }),
          detail: { summary: "Recent audit log entries" },
        },
      )

      .get(
        "/storage",
        async () => storageUsage(),
        { detail: { summary: "Preserved source bytes on disk" } },
      )

      .get(
        "/running",
        () => ({ running: runningProcess() }),
        { detail: { summary: "Whether a spawned pipeline is still alive" } },
      )
  );
}

