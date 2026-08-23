/**
 * Retrieval and agent tables.
 *
 * Three deliberate decisions are encoded here.
 *
 * 1. Chunks and embeddings are separate tables. Re-embedding with a new model
 *    then costs one insert per chunk rather than a rewrite of the corpus, and
 *    two models can coexist while you compare them. Folding the vector into
 *    the chunk row would make model migration a destructive operation.
 *
 * 2. The full-text vector is a stored generated column with field weights, not
 *    a functional index. `ts_rank_cd` needs the vector itself, and weighting
 *    the heading above the body is what makes "plant protection products"
 *    surface the PPP section rather than the forty criteria that mention it in
 *    passing.
 *
 * 3. Every retrieval and every tool call is logged. Without that, tuning the
 *    hybrid fusion is guesswork and an agent answer cannot be reconstructed
 *    after the fact.
 */

import { relations, sql, type SQL } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { SourceLocation } from "@complifine/core";
import {
  chunkTypeEnum,
  createdAtOnly,
  EMBEDDING_DIMENSIONS,
  primaryId,
  timestamps,
  tsvector,
} from "./_shared.ts";
import { standardDocuments, standardVersions } from "./standards.ts";
import { organizations, users } from "./tenancy.ts";
import { standardSections } from "./structure.ts";
import { requirementVersions } from "./requirements.ts";
import { sites } from "./operations.ts";

// ---------------------------------------------------------------------------
// document_chunks
// ---------------------------------------------------------------------------

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: primaryId(),

    standardVersionId: uuid("standard_version_id")
      .notNull()
      .references(() => standardVersions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => standardDocuments.id, { onDelete: "cascade" }),

    sectionId: uuid("section_id").references(() => standardSections.id, {
      onDelete: "set null",
    }),
    /**
     * Set for requirement chunks, null for prose. Its presence is what lets a
     * retrieval hit resolve to a citable criterion rather than a page.
     */
    requirementVersionId: uuid("requirement_version_id").references(
      () => requirementVersions.id,
      { onDelete: "cascade" },
    ),

    chunkType: chunkTypeEnum("chunk_type").notNull(),

    /**
     * Breadcrumb shown to the model and weighted 'A' in the search vector,
     * e.g. "FV-Smart 32.10.06 — Plant protection products — Mixing and handling".
     */
    heading: text("heading"),
    /** The retrievable body. */
    text: text("text").notNull(),

    tokenCount: integer("token_count").notNull(),

    sourcePage: integer("source_page"),
    sourceLocation: jsonb("source_location").$type<SourceLocation>(),

    /**
     * Authority level copied from the parent document. Denormalised on purpose:
     * every retrieval query filters on it, and a join to enforce "guidance may
     * not be cited as a requirement" on the hot path is a join we would
     * eventually be tempted to skip.
     */
    authorityLevel: integer("authority_level").notNull(),

    /** SHA-256 of heading + text. Drives embedding reuse across re-runs. */
    contentHash: text("content_hash").notNull(),

    /** Ordinal within the document, for reading chunks back in order. */
    ordinal: integer("ordinal").notNull(),

    /**
     * Weighted full-text vector. 'A' for the heading, 'B' for the body.
     * `complifine_en` is created in infra/initdb so lexeme output does not
     * depend on the host's default text search configuration.
     */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('complifine_en', coalesce(${documentChunks.heading}, '')), 'A') || setweight(to_tsvector('complifine_en', ${documentChunks.text}), 'B')`,
    ),

    ...timestamps,
  },
  (t) => [
    index("document_chunks_version_idx").on(t.standardVersionId),
    index("document_chunks_document_idx").on(t.documentId),
    index("document_chunks_requirement_idx").on(t.requirementVersionId),
    index("document_chunks_type_idx").on(t.chunkType),
    index("document_chunks_ordinal_idx").on(t.documentId, t.ordinal),
    uniqueIndex("document_chunks_hash_key").on(t.documentId, t.contentHash),
    index("document_chunks_fts_idx").using("gin", t.searchVector),
    // Trigram index over the raw text. Backstop for the misspellings and
    // partial words that neither full-text stemming nor embeddings handle.
    index("document_chunks_trgm_idx").using("gin", sql`${t.text} gin_trgm_ops`),
  ],
);

// ---------------------------------------------------------------------------
// chunk_embeddings
// ---------------------------------------------------------------------------

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    id: primaryId(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),

    /** Model identifier, e.g. `text-embedding-3-small`. */
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),

    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),

    /**
     * Copy of the chunk's content hash at embedding time. If the chunk text
     * changes, this no longer matches and the row is known to be stale without
     * needing to recompute anything.
     */
    contentHash: text("content_hash").notNull(),

    ...createdAtOnly,
  },
  (t) => [
    uniqueIndex("chunk_embeddings_key").on(t.chunkId, t.model),
    index("chunk_embeddings_model_idx").on(t.model),
    // HNSW over cosine distance. Chosen over IVFFlat because it needs no
    // training step and stays accurate as rows are added incrementally, which
    // matters when a corpus grows one standard at a time.
    index("chunk_embeddings_hnsw_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops"))
      .with({ m: 16, ef_construction: 64 }),
  ],
);

// ---------------------------------------------------------------------------
// retrieval_logs
// ---------------------------------------------------------------------------

export const retrievalLogs = pgTable(
  "retrieval_logs",
  {
    id: primaryId(),

    query: text("query").notNull(),
    /** `exact_id`, `hybrid`, `fulltext_only` or `vector_only`. */
    strategy: text("strategy").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>(),

    resultCount: integer("result_count").notNull(),
    /** Ranked hit list with each component score, for offline tuning. */
    results: jsonb("results").$type<unknown[]>(),

    durationMs: integer("duration_ms"),
    /** Set when the retrieval was made by the agent rather than a human. */
    agentRunId: uuid("agent_run_id"),

    ...createdAtOnly,
  },
  (t) => [
    index("retrieval_logs_created_idx").on(t.createdAt),
    index("retrieval_logs_strategy_idx").on(t.strategy),
    index("retrieval_logs_agent_run_idx").on(t.agentRunId),
  ],
);

// ---------------------------------------------------------------------------
// conversations
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: primaryId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    title: text("title"),
    activeLeafId: uuid("active_leaf_id"),
    ...timestamps,
  },
  (t) => [
    index("conversations_user_idx").on(t.userId, t.createdAt),
    index("conversations_org_idx").on(t.organizationId, t.createdAt),
  ],
);

export type Conversation = typeof conversations.$inferSelect;

export interface MessageAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
  mime: string;
  /** Data URL for images in the prototype; omitted for large files. */
  dataUrl?: string;
}

export interface StoredCitation {
  raw: string;
  criterionId: string | null;
  kind: string;
}

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "pending" | "streaming" | "complete" | "error" | "stopped";

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: primaryId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    role: text("role").$type<MessageRole>().notNull(),
    content: text("content").notNull().default(""),
    status: text("status").$type<MessageStatus>().notNull().default("complete"),
    attachments: jsonb("attachments").$type<MessageAttachment[]>().notNull().default([]),
    citations: jsonb("citations").$type<StoredCitation[]>(),
    ungrounded: jsonb("ungrounded").$type<StoredCitation[]>(),
    tools: jsonb("tools").$type<unknown[]>(),
    hits: jsonb("hits").$type<unknown[]>(),
    error: text("error"),
    runId: uuid("run_id"),
    durationMs: integer("duration_ms"),
    feedback: text("feedback").$type<"up" | "down">(),
    ...timestamps,
  },
  (t) => [
    index("conversation_messages_conv_idx").on(t.conversationId, t.createdAt),
    index("conversation_messages_parent_idx").on(t.parentId),
  ],
);

export type ConversationMessage = typeof conversationMessages.$inferSelect;

// ---------------------------------------------------------------------------
// agent_runs and agent_tool_calls
// ---------------------------------------------------------------------------

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: primaryId(),

    /** Groups turns of one conversation. */
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),

    model: text("model").notNull(),
    systemPromptHash: text("system_prompt_hash"),

    question: text("question").notNull(),
    answer: text("answer"),

    /** Citations the answer carried, extracted for citation-accuracy scoring. */
    citations: jsonb("citations").$type<unknown[]>(),

    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    durationMs: integer("duration_ms"),

    finishReason: text("finish_reason"),
    error: text("error"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    index("agent_runs_conversation_idx").on(t.conversationId, t.createdAt),
    index("agent_runs_created_idx").on(t.createdAt),
    index("agent_runs_org_idx").on(t.organizationId),
    index("agent_runs_user_idx").on(t.userId),
  ],
);

export const agentToolCalls = pgTable(
  "agent_tool_calls",
  {
    id: primaryId(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),

    /** Position within the run, so the sequence can be replayed. */
    stepIndex: integer("step_index").notNull(),
    toolName: text("tool_name").notNull(),

    arguments: jsonb("arguments").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<unknown>(),

    durationMs: integer("duration_ms"),
    error: text("error"),

    ...createdAtOnly,
  },
  (t) => [
    index("agent_tool_calls_run_idx").on(t.agentRunId, t.stepIndex),
    index("agent_tool_calls_tool_idx").on(t.toolName),
  ],
);

// ---------------------------------------------------------------------------
// eval_results
// ---------------------------------------------------------------------------

/**
 * Scores from the retrieval and answer evaluation harness.
 *
 * Persisted so that "did that prompt change help" is answerable with a query
 * rather than by comparing two terminal scrollbacks.
 */
export const evalResults = pgTable(
  "eval_results",
  {
    id: primaryId(),

    /** Groups one execution of the whole suite. */
    runId: uuid("run_id").notNull(),
    suite: text("suite").notNull(),
    caseId: text("case_id").notNull(),
    category: text("category").notNull(),

    question: text("question").notNull(),
    expected: jsonb("expected").$type<unknown>(),
    actual: jsonb("actual").$type<unknown>(),

    passed: jsonb("passed").$type<boolean>().notNull(),
    /** Per-metric scores, e.g. `{ "recall@5": 1, "mrr": 0.5 }`. */
    metrics: jsonb("metrics").$type<Record<string, number>>(),

    notes: text("notes"),
    durationMs: integer("duration_ms"),

    ...createdAtOnly,
  },
  (t) => [
    uniqueIndex("eval_results_key").on(t.runId, t.caseId),
    index("eval_results_run_idx").on(t.runId),
    index("eval_results_suite_idx").on(t.suite),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const documentChunksRelations = relations(documentChunks, ({ one, many }) => ({
  standardVersion: one(standardVersions, {
    fields: [documentChunks.standardVersionId],
    references: [standardVersions.id],
  }),
  document: one(standardDocuments, {
    fields: [documentChunks.documentId],
    references: [standardDocuments.id],
  }),
  section: one(standardSections, {
    fields: [documentChunks.sectionId],
    references: [standardSections.id],
  }),
  requirementVersion: one(requirementVersions, {
    fields: [documentChunks.requirementVersionId],
    references: [requirementVersions.id],
  }),
  embeddings: many(chunkEmbeddings),
}));

export const chunkEmbeddingsRelations = relations(chunkEmbeddings, ({ one }) => ({
  chunk: one(documentChunks, {
    fields: [chunkEmbeddings.chunkId],
    references: [documentChunks.id],
  }),
}));

export const agentRunsRelations = relations(agentRuns, ({ many }) => ({
  toolCalls: many(agentToolCalls),
}));

export const agentToolCallsRelations = relations(agentToolCalls, ({ one }) => ({
  run: one(agentRuns, {
    fields: [agentToolCalls.agentRunId],
    references: [agentRuns.id],
  }),
}));

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
export type ChunkEmbedding = typeof chunkEmbeddings.$inferSelect;
export type NewChunkEmbedding = typeof chunkEmbeddings.$inferInsert;
export type RetrievalLog = typeof retrievalLogs.$inferSelect;
export type NewRetrievalLog = typeof retrievalLogs.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentToolCall = typeof agentToolCalls.$inferSelect;
export type NewAgentToolCall = typeof agentToolCalls.$inferInsert;
export type EvalResult = typeof evalResults.$inferSelect;
export type NewEvalResult = typeof evalResults.$inferInsert;
