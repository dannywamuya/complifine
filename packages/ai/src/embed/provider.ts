/**
 * Embedding providers.
 *
 * Two implementations behind one interface.
 *
 * `openAiEmbedder` is the real one: `text-embedding-3-small`, 1536 dimensions,
 * batched. Chosen over `-3-large` because the corpus is small and homogeneous -
 * one standard, one language, heavily structured - so the larger model's
 * advantage is marginal, while its 3072 dimensions double index size and cost
 * six times as much to build.
 *
 * `hashEmbedder` is a deterministic local embedder. It exists so that the
 * retrieval layer - the SQL, the fusion, the filters, the ranking - can be
 * tested end to end against a real Postgres with real pgvector, with no API key
 * and no network. It produces genuine, stable, comparable vectors from token
 * hashing; what it does not produce is semantic similarity between different
 * words. That is the right trade: the parts of retrieval that can silently
 * break are the plumbing and the fusion arithmetic, and those are exactly what
 * it exercises. It is never used when a key is configured.
 */

import { requireAiEnv } from "@complifine/core";

export interface EmbeddingResult {
  readonly embeddings: readonly (readonly number[])[];
  /** Tokens billed, when the provider reports them. */
  readonly tokens: number | null;
}

export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  /** True when embeddings come from a real model rather than the local stand-in. */
  readonly semantic: boolean;
  embed(texts: readonly string[]): Promise<EmbeddingResult>;
}

/** OpenAI accepts far more, but smaller batches fail and retry more cheaply. */
const BATCH_SIZE = 96;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function openAiEmbedder(): Embedder {
  const env = requireAiEnv();
  const baseUrl = env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  return {
    model: env.EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMENSIONS,
    semantic: true,

    async embed(texts) {
      if (texts.length === 0) return { embeddings: [], tokens: 0 };

      const embeddings: number[][] = [];
      let tokens = 0;

      for (let start = 0; start < texts.length; start += BATCH_SIZE) {
        const batch = texts.slice(start, start + BATCH_SIZE);
        const response = await embedBatch(baseUrl, env.OPENAI_API_KEY, env.EMBEDDING_MODEL, batch);

        // The API guarantees ordering by `index`, but sorting explicitly costs
        // nothing and a silently misaligned batch would attach every chunk's
        // vector to its neighbour - a failure with no visible symptom.
        for (const item of [...response.data].sort((a, b) => a.index - b.index)) {
          embeddings.push(item.embedding);
        }
        tokens += response.usage?.total_tokens ?? 0;
      }

      return { embeddings, tokens };
    },
  };
}

interface EmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
  usage?: { total_tokens: number };
}

async function embedBatch(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: readonly string[],
): Promise<EmbeddingResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input }),
        signal: AbortSignal.timeout(120_000),
      });

      if (response.ok) return (await response.json()) as EmbeddingResponse;

      const body = await response.text();
      lastError = new Error(describeFailure(response.status, body));

      // 400 means the request itself is wrong - bad model name, input too
      // long. Retrying cannot help and only delays the error the operator
      // needs to see.
      //
      // A 429 is normally rate limiting and worth backing off from, but the
      // same status also carries "you are out of credits", which no amount of
      // waiting fixes. Retrying that burns thirty seconds before printing a
      // billing problem, so it is separated out by error code.
      const retryable =
        (response.status === 429 && !isQuotaExhausted(body)) || response.status >= 500;
      if (!retryable) throw lastError;
    } catch (error) {
      lastError = error as Error;
      if (attempt === MAX_ATTEMPTS) break;
    }

    await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  throw lastError ?? new Error("Embedding request failed for an unknown reason");
}

/** Billing exhaustion, which arrives as a 429 but is permanent. */
export function isQuotaExhausted(body: string): boolean {
  return body.includes("insufficient_quota") || body.includes("credit_balance_exhausted");
}

/**
 * Turn an API error into something that says what to do next.
 *
 * The raw JSON is kept on the end, because a message that hides the provider's
 * own wording is worse than a verbose one when you are actually debugging.
 */
function describeFailure(status: number, body: string): string {
  if (isQuotaExhausted(body)) {
    return (
      "The OpenAI account has no credits, so embeddings cannot be generated.\n" +
      "  Either add credits, or build the index with the deterministic local embedder:\n" +
      "    bun run ai index --local\n" +
      "  Lexical search and the eval harness work fully with the local embedder; " +
      "semantic matching will be weak."
    );
  }

  if (status === 401) {
    return "OpenAI rejected the API key (HTTP 401). Check OPENAI_API_KEY in .env.";
  }

  return `OpenAI embeddings returned HTTP ${status}: ${body.slice(0, 300)}`;
}

// ---------------------------------------------------------------------------
// Deterministic local embedder
// ---------------------------------------------------------------------------

/**
 * Hashed bag-of-words embedding, L2-normalised.
 *
 * Each token is hashed to a dimension and accumulated with a sublinear term
 * weight, which gives vectors with the properties the retrieval layer actually
 * depends on: fixed length, unit norm, cosine similarity of 1 for identical
 * text, and monotonically increasing similarity with shared vocabulary.
 */
export function hashEmbedder(dimensions = 1536): Embedder {
  return {
    model: "hash-bow-v1",
    dimensions,
    semantic: false,

    async embed(texts) {
      return {
        embeddings: texts.map((text) => hashEmbedding(text, dimensions)),
        tokens: null,
      };
    },
  };
}

export function hashEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const counts = new Map<number, number>();

  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const bucket = fnv1a(token) % dimensions;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  for (const [bucket, count] of counts) {
    // Sublinear scaling, as in tf-idf: the twentieth occurrence of "shall"
    // should not dominate the one occurrence of "pesticide".
    vector[bucket] = 1 + Math.log(count);
  }

  let sumSquares = 0;
  for (const value of vector) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);

  if (norm === 0) {
    // pgvector cannot compute cosine distance against a zero vector, so text
    // with no alphanumeric content gets an arbitrary but valid unit vector.
    vector[0] = 1;
    return vector;
  }

  return vector.map((value) => value / norm);
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
