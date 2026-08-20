/**
 * Choosing which embedder to query with.
 *
 * A query vector must come from the same model that embedded the corpus.
 * Comparing vectors from two spaces is not a type error - they are the same
 * length - and pgvector will return a ranked list that looks like search and
 * means nothing. The model filter in `semanticSearch` turns a mismatch into
 * zero hits, which is safe and indistinguishable from a quality regression
 * unless someone says so. This module is that someone.
 */

import { hasAiCredentials } from "@complifine/core";
import type { Database } from "@complifine/db";
import { hashEmbedder, openAiEmbedder, type Embedder } from "./provider.ts";
import { indexedModels } from "./index-corpus.ts";

export interface EmbedderChoice {
  readonly embedder: Embedder | null;
  /** Why this embedder, or why none. Printed by the CLI, ignored by the API. */
  readonly reason:
    | "openai"
    | "local_requested"
    | "no_credentials"
    | "index_empty"
    | "index_mismatch";
  readonly indexedModel: string | null;
}

export function createEmbedder(options: { local?: boolean } = {}): Embedder {
  if (options.local) return hashEmbedder();
  if (hasAiCredentials()) return openAiEmbedder();
  return hashEmbedder();
}

/**
 * The embedder that can actually retrieve against the current index.
 *
 * Prefers the configured model when the index has vectors for it; otherwise
 * follows the index. Returning null means there are no embeddings at all and
 * search should run lexical-only.
 */
export async function embedderForQuery(
  db: Database,
  options: { local?: boolean } = {},
): Promise<EmbedderChoice> {
  const models = await indexedModels(db);
  const indexedModel = models[0]?.model ?? null;

  if (models.length === 0) {
    return { embedder: null, reason: "index_empty", indexedModel: null };
  }

  const preferred = createEmbedder(options);
  if (models.some((entry) => entry.model === preferred.model)) {
    const reason = options.local
      ? "local_requested"
      : preferred.semantic
        ? "openai"
        : "no_credentials";
    return { embedder: preferred, reason, indexedModel };
  }

  const fallback = indexedModel === hashEmbedder().model ? hashEmbedder() : openAiEmbedder();
  return { embedder: fallback, reason: "index_mismatch", indexedModel };
}
