/**
 * The evaluation harness.
 *
 * Two suites, deliberately separable.
 *
 * **Retrieval** scores the search pipeline alone: recall@5, MRR, recall@10. It
 * needs no chat model and, with the deterministic hash embedder, no API key at
 * all, so it runs in CI on every commit. This is the suite that catches a
 * regression in chunking, fusion or the tsquery builder - the changes most
 * likely to quietly degrade the system, because the answers still read fine.
 *
 * **Answer** scores the agent end to end: does the answer contain what it must,
 * avoid what it must not, refuse when there is nothing to say, and cite only
 * criteria that were actually retrieved. It costs money and needs a key, so it
 * runs on demand.
 *
 * Both write to `eval_results` under a shared run id, so two runs can be
 * compared with a query instead of by squinting at two terminals.
 */

import { randomUUID } from "node:crypto";
import { evalResults, type Database } from "@complifine/db";
import { style } from "@complifine/core";
import type { Embedder } from "../embed/provider.ts";
import { search, type SearchHit, type SearchOptions } from "../search/hybrid.ts";
import { ask } from "../agent/agent.ts";
import { EVAL_CASES, retrievalCases, type EvalCase } from "./cases.ts";

export interface EvalOptions {
  readonly db: Database;
  readonly embedder: Embedder | null;
  /** Score only this category. */
  readonly category?: string;
  /** Persist scores to `eval_results`. */
  readonly persist?: boolean;
  readonly onProgress?: (line: string) => void;
  readonly model?: string;
}

export interface CaseScore {
  readonly caseId: string;
  readonly category: string;
  readonly question: string;
  readonly passed: boolean;
  readonly metrics: Record<string, number>;
  readonly notes: string;
  readonly durationMs: number;
  readonly actual: unknown;
}

export interface SuiteReport {
  readonly runId: string;
  readonly suite: string;
  readonly cases: readonly CaseScore[];
  readonly summary: Record<string, number>;
  readonly byCategory: Record<string, { passed: number; total: number }>;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Did this hit satisfy one of the case's expectations?
 *
 * Criterion expectations match the hit's resolved criterion number exactly -
 * near-misses are not partial credit, they are the wrong requirement. Heading
 * expectations match a case-insensitive substring of the chunk's breadcrumb,
 * because General Regulations clauses are identified by title rather than by a
 * number a user would type.
 */
function hitMatches(hit: SearchHit, testCase: EvalCase): string | null {
  for (const expected of testCase.expectedCriteria ?? []) {
    if (hit.requirementId === expected) return expected;
  }
  for (const expected of testCase.expectedHeadings ?? []) {
    const haystack = `${hit.heading ?? ""} ${hit.sectionTitle ?? ""}`.toLowerCase();
    if (haystack.includes(expected.toLowerCase())) return expected;
  }
  return null;
}

function expectationCount(testCase: EvalCase): number {
  return (testCase.expectedCriteria?.length ?? 0) + (testCase.expectedHeadings?.length ?? 0);
}

function filtersForCase(testCase: EvalCase): SearchOptions {
  if (testCase.category === "regulations") {
    return { versionCode: testCase.versionCode, chunkTypes: ["section"] };
  }
  if (
    testCase.category === "paraphrase" ||
    testCase.category === "level" ||
    testCase.category === "identifier" ||
    testCase.category === "cross_edition"
  ) {
    return { versionCode: testCase.versionCode, chunkTypes: ["requirement"] };
  }
  return { versionCode: testCase.versionCode };
}

// ---------------------------------------------------------------------------
// Retrieval suite
// ---------------------------------------------------------------------------

/**
 * Score retrieval for one case.
 *
 * recall@5 is the headline metric because five is roughly what fits in a
 * prompt alongside room to reason. MRR is reported alongside it because recall
 * alone cannot distinguish "the right criterion was first" from "the right
 * criterion was fifth", and the difference shows up in answer quality even when
 * both count as a hit.
 *
 * Filters match the tool the agent would actually call: farm-practice
 * questions search requirement chunks, certification-process questions search
 * General Regulations prose. Scoring unfiltered hybrid search would measure a
 * mode the product never uses, and GR chapters would crowd criteria out of
 * the top five for reasons that never reach a user.
 */
async function scoreRetrieval(
  db: Database,
  embedder: Embedder | null,
  testCase: EvalCase,
): Promise<CaseScore> {
  const started = performance.now();

  const result = await search(db, embedder, testCase.question, {
    ...filtersForCase(testCase),
    limit: 10,
    log: false,
  });

  const expected = expectationCount(testCase);
  const foundAt = new Map<string, number>();

  result.hits.forEach((hit, index) => {
    const match = hitMatches(hit, testCase);
    if (match !== null && !foundAt.has(match)) foundAt.set(match, index + 1);
  });

  const ranks = [...foundAt.values()];
  const recallAt5 = expected === 0 ? 0 : ranks.filter((rank) => rank <= 5).length / expected;
  const recallAt10 = expected === 0 ? 0 : ranks.length / expected;
  const mrr = ranks.length === 0 ? 0 : 1 / Math.min(...ranks);

  // Passing means every expected item was in the top five. A partial hit is
  // recorded in the metrics but is not a pass: if a case expects three
  // criteria, an answer built from two of them is missing a requirement.
  const passed = expected > 0 && recallAt5 === 1;

  const missing = [...(testCase.expectedCriteria ?? []), ...(testCase.expectedHeadings ?? [])].filter(
    (item) => !foundAt.has(item),
  );

  return {
    caseId: testCase.id,
    category: testCase.category,
    question: testCase.question,
    passed,
    metrics: {
      "recall@5": recallAt5,
      "recall@10": recallAt10,
      mrr,
      hits: result.hits.length,
    },
    notes: missing.length > 0 ? `not retrieved: ${missing.join(", ")}` : `strategy: ${result.strategy}`,
    durationMs: Math.round(performance.now() - started),
    actual: {
      strategy: result.strategy,
      top: result.hits.slice(0, 5).map((hit) => ({
        criterion: hit.requirementId,
        heading: hit.heading,
        score: Number(hit.score.toFixed(5)),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Answer suite
// ---------------------------------------------------------------------------

/**
 * Phrases that count as declining to answer.
 *
 * Kept as a list of surface forms rather than an LLM judge on purpose: a judge
 * is another model that can be wrong, and "did it refuse" is one of the few
 * things about an answer that is genuinely checkable by string matching. The
 * cases are written so that a correct refusal is hard to phrase without one of
 * these.
 */
const REFUSAL_MARKERS = [
  "does not exist",
  "no criterion",
  "not in the knowledge base",
  "not part of the knowledge base",
  "could not find",
  "couldn't find",
  "no results",
  "not covered",
  "outside the scope",
  "out of scope",
  "i don't have",
  "i do not have",
  "cannot answer",
  "can't answer",
  "unable to",
  "not something i can",
  "certification body",
  "no such",
  "not available in",
  "only covers",
];

function looksLikeRefusal(answer: string): boolean {
  const lower = answer.toLowerCase();
  return REFUSAL_MARKERS.some((marker) => lower.includes(marker));
}

async function scoreAnswer(
  options: EvalOptions,
  testCase: EvalCase,
): Promise<CaseScore> {
  const started = performance.now();

  let answer = "";
  let citationAccuracy = 1;
  let ungrounded = 0;
  let toolCallCount = 0;
  let failure: string | null = null;

  try {
    const result = await ask(testCase.question, {
      db: options.db,
      embedder: options.embedder,
      model: options.model,
      persist: false,
    });

    answer = result.answer;
    ungrounded = result.ungroundedCitations.length;
    toolCallCount = result.toolCalls.length;

    const criterionCitations = result.citations.filter(
      (citation) => citation.kind === "criterion",
    ).length;
    citationAccuracy =
      criterionCitations === 0 ? 1 : (criterionCitations - ungrounded) / criterionCitations;
  } catch (error) {
    failure = (error as Error).message;
  }

  const lower = answer.toLowerCase();
  const missingPhrases = (testCase.expectedPhrases ?? []).filter(
    (phrase) => !lower.includes(phrase.toLowerCase()),
  );
  const presentForbidden = (testCase.forbiddenPhrases ?? []).filter((phrase) =>
    lower.includes(phrase.toLowerCase()),
  );

  const refused = looksLikeRefusal(answer);
  const refusalCorrect = testCase.expectRefusal ? refused : true;

  const passed =
    failure === null &&
    answer.length > 0 &&
    missingPhrases.length === 0 &&
    presentForbidden.length === 0 &&
    refusalCorrect &&
    ungrounded === 0;

  const notes = [
    failure ? `error: ${failure}` : null,
    missingPhrases.length > 0 ? `missing: ${missingPhrases.join(", ")}` : null,
    presentForbidden.length > 0 ? `forbidden: ${presentForbidden.join(", ")}` : null,
    testCase.expectRefusal && !refused ? "did not refuse" : null,
    ungrounded > 0 ? `${ungrounded} ungrounded citation(s)` : null,
  ]
    .filter((note): note is string => note !== null)
    .join("; ");

  return {
    caseId: testCase.id,
    category: testCase.category,
    question: testCase.question,
    passed,
    metrics: {
      citationAccuracy,
      ungroundedCitations: ungrounded,
      toolCalls: toolCallCount,
      answerChars: answer.length,
    },
    notes: notes || "ok",
    durationMs: Math.round(performance.now() - started),
    actual: { answer, refused },
  };
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

function summarise(cases: readonly CaseScore[]): {
  summary: Record<string, number>;
  byCategory: Record<string, { passed: number; total: number }>;
} {
  const byCategory: Record<string, { passed: number; total: number }> = {};
  for (const score of cases) {
    const bucket = (byCategory[score.category] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (score.passed) bucket.passed += 1;
  }

  const mean = (key: string) => {
    const values = cases
      .map((score) => score.metrics[key])
      .filter((value): value is number => value !== undefined);
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  };

  const summary: Record<string, number> = {
    cases: cases.length,
    passed: cases.filter((score) => score.passed).length,
    passRate: cases.length === 0 ? 0 : cases.filter((score) => score.passed).length / cases.length,
  };

  for (const key of ["recall@5", "recall@10", "mrr", "citationAccuracy"]) {
    if (cases.some((score) => score.metrics[key] !== undefined)) summary[key] = mean(key);
  }

  return { summary, byCategory };
}

async function persistScores(
  db: Database,
  runId: string,
  suite: string,
  cases: readonly CaseScore[],
): Promise<void> {
  const byId = new Map(EVAL_CASES.map((testCase) => [testCase.id, testCase]));

  await db.insert(evalResults).values(
    cases.map((score) => ({
      runId,
      suite,
      caseId: score.caseId,
      category: score.category,
      question: score.question,
      expected: {
        criteria: byId.get(score.caseId)?.expectedCriteria ?? null,
        headings: byId.get(score.caseId)?.expectedHeadings ?? null,
        phrases: byId.get(score.caseId)?.expectedPhrases ?? null,
        refusal: byId.get(score.caseId)?.expectRefusal ?? false,
      },
      actual: score.actual,
      passed: score.passed,
      metrics: score.metrics,
      notes: score.notes,
      durationMs: score.durationMs,
    })),
  );
}

export async function runRetrievalEval(options: EvalOptions): Promise<SuiteReport> {
  const runId = randomUUID();
  const selected = retrievalCases().filter(
    (testCase) => !options.category || testCase.category === options.category,
  );

  const cases: CaseScore[] = [];
  for (const testCase of selected) {
    const score = await scoreRetrieval(options.db, options.embedder, testCase);
    cases.push(score);
    options.onProgress?.(formatCase(score));
  }

  if (options.persist !== false && cases.length > 0) {
    await persistScores(options.db, runId, "retrieval", cases);
  }

  return { runId, suite: "retrieval", cases, ...summarise(cases) };
}

export async function runAnswerEval(options: EvalOptions): Promise<SuiteReport> {
  const runId = randomUUID();
  const selected = EVAL_CASES.filter(
    (testCase) => !options.category || testCase.category === options.category,
  );

  const cases: CaseScore[] = [];
  for (const testCase of selected) {
    const score = await scoreAnswer(options, testCase);
    cases.push(score);
    options.onProgress?.(formatCase(score));
  }

  if (options.persist !== false && cases.length > 0) {
    await persistScores(options.db, runId, "answer", cases);
  }

  return { runId, suite: "answer", cases, ...summarise(cases) };
}

// ---------------------------------------------------------------------------

function formatCase(score: CaseScore): string {
  const mark = score.passed ? style.green("pass") : style.red("FAIL");
  const metrics = Object.entries(score.metrics)
    .filter(([key]) => key === "recall@5" || key === "mrr" || key === "citationAccuracy")
    .map(([key, value]) => `${key}=${value.toFixed(2)}`)
    .join(" ");

  return `  ${mark}  ${score.caseId.padEnd(30)} ${metrics.padEnd(28)} ${style.gray(score.notes)}`;
}

export function formatReport(report: SuiteReport): string {
  const lines: string[] = [];
  const { summary, byCategory } = report;

  lines.push("");
  lines.push(style.bold(`${report.suite} suite`));
  lines.push(
    `  ${summary.passed}/${summary.cases} passed (${((summary.passRate ?? 0) * 100).toFixed(1)}%)`,
  );

  for (const key of ["recall@5", "recall@10", "mrr", "citationAccuracy"]) {
    if (summary[key] !== undefined) {
      lines.push(`  ${key.padEnd(16)} ${summary[key]!.toFixed(3)}`);
    }
  }

  lines.push("");
  for (const [category, bucket] of Object.entries(byCategory).sort()) {
    const ratio = bucket.passed / bucket.total;
    const render = ratio === 1 ? style.green : ratio >= 0.5 ? style.yellow : style.red;
    lines.push(`  ${category.padEnd(16)} ${render(`${bucket.passed}/${bucket.total}`)}`);
  }

  const failures = report.cases.filter((score) => !score.passed);
  if (failures.length > 0) {
    lines.push("");
    lines.push(style.bold("failures"));
    for (const failure of failures) {
      lines.push(`  ${style.red(failure.caseId)}  ${failure.notes}`);
      lines.push(`    ${style.gray(failure.question)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
