/**
 * Judge every applicable requirement for one audit run.
 *
 * Writes audit_runs and audit_run_items only. Assessments, findings and
 * evidence change when a person accepts a verdict or opens a finding.
 */

import { and, eq, type Database } from "@complifine/db";
import {
  auditRunItems,
  auditRuns,
  notifications,
  notificationPreferences,
  sites,
  standardVersions,
} from "@complifine/db";
import { auditConcurrency, type AuditVerdict } from "@complifine/core";
import { applicableIds } from "../applicable.ts";
import { evidenceGap } from "../evidence-gap.ts";
import { auditReadiness } from "../readiness.ts";
import { buildDossier } from "./dossier.ts";
import { judgeRequirement, type AuditGenerator, type RankedItem } from "./judge.ts";
import { openaiAuditGenerator } from "./openai.ts";
import { recommendationsFrom } from "./summary.ts";

export interface RunAuditOptions {
  readonly generator?: AuditGenerator;
  readonly concurrency?: number;
  readonly readFile?: (storageKey: string) => Promise<Uint8Array>;
  readonly model?: string;
}

export async function runAudit(db: Database, auditRunId: string, options: RunAuditOptions = {}): Promise<void> {
  const started = performance.now();
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, auditRunId));
  if (!run || run.status === "complete" || run.status === "failed") return;

  const [site] = await db.select().from(sites).where(eq(sites.id, run.siteId));
  const [version] = await db.select().from(standardVersions).where(eq(standardVersions.id, run.standardVersionId));
  if (!site || !version) {
    await fail(db, run.id, "Site or edition no longer exists", started);
    return;
  }

  let promptTokens = 0;
  let completionTokens = 0;
  try {
    const ids = await applicableIds(db, site.id, version.id);
    const gap = await evidenceGap(db, { siteId: site.id, siteType: site.siteType, versionId: version.id });
    const snapshot = await auditReadiness(db, {
      organizationId: run.organizationId,
      siteId: site.id,
      siteType: site.siteType,
      versionId: version.id,
    });
    await db
      .update(auditRuns)
      .set({
        status: "running",
        model: options.model ?? run.model,
        progress: { done: 0, total: ids.length },
        readinessSnapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
        startedAt: run.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(auditRuns.id, run.id));

    const generator = options.generator ?? openaiAuditGenerator();
    const judged: RankedItem[] = [];
    let done = 0;
    let firstError: string | null = null;

    await mapPool(ids, options.concurrency ?? auditConcurrency(), async (requirementVersionId) => {
      if (firstError) return;
      try {
        const dossier = await buildDossier(db, {
          siteId: site.id,
          siteType: site.siteType,
          versionId: version.id,
          requirementVersionId,
          gapRows: gap.rows,
          readFile: options.readFile,
        });
        const item = await judgeRequirement(dossier, generator);
        promptTokens += item.promptTokens ?? 0;
        completionTokens += item.completionTokens ?? 0;
        await db.insert(auditRunItems).values({
          auditRunId: run.id,
          requirementVersionId,
          verdict: item.verdict,
          rationale: item.rationale,
          recommendation: item.recommendation,
          suggestedSeverity: item.suggestedSeverity,
          citedEvidence: item.citedEvidence,
          ungrounded: item.ungrounded,
          confidence: item.confidence,
        });
        judged.push({
          requirementVersionId,
          criterion: dossier.requirement.criterion,
          level: dossier.requirement.level,
          verdict: item.verdict,
          rationale: item.rationale,
          recommendation: item.recommendation,
        });
      } catch (error) {
        firstError ??= error instanceof Error ? error.message : String(error);
      } finally {
        done += 1;
        await db
          .update(auditRuns)
          .set({ progress: { done, total: ids.length }, updatedAt: new Date() })
          .where(eq(auditRuns.id, run.id));
      }
    });

    if (firstError) {
      await fail(db, run.id, firstError, started, promptTokens, completionTokens);
      return;
    }

    const summary = await generator.summarize({ edition: version.name, items: judged });
    promptTokens += summary.promptTokens ?? 0;
    completionTokens += summary.completionTokens ?? 0;
    const recommendations = summary.recommendations.length > 0 ? summary.recommendations : recommendationsFrom(judged);
    const counts = countVerdicts(judged);
    await db
      .update(auditRuns)
      .set({
        status: "complete",
        summary: summary.summary,
        recommendations,
        counts,
        promptTokens,
        completionTokens,
        durationMs: Math.round(performance.now() - started),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(auditRuns.id, run.id));
    if (run.requestedBy) {
      await notifyFinished(db, {
        userId: run.requestedBy,
        organizationId: run.organizationId,
        siteId: site.id,
        siteName: site.name,
        runId: run.id,
        summary: summary.summary,
      });
    }
  } catch (error) {
    await fail(db, run.id, error instanceof Error ? error.message : String(error), started, promptTokens, completionTokens);
  }
}

async function fail(
  db: Database,
  id: string,
  message: string,
  started: number,
  promptTokens = 0,
  completionTokens = 0,
): Promise<void> {
  await db
    .update(auditRuns)
    .set({
      status: "failed",
      error: message,
      promptTokens,
      completionTokens,
      durationMs: Math.round(performance.now() - started),
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(auditRuns.id, id));
}

function countVerdicts(items: readonly RankedItem[]): Partial<Record<AuditVerdict, number>> {
  const counts: Partial<Record<AuditVerdict, number>> = {};
  for (const item of items) counts[item.verdict] = (counts[item.verdict] ?? 0) + 1;
  return counts;
}

async function notifyFinished(
  db: Database,
  input: {
    userId: string;
    organizationId: string;
    siteId: string;
    siteName: string;
    runId: string;
    summary: string;
  },
): Promise<void> {
  const [preference] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, input.userId),
        eq(notificationPreferences.organizationId, input.organizationId),
        eq(notificationPreferences.eventType, "audit_complete"),
        eq(notificationPreferences.channel, "in_app"),
      ),
    );
  if (preference && (!preference.enabled || preference.digest === "off")) return;
  await db
    .insert(notifications)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      siteId: input.siteId,
      eventType: "audit_complete",
      channel: "in_app",
      title: `${input.siteName}: audit finished`,
      body: input.summary.slice(0, 280),
      href: "/app/readiness",
      subjectKey: input.runId,
      dedupeKey: `audit_complete:${input.runId}`,
    })
    .onConflictDoNothing();
}

async function mapPool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]!);
      }
    }),
  );
}
