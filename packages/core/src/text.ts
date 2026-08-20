/**
 * Text normalization and similarity.
 *
 * These functions exist for one job: proving that the requirement text we
 * imported from the checklist workbook is the same text that appears in the
 * official P&C PDF. That comparison is the backbone of the reconciliation
 * quality gate, and it is harder than it looks, because the two extractions
 * disagree in ways that are cosmetically large but semantically nil:
 *
 *   - The workbook stores real newlines inside a cell; the PDF wraps lines at
 *     the column edge, so line breaks land in completely different places.
 *   - The PDF hyphenates across line breaks ("docu-\nmentation").
 *   - Both use typographic quotes and dashes inconsistently ("workers’" vs
 *     "workers'", "non-conformance" with U+2011 vs U+002D).
 *   - The PDF renderer emits non-breaking and thin spaces inside numbers.
 *
 * So we normalize aggressively, then compare with metrics that tolerate the
 * residue.
 */

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Collapse all whitespace runs to single spaces and trim. */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * Fold the typographic variants that PDF and XLSX extraction disagree on,
 * while preserving the letters. Use this when you want readable text that is
 * still safe to compare loosely, e.g. for display or for storing a canonical
 * copy.
 */
export function normalizeTypography(input: string): string {
  return (
    input
      .normalize("NFKC")
      // Curly quotes and primes to ASCII.
      .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
      // Every dash-like codepoint to a plain hyphen.
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
      // Bullets to hyphens: the workbook uses "-", the PDF sometimes "•".
      .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")
      // Ellipsis to three dots, so table-of-contents leaders normalize.
      .replace(/\u2026/g, "...")
      // Exotic spaces (non-breaking, thin, hair, figure) to plain space.
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      // Zero-width and soft hyphen carry no meaning; drop entirely.
      .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "")
  );
}

/**
 * Reverse PDF line-break hyphenation: "docu-\nmentation" becomes
 * "documentation".
 *
 * Only joins when a lowercase letter precedes the hyphen and follows the
 * break, which is the signature of a wrapped word. A genuine compound like
 * "non-\nconformance" is also joined, giving "nonconformance" - acceptable,
 * because the comparison side is normalized identically and the aggressive
 * normalizer strips hyphens anyway.
 */
export function dehyphenate(input: string): string {
  return input.replace(/([a-z])-\s*\n\s*([a-z])/g, "$1$2");
}

/**
 * The aggressive normalizer used for equality and similarity checks.
 *
 * Reduces text to lowercase alphanumeric words separated by single spaces.
 * Everything else - punctuation, bullets, list markers, case, whitespace
 * shape - is discarded, because none of it survives a PDF round-trip reliably
 * and none of it changes what a criterion requires.
 */
export function normalizeForComparison(input: string): string {
  return normalizeWhitespace(
    normalizeTypography(dehyphenate(input))
      .toLowerCase()
      // Keep letters and digits (including accented letters), drop the rest.
      .replace(/[^\p{L}\p{N}]+/gu, " "),
  );
}

/** Split normalized text into word tokens. Empty input yields an empty array. */
export function tokenize(input: string): string[] {
  const normalized = normalizeForComparison(input);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/** Character bigrams of a string, as a multiset keyed by bigram. */
function characterBigrams(input: string): Map<string, number> {
  const bigrams = new Map<string, number>();
  for (let i = 0; i < input.length - 1; i++) {
    const gram = input.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }
  return bigrams;
}

/**
 * Sorensen-Dice coefficient over character bigrams, in [0, 1].
 *
 * Chosen over Levenshtein for the text-to-text comparison because it is
 * linear rather than quadratic, and because it degrades gracefully when one
 * side has extra words (a PDF line that swept in a page header) rather than
 * collapsing the way an edit-distance ratio does.
 *
 * Inputs are normalized internally, so callers pass raw text.
 */
export function diceCoefficient(a: string, b: string): number {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);

  if (left.length === 0 && right.length === 0) return 1;
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;
  // Bigrams are undefined for single characters; fall back to equality.
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const leftGrams = characterBigrams(left);
  const rightGrams = characterBigrams(right);

  let intersection = 0;
  let leftTotal = 0;
  for (const [gram, count] of leftGrams) {
    leftTotal += count;
    const other = rightGrams.get(gram);
    if (other !== undefined) intersection += Math.min(count, other);
  }
  let rightTotal = 0;
  for (const count of rightGrams.values()) rightTotal += count;

  return (2 * intersection) / (leftTotal + rightTotal);
}

/**
 * Levenshtein edit distance, computed with two rolling rows so memory is
 * O(min(n, m)) rather than O(n*m).
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Iterate over the shorter string to keep the row small.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];

  let previous = new Array<number>(short.length + 1);
  let current = new Array<number>(short.length + 1);
  for (let i = 0; i <= short.length; i++) previous[i] = i;

  for (let j = 1; j <= long.length; j++) {
    current[0] = j;
    const longChar = long.charCodeAt(j - 1);
    for (let i = 1; i <= short.length; i++) {
      const cost = short.charCodeAt(i - 1) === longChar ? 0 : 1;
      current[i] = Math.min(
        current[i - 1]! + 1, // insertion
        previous[i]! + 1, // deletion
        previous[i - 1]! + cost, // substitution
      );
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[short.length]!;
}

/** Levenshtein similarity in [0, 1], normalized by the longer input. */
export function levenshteinRatio(a: string, b: string): number {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(left, right) / longest;
}

/**
 * What fraction of `needle`'s word n-grams appear somewhere in `haystack`.
 *
 * This is the right metric for "does this criterion appear on this PDF page".
 * Dice would be misleading there, because a page holds several criteria plus
 * headers and footers, so the two sides differ enormously in length even on a
 * perfect match. Coverage asks only the question we care about: is all of the
 * needle present?
 *
 * n = 3 by default. Trigrams are long enough that shared boilerplate
 * ("shall be documented") does not produce false positives, and short enough
 * to survive a few words of extraction noise.
 */
export function ngramCoverage(needle: string, haystack: string, n = 3): number {
  const needleTokens = tokenize(needle);
  const haystackTokens = tokenize(haystack);

  if (needleTokens.length === 0) return 1;
  if (haystackTokens.length === 0) return 0;

  // Too short for n-grams: fall back to plain substring containment.
  if (needleTokens.length < n) {
    return haystackTokens.join(" ").includes(needleTokens.join(" ")) ? 1 : 0;
  }

  const haystackGrams = new Set<string>();
  for (let i = 0; i <= haystackTokens.length - n; i++) {
    haystackGrams.add(haystackTokens.slice(i, i + n).join(" "));
  }

  let present = 0;
  let total = 0;
  for (let i = 0; i <= needleTokens.length - n; i++) {
    total++;
    if (haystackGrams.has(needleTokens.slice(i, i + n).join(" "))) present++;
  }

  return total === 0 ? 1 : present / total;
}

// ---------------------------------------------------------------------------
// Excerpting
// ---------------------------------------------------------------------------

/**
 * Trim text to a length suitable for a provenance excerpt, breaking on a word
 * boundary and appending an ellipsis. Provenance excerpts exist so a reviewer
 * can eyeball that the right passage was captured; they are not the full text.
 */
export function excerpt(input: string, maxLength = 280): string {
  const flat = normalizeWhitespace(normalizeTypography(input));
  if (flat.length <= maxLength) return flat;
  const cut = flat.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/** Rough token count. Good enough for chunk sizing; not a tokenizer. */
export function estimateTokens(input: string): number {
  // ~4 characters per token for English prose is the widely used heuristic and
  // is accurate to about 10% on this corpus. Exactness is unnecessary: chunk
  // budgets have generous headroom.
  return Math.ceil(input.length / 4);
}
