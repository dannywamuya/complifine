/**
 * The agent: a tool-calling loop with a verification pass on the way out.
 *
 * The interesting part is not the loop, which is a handful of lines of AI SDK.
 * It is what happens after the model stops talking.
 *
 * A tool-calling RAG agent can still fabricate, and the way it fabricates is
 * specific: it retrieves five criteria, answers using four of them, and cites a
 * fifth number that it half-remembers and never actually saw. The citation
 * looks exactly like the real ones. No amount of prompting reliably prevents
 * this, because the model is not aware it is doing it.
 *
 * So every citation in the finished answer is checked against the set of
 * criteria the tools actually returned during that run. Citations that are not
 * grounded are reported on the run, not silently dropped: the caller decides
 * whether to show the answer with a warning, retry, or refuse. Making it
 * visible is the point - a fabricated citation that nobody counts is a bug you
 * never find out about.
 */

// `@complifine/core` must be evaluated before `@ai-sdk/openai`. Importing the
// OpenAI SDK eagerly constructs a default client from `process.env`, and it
// rejects an empty `OPENAI_BASE_URL` - which is how a .env template spells
// "unset". Core normalises those blanks away on load, so it has to go first.
import { createLogger, requireAiEnv } from "@complifine/core";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, stepCountIs, type ModelMessage } from "ai";
import { randomUUID } from "node:crypto";
import { agentRuns, agentToolCalls, conversations, eq, type Database } from "@complifine/db";
import type { Embedder } from "../embed/provider.ts";
import { buildTools, type ToolContext } from "./tools.ts";
import {
  extractCitations,
  PUBLISHED_ONLY_ADDENDUM,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_HASH,
  type Citation,
} from "./prompt.ts";

function systemPromptFor(publishedOnly: boolean | undefined): string {
  return publishedOnly ? `${SYSTEM_PROMPT}\n\n${PUBLISHED_ONLY_ADDENDUM}` : SYSTEM_PROMPT;
}

export interface AskOptions {
  readonly db: Database;
  readonly embedder: Embedder | null;
  /** Chat model. Defaults to the `AGENT_MODEL` environment variable. */
  readonly model?: string;
  readonly apiKey?: string;
  /** Groups turns of one conversation; generated when absent. */
  readonly conversationId?: string;
  /** Prior turns, so follow-up questions work. */
  readonly history?: readonly ModelMessage[];
  /**
   * Cap on tool-calling rounds. A scoped question spends its first three steps
   * on context (company, applicability, site) before any research begins, so
   * the budget has to clear that floor by a wide margin. The cap exists to
   * bound cost on a pathological loop, not to shape behaviour: hitting it is
   * handled by {@link wrapUpMessages} rather than by truncating the answer.
   */
  readonly maxSteps?: number;
  readonly temperature?: number;
  /** Persist the run and its tool calls. Off for evals that would flood the table. */
  readonly persist?: boolean;
  readonly userId?: string;
  readonly organizationId?: string;
  readonly siteId?: string;
  /**
   * Restrict tools to published knowledge. Set for producer chat; leave unset
   * so operators can inspect drafts in the console.
   */
  readonly publishedOnly?: boolean;
}

export interface ToolCallRecord {
  readonly stepIndex: number;
  readonly name: string;
  readonly args: unknown;
  readonly result: unknown;
  readonly durationMs: number;
  readonly error?: string;
}

export interface AskResult {
  readonly runId: string;
  readonly conversationId: string;
  readonly question: string;
  readonly answer: string;
  readonly citations: readonly Citation[];
  /**
   * Citations naming a criterion that no tool call returned during this run.
   * Empty is the expected state; anything here is a fabrication to surface.
   */
  readonly ungroundedCitations: readonly Citation[];
  readonly toolCalls: readonly ToolCallRecord[];
  readonly usage: {
    readonly promptTokens: number | undefined;
    readonly completionTokens: number | undefined;
  };
  readonly finishReason: string;
  readonly durationMs: number;
  readonly messages: readonly ModelMessage[];
}

export type AskStreamEvent =
  | { type: "start"; runId: string; conversationId: string }
  | { type: "tool-start"; name: string }
  | {
      type: "tool";
      name: string;
      args: unknown;
      durationMs: number;
      error?: string;
    }
  | { type: "text"; text: string }
  | {
      type: "done";
      runId: string;
      conversationId: string;
      answer: string;
      citations: readonly Citation[];
      ungroundedCitations: readonly Citation[];
      toolCalls: Array<{
        name: string;
        args: unknown;
        durationMs: number;
        error?: string;
      }>;
      usage: {
        promptTokens: number | undefined;
        completionTokens: number | undefined;
      };
      durationMs: number;
      finishReason: string;
    }
  | { type: "error"; message: string };

const DEFAULT_MAX_STEPS = 16;

const log = createLogger("agent");

/**
 * The tool loop stops the moment it reaches its step cap, which can land on a
 * step the model spent calling a tool. The SDK reports that as
 * `finishReason: "tool-calls"` with empty text, and the turn reaches the UI as
 * a blank bubble. Re-asking with the tool results still in context and no tools
 * attached leaves answering as the only available move.
 */
function wrapUpMessages(
  base: readonly ModelMessage[],
  responseMessages: readonly ModelMessage[],
): ModelMessage[] {
  return [
    ...base,
    ...responseMessages,
    {
      role: "user",
      content:
        "You have used your entire tool budget and cannot call any more tools. " +
        "Answer the question now from the tool results above. If they do not " +
        "settle it, say what you did establish and what is still missing.",
    },
  ];
}

function addTokens(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + b;
}

const NO_ANSWER_MESSAGE =
  "The assistant finished without writing an answer. Please ask again.";

/**
 * Reasoning models (GPT-5, o1, o3, …) reject `temperature`. Chat models still
 * get 0: this is lookup-and-summarise over retrieved text, and sampling
 * diversity would make the same compliance question come back differently
 * on two consecutive days.
 */
function samplingFor(model: string, temperature: number | undefined): { temperature?: number } {
  const id = model.toLowerCase();
  if (
    id.startsWith("gpt-5") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4")
  ) {
    return {};
  }
  return { temperature: temperature ?? 0 };
}

/** Ask the agent a question. */
export async function ask(question: string, options: AskOptions): Promise<AskResult> {
  const started = performance.now();
  const runId = randomUUID();
  const conversationId = options.conversationId ?? randomUUID();
  const persist = options.persist ?? true;

  // Validated up front rather than deep inside the HTTP client, so a missing
  // key produces a sentence telling you what to do about it.
  const env = requireAiEnv();
  const modelName = options.model ?? env.AGENT_MODEL;
  const openai = createOpenAI({
    apiKey: options.apiKey ?? env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const toolCalls: ToolCallRecord[] = [];
  // Every criterion number any tool returned, which is the ground truth the
  // answer's citations are checked against.
  const retrievedIdentifiers = new Set<string>();

  const toolContext: ToolContext = {
    db: options.db,
    embedder: options.embedder,
    agentRunId: persist ? runId : undefined,
    organizationId: options.organizationId,
    siteId: options.siteId,
    userId: options.userId,
    publishedOnly: options.publishedOnly,
    onCall: (call) => {
      toolCalls.push({ stepIndex: toolCalls.length, ...call });
      collectIdentifiers(call.result, retrievedIdentifiers);
    },
  };

  if (persist) {
    await ensureConversation(options.db, conversationId, question, options);
    await options.db.insert(agentRuns).values({
      id: runId,
      conversationId,
      userId: options.userId ?? null,
      organizationId: options.organizationId ?? null,
      siteId: options.siteId ?? null,
      model: modelName,
      systemPromptHash: SYSTEM_PROMPT_HASH,
      question,
    });
  }

  const messages: ModelMessage[] = [
    ...historyToMessages(options.history),
    { role: "user", content: question },
  ];

  try {
    const result = await generateText({
      model: openai(modelName),
      system: systemPromptFor(options.publishedOnly),
      messages,
      tools: buildTools(toolContext),
      stopWhen: stepCountIs(options.maxSteps ?? DEFAULT_MAX_STEPS),
      ...samplingFor(modelName, options.temperature),
    });

    let answer = result.text.trim();
    let finishReason = result.finishReason;
    let promptTokens = result.usage?.inputTokens;
    let completionTokens = result.usage?.outputTokens;
    const responseMessages: ModelMessage[] = [...result.response.messages];

    if (!answer) {
      log.warn("tool loop ended without prose; forcing a final answer", {
        runId,
        finishReason,
        steps: toolCalls.length,
      });
      const wrapUp = await generateText({
        model: openai(modelName),
        system: systemPromptFor(options.publishedOnly),
        messages: wrapUpMessages(messages, result.response.messages),
        ...samplingFor(modelName, options.temperature),
      });
      answer = wrapUp.text.trim();
      finishReason = wrapUp.finishReason;
      promptTokens = addTokens(promptTokens, wrapUp.usage?.inputTokens);
      completionTokens = addTokens(completionTokens, wrapUp.usage?.outputTokens);
      if (answer) responseMessages.push({ role: "assistant", content: answer });
    }

    if (!answer) throw new Error(NO_ANSWER_MESSAGE);

    const citations = extractCitations(answer);
    const ungroundedCitations = citations.filter(
      (citation) =>
        citation.kind === "criterion" &&
        citation.criterionId !== null &&
        !retrievedIdentifiers.has(citation.criterionId),
    );

    if (ungroundedCitations.length > 0) {
      log.warn("agent cited criteria it never retrieved", {
        runId,
        citations: ungroundedCitations.map((citation) => citation.criterionId),
      });
    }

    const durationMs = Math.round(performance.now() - started);

    if (persist) {
      await persistRun(options.db, runId, {
        answer,
        citations,
        usage: { inputTokens: promptTokens, outputTokens: completionTokens },
        finishReason,
        durationMs,
        toolCalls,
      });
    }

    return {
      runId,
      conversationId,
      question,
      answer,
      citations,
      ungroundedCitations,
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
      },
      finishReason,
      durationMs,
      messages: [...messages, ...responseMessages],
    };
  } catch (error) {
    const message = (error as Error).message;
    if (persist) {
      await options.db
        .update(agentRuns)
        .set({ error: message, finishedAt: new Date() })
        .where(eq(agentRuns.id, runId))
        .catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Same loop as `ask`, yielded as events so the UI can show tool progress and
 * stream the prose. Persistence and citation grounding happen once the model
 * finishes, identical to the non-streaming path.
 */
export async function* askStream(
  question: string,
  options: AskOptions & { abortSignal?: AbortSignal },
): AsyncGenerator<AskStreamEvent> {
  const started = performance.now();
  const runId = randomUUID();
  const conversationId = options.conversationId ?? randomUUID();
  const persist = options.persist ?? true;

  const env = requireAiEnv();
  const modelName = options.model ?? env.AGENT_MODEL;
  const openai = createOpenAI({
    apiKey: options.apiKey ?? env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const toolCalls: ToolCallRecord[] = [];
  const retrievedIdentifiers = new Set<string>();

  const toolContext: ToolContext = {
    db: options.db,
    embedder: options.embedder,
    agentRunId: persist ? runId : undefined,
    organizationId: options.organizationId,
    siteId: options.siteId,
    userId: options.userId,
    publishedOnly: options.publishedOnly,
    onCall: (call) => {
      toolCalls.push({ stepIndex: toolCalls.length, ...call });
      collectIdentifiers(call.result, retrievedIdentifiers);
    },
  };

  if (persist) {
    await ensureConversation(options.db, conversationId, question, options);
    await options.db.insert(agentRuns).values({
      id: runId,
      conversationId,
      userId: options.userId ?? null,
      organizationId: options.organizationId ?? null,
      siteId: options.siteId ?? null,
      model: modelName,
      systemPromptHash: SYSTEM_PROMPT_HASH,
      question,
    });
  }

  const messages: ModelMessage[] = [
    ...historyToMessages(options.history),
    { role: "user", content: question },
  ];

  yield { type: "start", runId, conversationId };

  try {
    const result = streamText({
      model: openai(modelName),
      system: systemPromptFor(options.publishedOnly),
      messages,
      tools: buildTools(toolContext),
      stopWhen: stepCountIs(options.maxSteps ?? DEFAULT_MAX_STEPS),
      ...samplingFor(modelName, options.temperature),
      abortSignal: options.abortSignal,
    });

    for await (const part of result.fullStream) {
      if (part.type === "tool-input-start") {
        yield { type: "tool-start", name: part.toolName };
      } else if (part.type === "tool-result") {
        const recorded = [...toolCalls].reverse().find((call) => call.name === part.toolName);
        yield {
          type: "tool",
          name: part.toolName,
          args: recorded?.args ?? part.input,
          durationMs: recorded?.durationMs ?? 0,
          error: recorded?.error,
        };
      } else if (part.type === "text-delta") {
        if (part.text) yield { type: "text", text: part.text };
      } else if (part.type === "error") {
        const message =
          part.error instanceof Error ? part.error.message : String(part.error);
        throw new Error(message);
      }
    }

    const [answerRaw, usage, finishReason] = await Promise.all([
      result.text,
      result.usage,
      result.finishReason,
    ]);
    let answer = answerRaw.trim();
    let settledReason = finishReason;
    let promptTokens = usage?.inputTokens;
    let completionTokens = usage?.outputTokens;

    if (!answer) {
      log.warn("tool loop ended without prose; forcing a final answer", {
        runId,
        finishReason,
        steps: toolCalls.length,
      });
      const response = await result.response;
      const wrapUp = streamText({
        model: openai(modelName),
        system: systemPromptFor(options.publishedOnly),
        messages: wrapUpMessages(messages, response.messages),
        ...samplingFor(modelName, options.temperature),
        abortSignal: options.abortSignal,
      });
      for await (const part of wrapUp.fullStream) {
        if (part.type === "text-delta") {
          if (part.text) yield { type: "text", text: part.text };
        } else if (part.type === "error") {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
      }
      const [wrapUpText, wrapUpUsage, wrapUpReason] = await Promise.all([
        wrapUp.text,
        wrapUp.usage,
        wrapUp.finishReason,
      ]);
      answer = wrapUpText.trim();
      settledReason = wrapUpReason;
      promptTokens = addTokens(promptTokens, wrapUpUsage?.inputTokens);
      completionTokens = addTokens(completionTokens, wrapUpUsage?.outputTokens);
    }

    if (!answer) throw new Error(NO_ANSWER_MESSAGE);

    const citations = extractCitations(answer);
    const ungroundedCitations = citations.filter(
      (citation) =>
        citation.kind === "criterion" &&
        citation.criterionId !== null &&
        !retrievedIdentifiers.has(citation.criterionId),
    );

    if (ungroundedCitations.length > 0) {
      log.warn("agent cited criteria it never retrieved", {
        runId,
        citations: ungroundedCitations.map((citation) => citation.criterionId),
      });
    }

    const durationMs = Math.round(performance.now() - started);

    if (persist) {
      await persistRun(options.db, runId, {
        answer,
        citations,
        usage: { inputTokens: promptTokens, outputTokens: completionTokens },
        finishReason: settledReason,
        durationMs,
        toolCalls,
      });
    }

    yield {
      type: "done",
      runId,
      conversationId,
      answer,
      citations,
      ungroundedCitations,
      toolCalls: toolCalls.map((call) => ({
        name: call.name,
        args: call.args,
        durationMs: call.durationMs,
        error: call.error,
      })),
      usage: {
        promptTokens,
        completionTokens,
      },
      durationMs,
      finishReason: settledReason,
    };
  } catch (error) {
    const message = (error as Error).message;
    if (persist) {
      await options.db
        .update(agentRuns)
        .set({ error: message, finishedAt: new Date() })
        .where(eq(agentRuns.id, runId))
        .catch(() => undefined);
    }
    yield { type: "error", message };
  }
}

function historyToMessages(history: AskOptions["history"]): ModelMessage[] {
  if (!history || history.length === 0) return [];
  return [...history.slice(-16)];
}

async function ensureConversation(
  db: Database,
  conversationId: string,
  question: string,
  options: AskOptions,
): Promise<void> {
  await db
    .insert(conversations)
    .values({
      id: conversationId,
      userId: options.userId ?? null,
      organizationId: options.organizationId ?? null,
      siteId: options.siteId ?? null,
      title: question.slice(0, 120),
    })
    .onConflictDoNothing();

  if (options.siteId || options.organizationId || options.userId) {
    await db
      .update(conversations)
      .set({
        ...(options.userId ? { userId: options.userId } : {}),
        ...(options.organizationId ? { organizationId: options.organizationId } : {}),
        ...(options.siteId ? { siteId: options.siteId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  }
}

// ---------------------------------------------------------------------------

async function persistRun(
  db: Database,
  runId: string,
  data: {
    answer: string;
    citations: readonly Citation[];
    usage: { inputTokens?: number; outputTokens?: number } | undefined;
    finishReason: string;
    durationMs: number;
    toolCalls: readonly ToolCallRecord[];
  },
): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      answer: data.answer,
      citations: [...data.citations],
      promptTokens: data.usage?.inputTokens ?? null,
      completionTokens: data.usage?.outputTokens ?? null,
      finishReason: data.finishReason,
      durationMs: data.durationMs,
      finishedAt: new Date(),
    })
    .where(eq(agentRuns.id, runId));

  if (data.toolCalls.length > 0) {
    await db.insert(agentToolCalls).values(
      data.toolCalls.map((call) => ({
        agentRunId: runId,
        stepIndex: call.stepIndex,
        toolName: call.name,
        arguments: call.args as Record<string, unknown>,
        // Results are stored whole. They are small - a search returns at most
        // twenty extracts - and a truncated result makes a run unreplayable,
        // which defeats the purpose of logging it.
        result: call.result,
        durationMs: call.durationMs,
        error: call.error ?? null,
      })),
    );
  }
}

/**
 * Harvest every criterion number appearing in a tool result.
 *
 * Walks the structure rather than regexing the JSON so that a number appearing
 * inside prose - a cross-reference in a criterion's own text, say - is caught
 * too. Those are legitimately citable: the agent read them.
 */
function collectIdentifiers(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(
      /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?(?!\d)/gi,
    )) {
      const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
      const parts = [match[2], match[3], match[4]]
        .filter((part): part is string => part !== undefined)
        .map((part) => part.padStart(2, "0"));
      into.add(`${edition} ${parts.join(".")}`);
    }
    for (const match of value.matchAll(/\beti:(\d+(?:\.\d+)?)\b/gi)) {
      into.add(`eti:${match[1]}`);
    }
    for (const match of value.matchAll(/\bETI\s+(\d+(?:\.\d+)?)\b/g)) {
      into.add(`eti:${match[1]}`);
    }
    for (const match of value.matchAll(/\bsmeta-wr:([A-Za-z0-9.]+)\b/gi)) {
      into.add(`smeta-wr:${match[1]}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectIdentifiers(item, into);
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectIdentifiers(item, into);
  }
}
