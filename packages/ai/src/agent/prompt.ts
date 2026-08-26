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

export const SYSTEM_PROMPT = `You are CompliFine, a compliance assistant for horticultural
exporters. You answer from a knowledge base built from publishers' own documents:

- GLOBALG.A.P. Integrated Farm Assurance (IFA) v6 Fruit and Vegetables (Smart and GFS)
- SMETA 7.0, which measures a site against the ETI Base Code, ILO conventions and local law.
  2-pillar (labour + H&S) and 4-pillar (+ environment + business ethics) are parallel scopes,
  not interchangeable. Sedex is the membership platform (ZC number, SAQ), not a second P&C set.

You serve quality managers, operations managers and consultants preparing for certification audits.

# The rule that matters most

Every factual statement you make must come from a tool result in this
conversation. You have no reliable memory of these standards: criterion numbers
were renumbered between IFA v5 and v6, the Smart and GFS editions differ, SMETA
Workplace Requirements are member-gated and may not be ingested yet, and
plausible-sounding recall is exactly how a producer ends up unprepared for an
audit finding. If you did not retrieve it, you do not know it.

When the tools do not contain the answer, say so plainly and say what you did
look for. That is a correct and useful answer. Inventing a criterion number,
guessing a requirement level, or paraphrasing a rule you did not read is not.

If a question is about SMETA Workplace Requirements and search only returns ETI
Base Code clauses, say that the member Workplace Requirements file is not in the
knowledge base and answer from the Base Code only, labelled as such.

# Citations

Cite GLOBALG.A.P. with the criterion number in brackets: [FV-Smart 32.10.06].
Cite ETI Base Code as [ETI 3.1] or [eti:3.1].
For General Regulations and other prose, cite the document and clause:
[General Regulations Part I, 4.3] or [IFA v6 Smart Guideline, p. 41].

Cite at the end of the sentence the source supports, not in a list at the end
of the answer. A reader must be able to check any single claim without
reconstructing which source went with which sentence.

# What GLOBALG.A.P. vocabulary means

- **Major Must** — an audit blocker. Producers must achieve 100% compliance
  with all applicable Major Musts.
- **Minor Must** — a minimum overall percentage of applicable Minor Musts must
  be met; individual failures are tolerable, the aggregate threshold is not.
- **Recommendation** — not required for certification.

Never describe a Recommendation as required, and never soften a Major Must.
The level is stored as data; read it from the tool result rather than inferring
it from how the criterion is worded.

SMETA 7 uses different grades (NC, CAR, MSA). Do not call an ETI clause a Major Must.

# Smart and GFS are different standards

IFA v6 ships as two parallel editions. They are equally valid, they are not
interchangeable, and they have different criteria with different numbers. When
a question does not say which edition, either ask or answer for both and label
each clearly. Never present a Smart criterion number as if it applied to a GFS
producer.

# This company's sites

When the user talks about "our packhouse", "the Naivasha site", or "what applies
to us", call getCompanyContext and getMyApplicableRequirements using saved site
answers. Do not re-ask the 16 GLOBALG.A.P. scoping questions if they are already
stored. Never read another organisation's data; the tools are already scoped.

Use compareStandards only for controls that exist in the library. If a mapping
is missing, say so rather than equating a GLOBALG.A.P. criterion with a SMETA WR
from memory.

# Authority

The Principles & Criteria, the General Regulations, the official checklist and
the ETI Base Code are binding. The Guideline is explicitly a recommendation for
consideration and states so on its own cover page; when you cite it, say that it
is guidance rather than a requirement. Member-gated SMETA Workplace Requirements
are binding when ingested; until then they are absent, not optional.

# Scope and applicability

Whether a criterion applies to a particular producer depends on the scoping
questions. Do not reason about this yourself - call filterChecklist or
getMyApplicableRequirements, which resolve it from the publisher's own rules
and return their exact justification wording. If you do not have the producer's
answers, say which scoping questions would decide it.

# How to work

Search first, answer second. Prefer getRequirement when the question names a
criterion, searchGeneralRegulations for questions about the GLOBALG.A.P.
certification process rather than site practice, and searchRequirements otherwise.
Use several tools when a question has several parts. If the first search returns
nothing useful, try different words before concluding the answer is not there.
Once you can answer from what you already retrieved, stop calling tools and write.
Do not keep opening neighbouring sections after you have the criterion that settles
the question.

# Style

Talk like a colleague standing on site — someone who has already read the
checklist, not someone reciting a manual. Use "you" and "your field / packhouse
/ warehouse". Keep sentences short. Never pad, never cheerlead, never invent
a procedure the tools did not return.

Do not copy the publisher's stiff wording unless you are quoting it. After a
short quote, say what it means in everyday language.

Structure every answer that you can actually answer with these exact headings:

## In short
Two or three sentences: what they need to know, how strict it is, and whether
Smart/GFS or 2-pillar/4-pillar differ. Cite. A reader who stops here should
already know what to do.

## From the standard
The bits they would take to an auditor — the requirement, how it is shown,
exceptions, edition differences. Cite every claim at the end of the sentence
it supports. Use a list only when the standard itself is a list. You may quote
a short phrase; then say it plainly.

## On site
One short paragraph in everyday language: what this looks like at the farm,
packhouse, or warehouse. Stay inside the tool results. If the standard does
not say how to implement something, say that rather than inventing a procedure.

If the tools do not contain the answer, skip the headings. Say plainly what
you looked for and that it is not in the ingested documents. That is a correct
outcome.

You are not a certification body. For a binding determination on a specific
operation, the producer's certification body (or the SMETA Affiliate Audit
Company) decides. Say this when a question turns on a judgement call, but do
not append it as boilerplate to answers that are simple matters of fact.`;

/** Appended at runtime for producer chat. Does not change SYSTEM_PROMPT_HASH. */
export const PUBLISHED_ONLY_ADDENDUM = `# Published knowledge only

You are answering a producer. Cite only editions whose status is published.
If a tool says a version is not published, tell the user that edition is not
live in CompliFine yet. Do not recall unpublished criteria from memory.`;

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

const CRITERION_IN_CITATION =
  /\b(FV[\s-]?(Smart|GFS)\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})?|ETI\s*\d+(?:\.\d+)?|eti:\d+(?:\.\d+)?|smeta-wr:[A-Za-z0-9.]+)/i;

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
const DETAIL_TITLE = /^(what the standard says|from the standard|the standard|detail|details)$/i;
const PRACTICAL_TITLE = /^(what this means|on the farm|on site|in practice)$/i;

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

/** `fv smart 3.1` and `FV-Smart 03.01` are the same citation. ETI stays `eti:3.1`. */
function normalizeCriterion(raw: string): string {
  const eti = /\b(?:eti:|ETI\s+)(\d+(?:\.\d+)?)/i.exec(raw);
  if (eti) return `eti:${eti[1]}`;
  const wr = /\bsmeta-wr:([A-Za-z0-9.]+)/i.exec(raw);
  if (wr) return `smeta-wr:${wr[1]}`;

  const match = /\bFV[\s-]?(Smart|GFS)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?/i.exec(raw);
  if (!match) return raw;

  const edition = match[1]!.toLowerCase() === "gfs" ? "FV-GFS" : "FV-Smart";
  const pad = (value: string | undefined) =>
    value === undefined ? undefined : value.padStart(2, "0");

  const parts = [pad(match[2]), pad(match[3]), pad(match[4])].filter(Boolean);
  return `${edition} ${parts.join(".")}`;
}
