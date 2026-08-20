#!/usr/bin/env bun
/**
 * `bun run ai <command>` - the retrieval and agent operator's interface.
 *
 * Deliberately usable without an API key. `index`, `search` and `eval` all run
 * against the deterministic hash embedder when no key is configured, and say so
 * rather than pretending. The point is that the plumbing - chunking, the SQL,
 * fusion, filters, the eval harness itself - can be exercised and regression
 * tested by anyone who can start Postgres, and only generation needs an
 * account.
 */

import {
  CHECK,
  CROSS,
  WARN,
  REQUIREMENT_LEVEL_LABELS,
  flagBool,
  flagList,
  flagNumber,
  flagString,
  formatDuration,
  hasAiCredentials,
  heading,
  parseArgs,
  style,
  table,
  wrapText,
  type Args,
} from "@complifine/core";
import { createDatabase, sql, type Database } from "@complifine/db";
import { chunkEmbeddings, documentChunks } from "@complifine/db";
import { type Embedder } from "./embed/provider.ts";
import { indexCorpus, unembeddedChunkCount } from "./embed/index-corpus.ts";
import { createEmbedder, embedderForQuery } from "./embed/select.ts";
import { search } from "./search/hybrid.ts";
import { ask } from "./agent/agent.ts";
import { resolveChecklist } from "./agent/tools.ts";
import { formatReport, runAnswerEval, runRetrievalEval } from "./eval/run.ts";
import { EVAL_CASES } from "./eval/cases.ts";

const HELP = `
${style.bold("CompliFine retrieval and agent")}

${style.bold("Index")}
  index [--version code]   Chunk the knowledge base and embed the chunks
      --force              Re-embed everything, ignoring content hashes
      --local              Use the deterministic embedder even if a key is set
  status                   Chunk and embedding coverage

${style.bold("Query")}
  search <query>           Hybrid search, showing how each hit was found
      --version code       Restrict to one edition
      --limit n            Results to show (default 10)
      --normative          Exclude guidance, which is not binding
      --json
  ask <question>           Ask the agent, with its tool calls shown
      --version code
      --quiet              Answer only, no tool trace
      --json

${style.bold("Evaluate")}
  eval [retrieval|answer|all]   Run the graded suite (default: retrieval)
      --category name           One category only
      --no-persist              Do not write to eval_results

${style.bold("Utilities")}
  scope --version code --no 47,53   Resolve the checklist for a producer
  cases                             List the eval cases

${style.dim("Without OPENAI_API_KEY, search and eval use a deterministic local embedder.")}
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help" || flagBool(args, "help")) {
    console.log(HELP);
    return 0;
  }

  if (args.command === "cases") {
    commandCases();
    return 0;
  }

  const db = createDatabase();
  const started = performance.now();

  try {
    switch (args.command) {
      case "index":
        await commandIndex(db, args);
        break;
      case "status":
        await commandStatus(db);
        break;
      case "search":
        await commandSearch(db, args);
        break;
      case "ask":
        await commandAsk(db, args);
        break;
      case "eval":
        return await commandEval(db, args);
      case "scope":
        await commandScope(db, args);
        break;
      default:
        console.error(`Unknown command: ${args.command}`);
        console.log(HELP);
        return 1;
    }

    console.log(style.dim(`\nDone in ${formatDuration(performance.now() - started)}`));
    return 0;
  } catch (error) {
    console.error(`\n${CROSS} ${(error as Error).message}`);
    if (process.env.DEBUG) console.error((error as Error).stack);
    return 1;
  } finally {
    await db.$close();
  }
}

// ---------------------------------------------------------------------------
// Embedder selection
// ---------------------------------------------------------------------------

/**
 * The real embedder when credentials exist, the deterministic one otherwise,
 * and the deterministic one on demand via `--local`.
 *
 * The fallback is announced every time. A retrieval score produced by the hash
 * embedder is not comparable to one produced by a real model, and a run that
 * quietly downgraded itself would make the eval numbers a lie.
 */
function selectEmbedder(args: Args, quiet = false): Embedder {
  const forceLocal = flagBool(args, "local");
  const embedder = createEmbedder({ local: forceLocal });

  if (!embedder.semantic && !quiet) {
    const reason = forceLocal ? "--local requested" : "no OPENAI_API_KEY";
    console.log(
      `${WARN} ${style.yellow(`Using the deterministic local embedder (${reason}).`)}\n` +
        style.dim("   Lexical search is unaffected; semantic matching will be weak.\n"),
    );
  }
  return embedder;
}

async function queryEmbedder(
  db: Database,
  args: Args,
  quiet = false,
): Promise<Embedder | null> {
  const choice = await embedderForQuery(db, { local: flagBool(args, "local") });

  if (quiet) return choice.embedder;

  if (choice.reason === "index_empty") {
    console.log(
      `${WARN} ${style.yellow("The index has no embeddings.")} ` +
        style.dim("Falling back to lexical search. Run `bun run ai index`.\n"),
    );
  } else if (choice.reason === "index_mismatch") {
    console.log(
      `${WARN} ${style.yellow(
        `The index was built with ${choice.indexedModel}, not the configured model.`,
      )}\n` +
        style.dim(
          `   Querying with ${choice.indexedModel} to match. Re-run \`bun run ai index --force\` to rebuild.\n`,
        ),
    );
  } else if (choice.reason === "local_requested" || choice.reason === "no_credentials") {
    console.log(
      `${WARN} ${style.yellow(`Using the deterministic local embedder (${choice.reason.replaceAll("_", " ")}).`)}\n` +
        style.dim("   Lexical search is unaffected; semantic matching will be weak.\n"),
    );
  }

  return choice.embedder;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandIndex(db: Database, args: Args): Promise<void> {
  heading("Building the retrieval index");

  const embedder = selectEmbedder(args);
  const report = await indexCorpus(db, embedder, {
    versionCode: flagString(args, "version"),
    force: flagBool(args, "force"),
    onProgress: (message) => console.log(`  ${style.dim(message)}`),
  });

  console.log();
  table([
    [style.dim("VERSION"), style.dim("REQUIREMENT"), style.dim("PROSE"), style.dim("WRITTEN"), style.dim("REMOVED")],
    ...report.versions.map((version) => [
      version.code,
      String(version.requirementChunks),
      String(version.proseChunks),
      String(version.chunksWritten),
      String(version.chunksDeleted),
    ]),
  ]);

  console.log();
  console.log(`  ${CHECK} ${report.embedded} chunk(s) embedded with ${style.bold(report.model)}`);
  if (report.reused > 0) {
    console.log(`  ${style.dim(`${report.reused} unchanged chunk(s) kept their existing vectors`)}`);
  }
  if (report.tokens) {
    console.log(`  ${style.dim(`${report.tokens.toLocaleString()} tokens billed`)}`);
  }
}

async function commandStatus(db: Database): Promise<void> {
  heading("Retrieval index");

  const rows = await db
    .select({
      chunkType: documentChunks.chunkType,
      chunks: sql<number>`count(*)::int`,
      tokens: sql<number>`sum(${documentChunks.tokenCount})::int`,
      avgTokens: sql<number>`round(avg(${documentChunks.tokenCount}))::int`,
      maxTokens: sql<number>`max(${documentChunks.tokenCount})::int`,
    })
    .from(documentChunks)
    .groupBy(documentChunks.chunkType);

  if (rows.length === 0) {
    console.log(`  ${WARN} No chunks yet. Run ${style.bold("bun run ai index")}.`);
    return;
  }

  table([
    [style.dim("TYPE"), style.dim("CHUNKS"), style.dim("TOKENS"), style.dim("AVG"), style.dim("MAX")],
    ...rows.map((row) => [
      row.chunkType,
      String(row.chunks),
      row.tokens.toLocaleString(),
      String(row.avgTokens),
      String(row.maxTokens),
    ]),
  ]);

  const models = await db
    .select({ model: chunkEmbeddings.model, vectors: sql<number>`count(*)::int` })
    .from(chunkEmbeddings)
    .groupBy(chunkEmbeddings.model);

  console.log();
  if (models.length === 0) {
    console.log(`  ${WARN} No embeddings yet.`);
    return;
  }

  for (const model of models) {
    const missing = await unembeddedChunkCount(db, model.model);
    const icon = missing === 0 ? CHECK : WARN;
    console.log(
      `  ${icon} ${style.bold(model.model)}  ${model.vectors} vector(s)` +
        (missing > 0 ? style.yellow(`, ${missing} chunk(s) unembedded`) : ""),
    );
  }
}

async function commandSearch(db: Database, args: Args): Promise<void> {
  const query = args.positional.join(" ");
  if (!query) throw new Error('Usage: ai search "water testing requirements"');

  const json = flagBool(args, "json");
  const embedder = await queryEmbedder(db, args, json);

  const result = await search(db, embedder, query, {
    versionCode: flagString(args, "version"),
    limit: flagNumber(args, "limit") ?? 10,
    maxAuthorityLevel: flagBool(args, "normative") ? 3 : undefined,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  heading(`"${query}"`);
  console.log(
    style.dim(
      `  ${result.hits.length} result(s) via ${result.strategy} in ${result.durationMs}ms` +
        (result.matchedIdentifier ? ` (matched ${result.matchedIdentifier})` : ""),
    ),
  );
  console.log();

  for (const [index, hit] of result.hits.entries()) {
    const label = hit.requirementId ?? hit.heading ?? "(untitled)";
    const level = hit.requirementLevel
      ? ` ${style.dim("·")} ${style.bold(REQUIREMENT_LEVEL_LABELS[hit.requirementLevel])}`
      : "";

    console.log(`  ${style.dim(`${index + 1}.`)} ${style.cyan(label)}${level}`);

    // How each hit was found, which is the part you need when the ranking
    // looks wrong: a hit found only semantically and only at rank 30 is a
    // different problem from one both retrievers agreed on.
    const provenance = [
      hit.lexicalRank ? `lexical #${hit.lexicalRank}` : null,
      hit.semanticRank ? `semantic #${hit.semanticRank}` : null,
      `score ${hit.score.toFixed(4)}`,
      hit.sourcePage ? `p.${hit.sourcePage}` : null,
      hit.versionCode,
    ]
      .filter((part): part is string => part !== null)
      .join(style.dim(" · "));

    console.log(`     ${style.dim(provenance)}`);
    console.log(wrapText(firstLines(hit.text, 3), 5, 96));
    console.log();
  }
}

function firstLines(text: string, count: number): string {
  return text.split("\n").slice(0, count).join(" ").slice(0, 400);
}

async function commandAsk(db: Database, args: Args): Promise<void> {
  const question = args.positional.join(" ");
  if (!question) throw new Error('Usage: ai ask "how often must I test irrigation water?"');

  const json = flagBool(args, "json");
  const quiet = flagBool(args, "quiet");
  const embedder = await queryEmbedder(db, args, json);

  const result = await ask(question, { db, embedder });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!quiet && result.toolCalls.length > 0) {
    heading("Tool calls");
    for (const call of result.toolCalls) {
      const summary = summariseArgs(call.args);
      console.log(
        `  ${style.dim(`${call.stepIndex + 1}.`)} ${style.cyan(call.name)}` +
          (summary ? ` ${style.dim(summary)}` : "") +
          style.dim(`  ${call.durationMs}ms`),
      );
      if (call.error) console.log(`     ${style.red(call.error)}`);
    }
  }

  heading("Answer");
  console.log(wrapText(result.answer, 2, 96));

  console.log();
  if (result.citations.length > 0) {
    console.log(style.dim(`  ${result.citations.length} citation(s)`));
  }

  if (result.ungroundedCitations.length > 0) {
    console.log(
      `  ${CROSS} ${style.red(
        `${result.ungroundedCitations.length} citation(s) reference criteria that were never retrieved:`,
      )}`,
    );
    for (const citation of result.ungroundedCitations) {
      console.log(`      ${citation.raw}`);
    }
  } else if (result.citations.length > 0) {
    console.log(`  ${CHECK} ${style.green("every citation is grounded in a retrieved source")}`);
  }

  console.log(
    style.dim(
      `  ${result.usage.promptTokens ?? "?"} prompt + ${result.usage.completionTokens ?? "?"} completion tokens` +
        ` in ${formatDuration(result.durationMs)}`,
    ),
  );
}

function summariseArgs(args: unknown): string {
  if (args === null || typeof args !== "object") return "";
  return Object.entries(args as Record<string, unknown>)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ")
    .slice(0, 110);
}

async function commandEval(db: Database, args: Args): Promise<number> {
  const suite = args.positional[0] ?? "retrieval";
  const persist = !flagBool(args, "no-persist");
  const category = flagString(args, "category");
  const embedder = await queryEmbedder(db, args);

  const reports = [];

  if (suite === "retrieval" || suite === "all") {
    heading("Retrieval evaluation");
    reports.push(
      await runRetrievalEval({
        db,
        embedder,
        category,
        persist,
        onProgress: (line) => console.log(line),
      }),
    );
  }

  if (suite === "answer" || suite === "all") {
    if (!hasAiCredentials()) {
      throw new Error(
        "The answer suite needs OPENAI_API_KEY: it evaluates generated answers. " +
          "Run `ai eval retrieval` to score the search pipeline without a key.",
      );
    }
    heading("Answer evaluation");
    reports.push(
      await runAnswerEval({
        db,
        embedder,
        category,
        persist,
        model: flagString(args, "model"),
        onProgress: (line) => console.log(line),
      }),
    );
  }

  if (reports.length === 0) {
    throw new Error(`Unknown suite "${suite}". Use retrieval, answer or all.`);
  }

  for (const report of reports) console.log(formatReport(report));

  // Non-zero when anything failed, so this is usable as a CI gate.
  return reports.every((report) => report.summary.passed === report.summary.cases) ? 0 : 1;
}

async function commandScope(db: Database, args: Args): Promise<void> {
  const versionCode = flagString(args, "version") ?? "ifa-v6-smart-fv";
  const noAnswers = flagList(args, "no").map(Number);

  const { standardVersions, eq } = await import("@complifine/db");
  const [version] = await db
    .select({ id: standardVersions.id, name: standardVersions.name })
    .from(standardVersions)
    .where(eq(standardVersions.code, versionCode));

  if (!version) throw new Error(`Unknown version "${versionCode}".`);

  const resolution = await resolveChecklist(
    db,
    version.id,
    noAnswers.map((questionNumber) => ({ questionNumber, answer: "no" as const })),
  );

  heading(`Applicable checklist: ${version.name}`);
  table([
    ["  Applicable criteria", style.bold(String(resolution.applicable))],
    ["  Excluded", String(resolution.excluded)],
    ...Object.entries(resolution.byLevel).map(([level, count]) => [`    ${level}`, String(count)]),
  ]);

  if (resolution.exclusions.length > 0) {
    console.log(`\n  ${style.bold("Excluded")}`);
    for (const exclusion of resolution.exclusions) {
      console.log(`    ${style.dim(exclusion.criterion)}  ${exclusion.reason}`);
    }
  }

  console.log(`\n${style.dim(wrapText(resolution.note, 2))}`);
}

function commandCases(): void {
  heading(`Evaluation suite: ${EVAL_CASES.length} cases`);

  const categories = new Map<string, number>();
  for (const testCase of EVAL_CASES) {
    categories.set(testCase.category, (categories.get(testCase.category) ?? 0) + 1);
  }

  table([...categories].map(([category, count]) => [`  ${category}`, String(count)]));

  console.log();
  for (const testCase of EVAL_CASES) {
    console.log(`  ${style.cyan(testCase.id.padEnd(30))} ${testCase.question}`);
    const expectations = [
      testCase.expectedCriteria?.length ? `criteria: ${testCase.expectedCriteria.join(", ")}` : null,
      testCase.expectedHeadings?.length ? `headings: ${testCase.expectedHeadings.join(", ")}` : null,
      testCase.expectedPhrases?.length ? `phrases: ${testCase.expectedPhrases.join(", ")}` : null,
      testCase.forbiddenPhrases?.length ? `forbidden: ${testCase.forbiddenPhrases.join(", ")}` : null,
      testCase.expectRefusal ? "must refuse" : null,
    ].filter((part): part is string => part !== null);

    for (const expectation of expectations) {
      console.log(`  ${" ".repeat(30)} ${style.dim(expectation)}`);
    }
  }
}

process.exit(await main());
