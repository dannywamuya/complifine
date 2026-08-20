/**
 * Chunking.
 *
 * The standard argument for chunking is "documents are longer than the context
 * window". That is not the interesting constraint here. The interesting one is
 * that a compliance answer must be citable: a retrieval hit has to resolve to
 * "FV-Smart 32.10.06, Major Must, page 47", not to "somewhere around here".
 *
 * That rules out fixed-size chunking outright. A 512-token window slid over the
 * standard would cut criteria in half, merge the end of one requirement with
 * the start of the next, and leave chunks that cannot say which criterion they
 * came from. The document already has natural units, and they are exactly the
 * units a reader cites, so the chunks are those units.
 *
 * Two strategies, because the corpus has two shapes:
 *
 *   - **Requirements.** One chunk per criterion, never split, with its section
 *     breadcrumb prepended. A criterion is one indivisible obligation - the
 *     principle states the outcome, the criteria states how compliance is
 *     demonstrated - and half of it is not a weaker answer, it is a wrong one.
 *
 *   - **Prose.** One chunk per clause of the General Regulations and the
 *     guideline, split into overlapping windows only when a clause is long
 *     enough to need it.
 */

import { contentHash } from "@complifine/core";
import type { ChunkType } from "@complifine/core";
import { estimateTokens } from "../tokens.ts";
import { splitText } from "./split.ts";

export interface ChunkInput {
  readonly standardVersionId: string;
  readonly documentId: string;
  readonly authorityLevel: number;
}

export interface PreparedChunk {
  readonly chunkType: ChunkType;
  readonly heading: string | null;
  readonly text: string;
  readonly tokenCount: number;
  readonly contentHash: string;
  readonly sectionId: string | null;
  readonly requirementVersionId: string | null;
  readonly sourcePage: number | null;
  readonly ordinal: number;
}

/** Prose windows target this size, comfortably inside every embedding model. */
export const PROSE_MAX_TOKENS = 800;
/** Roughly two sentences of shared context between adjacent windows. */
export const PROSE_OVERLAP_TOKENS = 100;

/**
 * Content hash over exactly what gets embedded.
 *
 * Hashing the heading together with the text matters: two clauses in different
 * chapters can share wording ("General"), and a hash of the body alone would
 * make them collide and give one the other's embedding.
 */
export function chunkHash(heading: string | null, text: string): string {
  return contentHash(`${heading ?? ""}\u0000${text}`);
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface RequirementChunkSource {
  readonly requirementVersionId: string;
  readonly sourceRequirementId: string;
  readonly levelLabel: string;
  readonly principleText: string;
  readonly criteriaText: string | null;
  readonly sectionId: string | null;
  /** Section breadcrumb, outermost first. */
  readonly sectionPath: readonly string[];
  readonly sourcePage: number | null;
  readonly sortKey: number;
}

/**
 * Build one chunk per criterion.
 *
 * The chunk text carries its own identity - number, level, section path - as
 * well as its wording. Three reasons, all load-bearing:
 *
 *   1. The embedding is of the criterion *in context*. "Records are retained
 *      for two years" means something different under "Plant protection
 *      products" than under "Worker health and safety", and without the
 *      breadcrumb both embed to nearly the same point.
 *   2. Full-text search over the chunk then matches the criterion number, so
 *      searching "32.10.06" finds it lexically even if the vector misses.
 *   3. The model sees the citation inside the text it is quoting, which makes
 *      citing the wrong criterion take active effort rather than inattention.
 */
export function chunkRequirements(
  requirements: readonly RequirementChunkSource[],
): PreparedChunk[] {
  return [...requirements]
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((requirement, ordinal) => {
      const heading = [requirement.sourceRequirementId, ...requirement.sectionPath].join(" · ");

      const body = [
        `${requirement.sourceRequirementId} (${requirement.levelLabel})`,
        requirement.sectionPath.length > 0 ? `Section: ${requirement.sectionPath.join(" > ")}` : null,
        `Principle: ${requirement.principleText}`,
        requirement.criteriaText ? `Criteria: ${requirement.criteriaText}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");

      return {
        chunkType: "requirement" as const,
        heading,
        text: body,
        tokenCount: estimateTokens(body),
        contentHash: chunkHash(heading, body),
        sectionId: requirement.sectionId,
        requirementVersionId: requirement.requirementVersionId,
        sourcePage: requirement.sourcePage,
        ordinal,
      };
    });
}

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

export interface ProseChunkSource {
  readonly sectionId: string;
  readonly identifier: string | null;
  readonly title: string;
  readonly body: string;
  /** Breadcrumb of ancestor headings, outermost first, excluding this one. */
  readonly ancestorPath: readonly string[];
  readonly sourcePage: number | null;
  readonly order: number;
}

/**
 * Build chunks for the long-form documents.
 *
 * A clause short enough to fit becomes one chunk. A long one becomes several
 * overlapping windows, each of which repeats the heading so that a window from
 * the middle of clause 7.3.3 still knows it is clause 7.3.3 - otherwise the
 * second half of a rule retrieves with nothing to cite.
 */
export function chunkProse(sections: readonly ProseChunkSource[]): PreparedChunk[] {
  const chunks: PreparedChunk[] = [];
  let ordinal = 0;

  for (const section of [...sections].sort((a, b) => a.order - b.order)) {
    const body = section.body.trim();
    if (body.length === 0) continue;

    const label = section.identifier ? `${section.identifier} ${section.title}` : section.title;
    const heading = [...section.ancestorPath, label].join(" · ");

    const windows = splitText(body, {
      maxTokens: PROSE_MAX_TOKENS,
      overlapTokens: PROSE_OVERLAP_TOKENS,
    });

    for (const window of windows) {
      // Only a multi-window clause needs the part marker; adding it to every
      // chunk would put "(part 1 of 1)" in front of most of the corpus.
      const partSuffix = windows.length > 1 ? ` (part ${window.index + 1} of ${windows.length})` : "";
      const text = `${heading}${partSuffix}\n${window.text}`;

      chunks.push({
        chunkType: "section",
        heading: `${heading}${partSuffix}`,
        text,
        tokenCount: estimateTokens(text),
        contentHash: chunkHash(`${heading}${partSuffix}`, text),
        sectionId: section.sectionId,
        requirementVersionId: null,
        sourcePage: section.sourcePage,
        ordinal: ordinal++,
      });
    }
  }

  return chunks;
}

export { splitText, splitIntoSentences } from "./split.ts";
export type { SplitOptions, TextWindow } from "./split.ts";
