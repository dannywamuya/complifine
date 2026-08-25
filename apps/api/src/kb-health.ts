/**
 * Operator dashboard payload: pipeline health, gates, next actions, briefing.
 *
 * Built from stored rows, not a model. The optional LLM pass is POST /kb/insight.
 */

import { count, desc, eq, type Database } from "@complifine/db";
import {
  chunkEmbeddings,
  ingestionJobs,
  knowledgeReviews,
  qualityGateResults,
  requirementVersions,
  standardDocuments,
  standardVersions,
  standards,
} from "@complifine/db";
import {
  VERSION_STATUS_GUIDANCE,
  VERSION_TRANSITIONS,
  hasAiCredentials,
  type VersionStatus,
} from "@complifine/core";
import { runningProcess } from "./pipeline.ts";

export interface EditionHealth {
  readonly code: string;
  readonly name: string;
  readonly edition: string;
  readonly status: VersionStatus;
  readonly standardCode: string;
  readonly standardName: string;
  readonly criteria: number;
  readonly documents: number;
  readonly fetched: number;
  readonly blockingFailures: number;
  readonly advisoryFailures: number;
  readonly lastReview: {
    readonly decision: string;
    readonly reviewer: string;
    readonly createdAt: string;
  } | null;
  readonly lastJob: {
    readonly id: string;
    readonly stage: string;
    readonly status: string;
    readonly error: string | null;
    readonly startedAt: string | null;
  } | null;
  readonly guidance: { readonly headline: string; readonly detail: string };
  readonly allowedNext: readonly VersionStatus[];
  readonly href: string;
  readonly actionLabel: string;
}

export interface KnowledgeHealth {
  readonly generatedAt: string;
  readonly running: { kind: string; command: string; pid: number; startedAt: string } | null;
  readonly ai: { credentials: boolean; vectors: number };
  readonly summary: {
    readonly editions: number;
    readonly published: number;
    readonly inPipeline: number;
    readonly blocked: number;
    readonly awaitingDecision: number;
    readonly failedJobs: number;
  };
  readonly editions: EditionHealth[];
  readonly nextActions: Array<{
    readonly code: string;
    readonly name: string;
    readonly status: VersionStatus;
    readonly headline: string;
    readonly detail: string;
    readonly href: string;
    readonly actionLabel: string;
  }>;
  readonly blockingGates: Array<{
    readonly versionCode: string;
    readonly gate: string;
    readonly description: string;
    readonly expected: string | null;
    readonly actual: string | null;
  }>;
  readonly failedJobs: Array<{
    readonly id: string;
    readonly stage: string;
    readonly versionCode: string | null;
    readonly error: string | null;
    readonly startedAt: string | null;
  }>;
  readonly briefing: { readonly headline: string; readonly paragraphs: string[] };
}

function actionFor(status: VersionStatus, code: string): { href: string; actionLabel: string } {
  switch (status) {
    case "draft":
      return { href: `/ingest?version=${code}`, actionLabel: "Register and ingest" };
    case "ingesting":
      return { href: `/ingest?version=${code}`, actionLabel: "Continue ingest" };
    case "extracted":
    case "validation":
      return { href: `/gates?version=${code}`, actionLabel: "Check quality gates" };
    case "review":
      return { href: `/review?version=${code}`, actionLabel: "Record a review" };
    case "approved":
      return { href: `/review?version=${code}`, actionLabel: "Publish when ready" };
    case "published":
      return { href: `/registry?edition=${code}`, actionLabel: "Open in catalog" };
    case "retired":
      return { href: `/registry?edition=${code}`, actionLabel: "Inspect retired edition" };
  }
}

function buildBriefing(editions: EditionHealth[], failedJobs: number): KnowledgeHealth["briefing"] {
  const published = editions.filter((row) => row.status === "published");
  const blocked = editions.filter((row) => row.blockingFailures > 0);
  const review = editions.filter((row) => row.status === "review");
  const approved = editions.filter((row) => row.status === "approved");
  const pipeline = editions.filter((row) =>
    ["draft", "ingesting", "extracted", "validation"].includes(row.status),
  );

  let headline = "Knowledge base is in mixed states.";
  if (editions.length === 0) {
    headline = "No editions registered yet.";
  } else if (blocked.length > 0) {
    headline = `${blocked.length} edition${blocked.length === 1 ? "" : "s"} blocked on quality gates.`;
  } else if (review.length > 0) {
    headline = `${review.length} edition${review.length === 1 ? "" : "s"} waiting on a named human decision.`;
  } else if (approved.length > 0) {
    headline = `${approved.length} edition${approved.length === 1 ? "" : "s"} approved and waiting to go live.`;
  } else if (pipeline.length > 0) {
    headline = `${pipeline.length} edition${pipeline.length === 1 ? "" : "s"} still in the ingest pipeline.`;
  } else if (published.length === editions.length && editions.length > 0) {
    headline = "Every ingested edition is published.";
  }

  const paragraphs: string[] = [];
  if (editions.length === 0) {
    paragraphs.push(
      "Run Registry on Ingest to sync the checked-in manifest. New certifications appear as versions after that step, still unpublished until a human reviews and publishes them.",
    );
    return { headline, paragraphs };
  }
  paragraphs.push(
    published.length === 0
      ? "No edition is published. Producers and the agent cannot cite any criteria until an operator records approval and promotes to published."
      : `${published.map((row) => row.code).join(", ")} ${published.length === 1 ? "is" : "are"} live. Web users and the agent only see these.`,
  );

  if (blocked.length > 0) {
    paragraphs.push(
      `Blocking gates fail on ${blocked.map((row) => `${row.code} (${row.blockingFailures})`).join(", ")}. Fix ingest rather than editing the database, then re-run gates.`,
    );
  }

  if (review.length > 0) {
    paragraphs.push(
      `Needs a reviewer: ${review.map((row) => row.code).join(", ")}. Publishing stays blocked until there is an approval on the review record.`,
    );
  }

  if (approved.length > 0) {
    paragraphs.push(
      `Approved, not live: ${approved.map((row) => row.code).join(", ")}. Promote to published when producers should see this. That click is the human decision.`,
    );
  }

  if (pipeline.length > 0) {
    paragraphs.push(
      `Still ingesting: ${pipeline.map((row) => `${row.code} (${row.status})`).join(", ")}. Open Ingest to run Registry through Gates for a new standard, or continue a stopped run.`,
    );
  }

  if (failedJobs > 0) {
    paragraphs.push(
      `${failedJobs} recent ingest job${failedJobs === 1 ? "" : "s"} failed. Open the job log before promoting anything that depends on that stage.`,
    );
  }

  return { headline, paragraphs };
}

export async function knowledgeHealth(db: Database): Promise<KnowledgeHealth> {
  const versionRows = await db
    .select({
      id: standardVersions.id,
      code: standardVersions.code,
      name: standardVersions.name,
      edition: standardVersions.edition,
      status: standardVersions.status,
      standardCode: standards.code,
      standardName: standards.name,
    })
    .from(standardVersions)
    .innerJoin(standards, eq(standards.id, standardVersions.standardId))
    .orderBy(standardVersions.code);

  const [criteriaRows, documents, gates, reviews, jobs, embeddingRows] = await Promise.all([
    db
      .select({
        versionId: requirementVersions.standardVersionId,
        criteria: count(),
      })
      .from(requirementVersions)
      .groupBy(requirementVersions.standardVersionId),
    db
      .select({
        versionId: standardDocuments.standardVersionId,
        status: standardDocuments.status,
      })
      .from(standardDocuments),
    db
      .select({
        versionId: qualityGateResults.standardVersionId,
        gate: qualityGateResults.gate,
        description: qualityGateResults.description,
        blocking: qualityGateResults.blocking,
        passed: qualityGateResults.passed,
        expected: qualityGateResults.expected,
        actual: qualityGateResults.actual,
      })
      .from(qualityGateResults),
    db
      .select({
        versionId: knowledgeReviews.standardVersionId,
        decision: knowledgeReviews.decision,
        reviewer: knowledgeReviews.reviewer,
        createdAt: knowledgeReviews.createdAt,
      })
      .from(knowledgeReviews)
      .orderBy(desc(knowledgeReviews.createdAt)),
    db
      .select({
        id: ingestionJobs.id,
        versionId: ingestionJobs.standardVersionId,
        stage: ingestionJobs.stage,
        status: ingestionJobs.status,
        error: ingestionJobs.error,
        startedAt: ingestionJobs.startedAt,
        versionCode: standardVersions.code,
      })
      .from(ingestionJobs)
      .leftJoin(standardVersions, eq(standardVersions.id, ingestionJobs.standardVersionId))
      .orderBy(desc(ingestionJobs.startedAt), desc(ingestionJobs.createdAt))
      .limit(40),
    db
      .select({ vectors: count() })
      .from(chunkEmbeddings),
  ]);

  const criteriaByVersion = new Map(criteriaRows.map((row) => [row.versionId, Number(row.criteria)]));
  const docsByVersion = new Map<string, { documents: number; fetched: number }>();
  for (const doc of documents) {
    const current = docsByVersion.get(doc.versionId) ?? { documents: 0, fetched: 0 };
    current.documents += 1;
    if (doc.status !== "registered") current.fetched += 1;
    docsByVersion.set(doc.versionId, current);
  }

  const editions: EditionHealth[] = versionRows.map((version) => {
    const status = version.status as VersionStatus;
    const versionGates = gates.filter((row) => row.versionId === version.id);
    const lastReview = reviews.find((row) => row.versionId === version.id) ?? null;
    const lastJob = jobs.find((row) => row.versionId === version.id) ?? null;
    const docs = docsByVersion.get(version.id) ?? { documents: 0, fetched: 0 };
    const action = actionFor(status, version.code);
    return {
      code: version.code,
      name: version.name,
      edition: version.edition,
      status,
      standardCode: version.standardCode,
      standardName: version.standardName,
      criteria: criteriaByVersion.get(version.id) ?? 0,
      documents: docs.documents,
      fetched: docs.fetched,
      blockingFailures: versionGates.filter((row) => row.blocking && !row.passed).length,
      advisoryFailures: versionGates.filter((row) => !row.blocking && !row.passed).length,
      lastReview: lastReview
        ? {
            decision: lastReview.decision,
            reviewer: lastReview.reviewer,
            createdAt: lastReview.createdAt.toISOString(),
          }
        : null,
      lastJob: lastJob
        ? {
            id: lastJob.id,
            stage: lastJob.stage,
            status: lastJob.status,
            error: lastJob.error,
            startedAt: lastJob.startedAt?.toISOString() ?? null,
          }
        : null,
      guidance: VERSION_STATUS_GUIDANCE[status],
      allowedNext: VERSION_TRANSITIONS[status],
      ...action,
    };
  });

  const failedJobs = jobs
    .filter((job) => job.status === "failed")
    .slice(0, 8)
    .map((job) => ({
      id: job.id,
      stage: job.stage,
      versionCode: job.versionCode,
      error: job.error,
      startedAt: job.startedAt?.toISOString() ?? null,
    }));

  const blockingGates = gates
    .filter((row) => row.blocking && !row.passed)
    .map((row) => ({
      versionCode: versionRows.find((version) => version.id === row.versionId)?.code ?? "unknown",
      gate: row.gate,
      description: row.description,
      expected: row.expected,
      actual: row.actual,
    }));

  const nextActions = editions
    .filter((row) => row.status !== "published" && row.status !== "retired")
    .map((row) => ({
      code: row.code,
      name: row.name,
      status: row.status,
      headline: row.guidance.headline,
      detail:
        row.blockingFailures > 0
          ? `${row.guidance.detail} ${row.blockingFailures} blocking gate${row.blockingFailures === 1 ? "" : "s"} failing.`
          : row.guidance.detail,
      href: row.href,
      actionLabel: row.actionLabel,
    }));

  const published = editions.filter((row) => row.status === "published").length;
  const blocked = editions.filter((row) => row.blockingFailures > 0).length;
  const awaitingDecision = editions.filter(
    (row) => row.status === "review" || row.status === "approved",
  ).length;
  const inPipeline = editions.filter((row) =>
    ["draft", "ingesting", "extracted", "validation"].includes(row.status),
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    running: runningProcess(),
    ai: {
      credentials: hasAiCredentials(),
      vectors: Number(embeddingRows[0]?.vectors ?? 0),
    },
    summary: {
      editions: editions.length,
      published,
      inPipeline,
      blocked,
      awaitingDecision,
      failedJobs: failedJobs.length,
    },
    editions,
    nextActions,
    blockingGates,
    failedJobs,
    briefing: buildBriefing(editions, failedJobs.length),
  };
}
