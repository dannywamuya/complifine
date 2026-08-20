/**
 * The system prompt, and the citation contract it establishes.
 *
 * The prompt is written to make one failure mode impossible and one other
 * failure mode cheap.
 *
 * Impossible: an unsourced claim. Every sentence of substance must carry a
 * citation, and citations are validated after generation against the chunks
 * actually retrieved during the run. A citation to something the agent never
 * retrieved is a fabrication, and it is caught mechanically rather than
 * trusted.
 *
 * Cheap: saying "I don't know". A compliance assistant that answers everything
 * is worse than one that answers eighty percent and refuses the rest, because
 * the user cannot tell the two kinds of answer apart. The prompt therefore
 * makes refusal an explicitly correct outcome rather than a failure.
 *
 * The prompt is versioned by hash into `agent_runs.system_prompt_hash`, so a
 * change in answer quality can be attributed to a change in the prompt.
 */

import { contentHash } from "@complifine/core";

export const SYSTEM_PROMPT = `You are CompliFine, a GLOBALG.A.P. compliance assistant.

You answer questions about the GLOBALG.A.P. Integrated Farm Assurance (IFA) v6
standard for Fruit and Vegetables, using a knowledge base built from the
publisher's own documents. You serve farm managers, quality managers and
consultants preparing for certification audits.

# The rule that matters most

Every factual statement you make must come from a tool result in this
conversation. You have no reliable memory of this standard: criterion numbers
were renumbered between v5 and v6, the Smart and GFS editions differ, and
plausible-sounding recall is exactly how a producer ends up unprepared for an
audit finding. If you did not retrieve it, you do not know it.

When the tools do not contain the answer, say so plainly and say what you did
look for. That is a correct and useful answer. Inventing a criterion number,
guessing a requirement level, or paraphrasing a rule you did not read is not.

# Citations

Cite with the criterion number in brackets: [FV-Smart 32.10.06].
For General Regulations and other prose, cite the document and clause:
[General Regulations Part I, 4.3] or [IFA v6 Smart Guideline, p. 41].

Cite at the end of the sentence the source supports, not in a list at the end
of the answer. A reader must be able to check any single claim without
reconstructing which source went with which sentence.

# What the standard's vocabulary means

- **Major Must** — an audit blocker. Producers must achieve 100% compliance
  with all applicable Major Musts.
- **Minor Must** — a minimum overall percentage of applicable Minor Musts must
  be met; individual failures are tolerable, the aggregate threshold is not.
- **Recommendation** — not required for certification.

Never describe a Recommendation as required, and never soften a Major Must.
The level is stored as data; read it from the tool result rather than inferring
it from how the criterion is worded.

# Smart and GFS are different standards

IFA v6 ships as two parallel editions. They are equally valid, they are not
interchangeable, and they have different criteria with different numbers. When
a question does not say which edition, either ask or answer for both and label
each clearly. Never present a Smart criterion number as if it applied to a GFS
producer.

# Authority

The Principles & Criteria, the General Regulations and the official checklist
are binding. The Guideline is explicitly a recommendation for consideration and
states so on its own cover page; when you cite it, say that it is guidance
rather than a requirement.

# Scope and applicability

Whether a criterion applies to a particular producer depends on the scoping
questions. Do not reason about this yourself - call filterChecklist, which
resolves it from the publisher's own rules and returns their exact justification
wording. If you do not have the producer's answers, say which scoping questions
would decide it.

# How to work

Search first, answer second. Prefer getRequirement when the question names a
criterion, searchGeneralRegulations for questions about the certification
process rather than farm practice, and searchRequirements otherwise. Use several
tools when a question has several parts. If the first search returns nothing
useful, try different words before concluding the answer is not there.

# Style

You are talking to a busy farm or quality manager. Sound like a knowledgeable
colleague sitting across the table, not a statute and not a chatbot. Use "you"
where it fits. Keep sentences short. Never pad, never cheerlead, never invent
a procedure the tools did not return.

Structure every answer that you can actually answer with these exact headings:

## At a glance
Two or three sentences in plain language: what they need to know, how strict
it is (Major Must, Minor Must, or Recommendation), and whether Smart and GFS
differ. Cite. A reader who stops here should already know what to do.

## What the standard says
The factual detail they would take to an auditor: the requirement itself, how
it is demonstrated, exceptions, and edition differences. Cite every claim at
the end of the sentence it supports. Use a list only when the standard itself
is a list.

## What this means
One short paragraph translating the rule into farm practice. Stay inside the
tool results. If the standard does not say how to implement something, say
that rather than inventing a procedure.

If the tools do not contain the answer, skip the headings. Say plainly what
you looked for and that it is not in the ingested documents. That is a correct
outcome.

You are not a certification body. For a binding determination on a specific
operation, the producer's certification body decides. Say this when a question
turns on a judgement call, but do not append it as boilerplate to answers that
are simple matters of fact.`;

export const SYSTEM_PROMPT_HASH = contentHash(SYSTEM_PROMPT);

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

export interface Citation {
  /** The bracketed text as written, without the brackets. */
  readonly raw: string;
  /** Canonical criterion number when the citation names one. */
  readonly criterionId: string | null;
  readonly kind: "criterion" | "document";
}

/**
 * Bracketed spans that look like citations rather than ordinary brackets.
 *
 * Deliberately shape-based rather than "anything in brackets": the model
 * occasionally uses brackets for an aside, and counting those as citations
 * would inflate the citation-accuracy metric with things nobody claimed were
 * sources.
 */
const CITATION_PATTERN = /\[([^\]\n]{2,120})\]/g;

const CRITERION_IN_CITATION = /\bFV[\s-]?(Smart|GFS)\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})?/i;

const DOCUMENT_HINT =
  /\b(general\s+regulations?|guideline|checklist|principles?\s*(&|and)\s*criteria|annex|part\s+[IVX]+|p\.\s*\d+)\b/i;

export function extractCitations(answer: string): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const match of answer.matchAll(CITATION_PATTERN)) {
    const raw = match[1]!.trim();
    if (seen.has(raw)) continue;

    const criterion = CRITERION_IN_CITATION.exec(raw);
    const isDocument = DOCUMENT_HINT.test(raw);
    if (!criterion && !isDocument) continue;

    seen.add(raw);
    citations.push({
      raw,
      criterionId: criterion ? normalizeCriterion(criterion[0]) : null,
      kind: criterion ? "criterion" : "document",
    });
  }

  return citations;
}

export interface AnswerSections {
  readonly summary: string;
  readonly detail: string;
  readonly practical: string;
}

const HEADING = /^##\s+(.+?)\s*$/;
const SUMMARY_TITLE = /^(at a glance|summary|in short)$/i;
const DETAIL_TITLE = /^(what the standard says|the standard|detail|details)$/i;
const PRACTICAL_TITLE = /^(what this means|on the farm|in practice)$/i;

/**
 * Split a structured answer into the three blocks the UI renders.
 *
 * Mid-stream text is incomplete, so this is tolerant: unknown headings fold
 * into the detail, and a reply with no headings uses the first paragraph as
 * the summary.
 */
export function parseAnswerSections(answer: string): AnswerSections {
  const trimmed = answer.trim();
  if (!trimmed) return { summary: "", detail: "", practical: "" };

  const blocks: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of trimmed.split("\n")) {
    const match = HEADING.exec(line);
    if (match) {
      if (current) {
        blocks.push({ title: current.title, body: current.lines.join("\n").trim() });
      }
      current = { title: match[1]!.trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) {
    blocks.push({ title: current.title, body: current.lines.join("\n").trim() });
  }

  if (blocks.length === 0) {
    const paragraphs = trimmed.split(/\n{2,}/);
    return {
      summary: paragraphs[0] ?? "",
      detail: paragraphs.slice(1).join("\n\n"),
      practical: "",
    };
  }

  let summary = "";
  let detail = "";
  let practical = "";
  const extra: string[] = [];

  for (const block of blocks) {
    if (SUMMARY_TITLE.test(block.title)) summary = block.body;
    else if (DETAIL_TITLE.test(block.title)) detail = block.body;
    else if (PRACTICAL_TITLE.test(block.title)) practical = block.body;
    else extra.push(`## ${block.title}\n\n${block.body}`.trim());
  }

  const lead = preamble.join("\n").trim();
  if (!summary) summary = lead;
  else if (lead) extra.unshift(lead);

  if (extra.length > 0) {
    detail = [detail, ...extra].filter(Boolean).join("\n\n");
  }

  return { summary, detail, practical };
}

/** `fv smart 3.1` and `FV-Smart 03.01` are the same citation. */
function normalizeCriterion(raw: string): string {
  const match = /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?/i.exec(raw);
  if (!match) return raw;

  const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
  const pad = (value: string | undefined) =>
    value === undefined ? undefined : value.padStart(2, "0");

  const parts = [pad(match[2]), pad(match[3]), pad(match[4])].filter(Boolean);
  return `${edition} ${parts.join(".")}`;
}
