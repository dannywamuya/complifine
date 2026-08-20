/**
 * The publication state machine.
 *
 * PRD section 24 and section 55: a knowledge version moves through a fixed
 * sequence of states, and the move to `published` is gated on every blocking
 * quality check passing and on a named human having approved it.
 *
 * The enforcement lives here rather than in the API or the UI so that the CLI,
 * the admin screens and any future automation are all held to the same rule.
 * A state machine that only the UI respects is not a state machine.
 */

import { and, eq, type Database } from "@complifine/db";
import {
  knowledgeReviews,
  qualityGateResults,
  requirementVersions,
  standardVersions,
} from "@complifine/db";
import { canTransition, VERSION_TRANSITIONS, type VersionStatus } from "@complifine/core";
import { runGates, type GateReport } from "../gates.ts";
import { recordAudit } from "../audit.ts";

export class TransitionError extends Error {
  constructor(
    message: string,
    readonly from: VersionStatus,
    readonly to: VersionStatus,
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

export interface TransitionParams {
  readonly versionCode: string;
  readonly to: VersionStatus;
  readonly actor: string;
  readonly notes?: string;
  /**
   * Skip the gate check. Exists only for recovering a version that is stuck
   * because a gate itself is broken; every use is recorded in the audit log
   * with the actor's name attached.
   */
  readonly force?: boolean;
}

export interface TransitionResult {
  readonly from: VersionStatus;
  readonly to: VersionStatus;
  readonly gateReport: GateReport | null;
}

export async function transitionVersion(
  db: Database,
  params: TransitionParams,
): Promise<TransitionResult> {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.code, params.versionCode));

  if (!version) throw new Error(`Unknown standard version: ${params.versionCode}`);

  const from = version.status;
  const to = params.to;

  if (from === to) {
    return { from, to, gateReport: null };
  }

  if (!canTransition(from, to)) {
    const allowed = VERSION_TRANSITIONS[from];
    throw new TransitionError(
      `Cannot move ${params.versionCode} from "${from}" to "${to}". ` +
        (allowed.length
          ? `Allowed next states: ${allowed.join(", ")}.`
          : `"${from}" is a terminal state.`),
      from,
      to,
    );
  }

  // Gates are enforced on the two transitions where the knowledge starts being
  // treated as trustworthy: entering review, and going live.
  let gateReport: GateReport | null = null;
  const gatedTransitions: VersionStatus[] = ["review", "published"];

  if (gatedTransitions.includes(to) && !params.force) {
    gateReport = await runGates(db, version.id);
    if (!gateReport.passed) {
      const failed = gateReport.results
        .filter((r) => !r.passed && r.blocking)
        .map((r) => `  ${r.gate}: expected ${r.expected}, got ${r.actual}`)
        .join("\n");
      throw new TransitionError(
        `Cannot move ${params.versionCode} to "${to}": ${gateReport.blockingFailures} blocking quality gate(s) failed.\n${failed}`,
        from,
        to,
      );
    }
  }

  if (to === "published" && !params.force) {
    const approvals = await db
      .select()
      .from(knowledgeReviews)
      .where(
        and(
          eq(knowledgeReviews.standardVersionId, version.id),
          eq(knowledgeReviews.decision, "approved"),
        ),
      );

    if (approvals.length === 0) {
      throw new TransitionError(
        `Cannot publish ${params.versionCode}: no recorded human approval. ` +
          `Run \`bun run kb review ${params.versionCode} --reviewer "Your Name" --decision approved\` first.`,
        from,
        to,
      );
    }
  }

  const now = new Date();

  await db
    .update(standardVersions)
    .set({
      status: to,
      updatedAt: now,
      ...(to === "published" ? { publishedAt: now, publishedBy: params.actor } : {}),
    })
    .where(eq(standardVersions.id, version.id));

  // Publishing the version publishes its requirements: until now they were
  // `extracted` and therefore not authoritative.
  if (to === "published") {
    await db
      .update(requirementVersions)
      .set({ status: "published", updatedAt: now })
      .where(eq(requirementVersions.standardVersionId, version.id));
  }

  if (to === "retired") {
    await db
      .update(requirementVersions)
      .set({ status: "retired", updatedAt: now })
      .where(eq(requirementVersions.standardVersionId, version.id));
  }

  await recordAudit(db, {
    entityType: "standard_version",
    entityId: version.id,
    action: "status_changed",
    actor: params.actor,
    changes: { status: { from, to } },
    metadata: {
      versionCode: params.versionCode,
      notes: params.notes ?? null,
      forced: params.force ?? false,
      gatesChecked: gateReport ? gateReport.results.length : 0,
    },
  });

  return { from, to, gateReport };
}

export interface ReviewParams {
  readonly versionCode: string;
  readonly reviewer: string;
  readonly decision: "approved" | "rejected" | "changes_requested";
  readonly notes?: string;
  readonly entityType?: string;
  readonly entityId?: string;
}

export async function recordReview(db: Database, params: ReviewParams): Promise<void> {
  const [version] = await db
    .select()
    .from(standardVersions)
    .where(eq(standardVersions.code, params.versionCode));

  if (!version) throw new Error(`Unknown standard version: ${params.versionCode}`);

  await db.insert(knowledgeReviews).values({
    standardVersionId: version.id,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    decision: params.decision,
    reviewer: params.reviewer,
    notes: params.notes ?? null,
  });

  await recordAudit(db, {
    entityType: "standard_version",
    entityId: version.id,
    action: `review_${params.decision}`,
    actor: params.reviewer,
    metadata: { versionCode: params.versionCode, notes: params.notes ?? null },
  });
}

/** Latest recorded gate results for a version, for the API and admin UI. */
export async function latestGateResults(db: Database, standardVersionId: string) {
  return db
    .select()
    .from(qualityGateResults)
    .where(eq(qualityGateResults.standardVersionId, standardVersionId))
    .orderBy(qualityGateResults.gate);
}
