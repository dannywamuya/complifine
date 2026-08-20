/**
 * Token estimation.
 *
 * Deliberately an estimate rather than a real BPE tokenizer. The only two
 * things token counts are used for here are deciding where to split a long
 * prose section and reporting chunk sizes, and neither needs to be exact - a
 * chunk of 780 tokens and one of 820 retrieve identically. Pulling in a
 * tokenizer would add a multi-megabyte vocabulary file and a WASM build step to
 * buy precision nothing consumes.
 *
 * The ratio below was measured against the actual corpus rather than taken from
 * a blog post: see `packages/ai/test/tokens.test.ts`, which pins it against
 * real requirement and regulation text.
 */

/**
 * Characters per token for English regulatory prose.
 *
 * OpenAI's rule of thumb is 4.0. Compliance text runs slightly denser because
 * of its long words ("certification", "non-conformance", "GLOBALG.A.P.") and
 * heavy punctuation, so 3.8 is used to avoid under-counting and producing
 * chunks that overflow the embedding window.
 */
const CHARS_PER_TOKEN = 3.8;

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/** The character budget corresponding to a token budget. */
export function tokenBudgetToChars(tokens: number): number {
  return Math.floor(tokens * CHARS_PER_TOKEN);
}
