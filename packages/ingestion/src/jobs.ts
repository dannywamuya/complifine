/**
 * Job tracking for the ingestion pipeline.
 *
 * Every stage runs inside a job so that progress, timing, counters and errors
 * land in the database rather than only on a terminal that has since scrolled
 * away. The wrapper below also guarantees the job is closed out on both the
 * success and the failure path, which is the part that gets forgotten when
 * this is written by hand at each call site.
 */

import { randomUUID } from "node:crypto";
import { eq, type Database } from "@complifine/db";
import { ingestionEvents, ingestionJobs } from "@complifine/db";
import type { JobStage, JobStatus, LogLevel } from "@complifine/core";

export interface JobContext {
  readonly jobId: string;
  readonly runId: string;
  log(level: LogLevel, message: string, payload?: Record<string, unknown>): Promise<void>;
  debug(message: string, payload?: Record<string, unknown>): Promise<void>;
  info(message: string, payload?: Record<string, unknown>): Promise<void>;
  warn(message: string, payload?: Record<string, unknown>): Promise<void>;
  error(message: string, payload?: Record<string, unknown>): Promise<void>;
  /** Merge counters into the job's `stats`. Called freely; flushed at the end. */
  count(stats: Record<string, unknown>): void;
}

export interface RunOptions {
  readonly db: Database;
  readonly runId: string;
  readonly stage: JobStage;
  readonly standardVersionId?: string | null;
  readonly documentId?: string | null;
  /** Mirror events to stderr as they happen. Enabled by the CLI. */
  readonly echo?: boolean;
}

export function newRunId(): string {
  return randomUUID();
}

/**
 * Run `work` inside a tracked job.
 *
 * Errors are recorded and re-thrown: the pipeline decides whether a stage
 * failure is fatal, but the record of it is never optional.
 */
export async function runJob<T>(
  options: RunOptions,
  work: (ctx: JobContext) => Promise<T>,
): Promise<T> {
  const { db, runId, stage } = options;
  const startedAt = new Date();

  const [job] = await db
    .insert(ingestionJobs)
    .values({
      runId,
      stage,
      status: "processing",
      standardVersionId: options.standardVersionId ?? null,
      documentId: options.documentId ?? null,
      startedAt,
    })
    .returning({ id: ingestionJobs.id });

  const jobId = job!.id;
  const stats: Record<string, unknown> = {};

  const log = async (
    level: LogLevel,
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<void> => {
    if (options.echo) {
      const suffix = payload ? ` ${JSON.stringify(payload)}` : "";
      const line = `  [${stage}] ${message}${suffix}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else if (level !== "debug") console.log(line);
    }
    await db.insert(ingestionEvents).values({ jobId, level, message, payload: payload ?? null });
  };

  const ctx: JobContext = {
    jobId,
    runId,
    log,
    debug: (m, p) => log("debug", m, p),
    info: (m, p) => log("info", m, p),
    warn: (m, p) => log("warn", m, p),
    error: (m, p) => log("error", m, p),
    count: (next) => Object.assign(stats, next),
  };

  const finish = async (status: JobStatus, error?: unknown): Promise<void> => {
    const finishedAt = new Date();
    await db
      .update(ingestionJobs)
      .set({
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stats,
        error: error ? String((error as Error).message ?? error) : null,
        errorStack: error instanceof Error ? (error.stack ?? null) : null,
        updatedAt: finishedAt,
      })
      .where(eq(ingestionJobs.id, jobId));
  };

  try {
    const result = await work(ctx);
    await finish("succeeded");
    return result;
  } catch (error) {
    await log("error", (error as Error).message ?? String(error));
    await finish("failed", error);
    throw error;
  }
}
