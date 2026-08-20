/**
 * Splitting long text into overlapping windows.
 *
 * Only used for prose sections that exceed the chunk budget on their own.
 * Requirements are never split: one criterion is one chunk so a retrieval hit
 * is always a complete, citable rule (see `chunking/index.ts`).
 *
 * The split respects sentence boundaries. A retrieval hit is shown to a reader
 * and quoted by the agent, and a chunk that begins "…shall be recorded and the
 * records retained" is worse than useless in a compliance answer: it reads like
 * a complete instruction while omitting what it applies to.
 */

import { estimateTokens, tokenBudgetToChars } from "../tokens.ts";

export interface SplitOptions {
  /** Target size of each window. */
  readonly maxTokens: number;
  /**
   * How much of the previous window to repeat at the start of the next.
   *
   * Overlap exists because a rule and its exception are often adjacent
   * sentences, and a split between them would leave the exception retrievable
   * without the rule it modifies.
   */
  readonly overlapTokens: number;
}

export interface TextWindow {
  readonly text: string;
  readonly index: number;
  readonly tokenCount: number;
}

/**
 * Sentence boundaries.
 *
 * Splits after `.`, `!` or `?` followed by whitespace. The lookbehind excludes
 * the abbreviations that appear constantly in this corpus - `e.g.`, `i.e.`,
 * `No.`, and the trailing `P.` of GLOBALG.A.P. - because splitting there would
 * cut a sentence in half at exactly the point a reader needs it whole.
 */
const SENTENCE_END = /(?<!\b(?:e\.g|i\.e|etc|No|Nos|vs|Dr|Mr|Ms|[A-Z])\.)(?<=[.!?])\s+/;

export function splitIntoSentences(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Split text into overlapping windows, breaking only between sentences.
 *
 * A single sentence longer than the budget is emitted whole rather than cut:
 * an over-long chunk is a nuisance, a truncated legal sentence is a hazard.
 */
export function splitText(text: string, options: SplitOptions): TextWindow[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  if (estimateTokens(trimmed) <= options.maxTokens) {
    return [{ text: trimmed, index: 0, tokenCount: estimateTokens(trimmed) }];
  }

  const maxChars = tokenBudgetToChars(options.maxTokens);
  const overlapChars = tokenBudgetToChars(options.overlapTokens);
  const sentences = splitIntoSentences(trimmed);

  const windows: TextWindow[] = [];
  let buffer: string[] = [];
  let bufferChars = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const body = buffer.join(" ");
    windows.push({ text: body, index: windows.length, tokenCount: estimateTokens(body) });

    // Carry the tail of this window into the next one.
    const carried: string[] = [];
    let carriedChars = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const sentence = buffer[i]!;
      if (carriedChars + sentence.length > overlapChars) break;
      carried.unshift(sentence);
      carriedChars += sentence.length + 1;
    }

    // Never carry the entire window, or a section whose sentences are all
    // shorter than the overlap budget would never advance.
    if (carried.length >= buffer.length) carried.shift();

    buffer = carried;
    bufferChars = carried.reduce((sum, s) => sum + s.length + 1, 0);
  };

  for (const sentence of sentences) {
    if (bufferChars > 0 && bufferChars + sentence.length > maxChars) flush();
    buffer.push(sentence);
    bufferChars += sentence.length + 1;
  }

  flush();

  return windows.map((window, index) => ({ ...window, index }));
}
