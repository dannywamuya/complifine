/**
 * The evaluation suite.
 *
 * Every expectation in this file was read out of the ingested database, not
 * recalled or inferred. Criterion numbers, requirement levels, the 95% Minor
 * Must threshold, the 10% unannounced audit probability, the 48-hour notice
 * period, the fourteen level escalations between Smart and GFS, the single
 * GFS-only criterion - each was verified against the source before being
 * written down. An eval suite whose ground truth is itself a guess measures
 * nothing.
 *
 * The cases are chosen to break the system in specific ways rather than to
 * flatter it:
 *
 *   - **paraphrase** cases never use the standard's own vocabulary, because
 *     producers do not. "When can workers go back in the field after spraying"
 *     shares no content word with "re-entry times", so lexical search alone
 *     cannot answer it and the semantic half has to earn its place.
 *   - **level** cases include Recommendations, where the failure mode is
 *     answering that something is required when it is not. A system that says
 *     "yes, you must" to everything scores well on recall and is dangerous.
 *   - **refusal** cases have no answer in the corpus at all. They are scored
 *     on whether the system declines. Without them, every metric here rewards
 *     confident fabrication.
 */

export type EvalCategory =
  | "identifier"
  | "paraphrase"
  | "level"
  | "cross_edition"
  | "regulations"
  | "applicability"
  | "refusal";

export interface EvalCase {
  readonly id: string;
  readonly category: EvalCategory;
  readonly question: string;
  /** Restrict retrieval to one edition, when the question implies one. */
  readonly versionCode?: string;

  /** Criterion numbers a correct retrieval must surface. */
  readonly expectedCriteria?: readonly string[];
  /**
   * Substrings that must appear in the heading of a retrieved chunk. Used for
   * General Regulations clauses, which have no criterion number.
   */
  readonly expectedHeadings?: readonly string[];

  /** Case-insensitive substrings a correct answer must contain. */
  readonly expectedPhrases?: readonly string[];
  /**
   * Substrings a correct answer must NOT contain. These encode the specific
   * wrong answer each case is designed to catch.
   */
  readonly forbiddenPhrases?: readonly string[];

  /** True when the only correct behaviour is to decline. */
  readonly expectRefusal?: boolean;

  /**
   * Whether the retrieval suite should score this case.
   *
   * Defaults to true whenever expectedCriteria or expectedHeadings are set.
   * Set false for questions the agent answers via a dedicated tool
   * (`compareEditions`, `filterChecklist`) rather than via search: scoring
   * those against hybrid retrieval measures the wrong component and produces
   * a failure that looks like a search regression.
   */
  readonly scoreRetrieval?: boolean;

  /** Why this case exists, when it is not obvious. */
  readonly rationale?: string;
}

export const EVAL_CASES: readonly EvalCase[] = [
  // -------------------------------------------------------------------------
  // Identifier lookup - the query names a criterion outright.
  // -------------------------------------------------------------------------
  {
    id: "id-reentry",
    category: "identifier",
    question: "What does FV-Smart 32.10.06 require?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 32.10.06"],
    expectedPhrases: ["re-entry"],
  },
  {
    id: "id-record-retention",
    category: "identifier",
    question: "FV-Smart 01.02",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 01.02"],
    expectedPhrases: ["two years"],
  },
  {
    id: "id-bare-number",
    category: "identifier",
    question: "Explain 30.05.04 for me.",
    expectedCriteria: ["FV-Smart 30.05.04", "FV-GFS 30.05.04"],
    expectedPhrases: ["drinking water"],
    rationale:
      "A bare number with no edition prefix. Must resolve to both editions rather than " +
      "silently picking one, because picking the wrong one gives a producer the wrong number.",
  },
  {
    id: "id-sewage-sludge",
    category: "identifier",
    question: "What is FV-Smart 29.03.03?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 29.03.03"],
    expectedPhrases: ["sewage sludge", "prohibit"],
  },
  {
    id: "id-lowercase-spacing",
    category: "identifier",
    question: "what does fv smart 20.04.02 say",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 20.04.02"],
    expectedPhrases: ["drinking water"],
    rationale: "Same criterion, written the way someone actually types it.",
  },

  // -------------------------------------------------------------------------
  // Paraphrase - the question shares little or no vocabulary with the source.
  // -------------------------------------------------------------------------
  {
    id: "para-water-testing",
    category: "paraphrase",
    question: "Do I need to test my irrigation water?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 30.05.01"],
    expectedPhrases: ["risk assessment"],
  },
  {
    id: "para-record-keeping",
    category: "paraphrase",
    question: "How long do I have to keep my paperwork for?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 01.02"],
    expectedPhrases: ["two years"],
  },
  {
    id: "para-reentry",
    category: "paraphrase",
    question: "When can my workers go back into a field after we have sprayed it?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 32.10.06"],
    rationale:
      "Shares no content word with 're-entry times after plant protection product " +
      "application'. Lexical search cannot reach this; the semantic half must.",
  },
  {
    id: "para-human-waste",
    category: "paraphrase",
    question: "Can I spread treated human waste from the municipality on my fields as fertilizer?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 29.03.03"],
    expectedPhrases: ["prohibit"],
    forbiddenPhrases: ["permitted", "allowed if"],
  },
  {
    id: "para-empty-containers",
    category: "paraphrase",
    question: "What am I supposed to do with empty pesticide drums once they are finished?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 32.04.01", "FV-Smart 32.04.03", "FV-Smart 32.04.04"],
    expectedPhrases: ["triple rinse"],
  },
  {
    id: "para-toilets",
    category: "paraphrase",
    question: "Does the standard say anything about toilets in the field?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 19.05"],
  },
  {
    id: "para-first-aid",
    category: "paraphrase",
    question: "Do I need somebody on site who knows first aid?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 20.02.04"],
  },
  {
    id: "para-mrl-exceedance",
    category: "paraphrase",
    question: "A residue test came back above the legal limit. What does the standard expect?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 32.07.05"],
    expectedPhrases: ["action plan"],
  },
  {
    id: "para-self-assessment",
    category: "paraphrase",
    question: "Do I have to audit myself, or does the certification body do all of it?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 01.03"],
    expectedPhrases: ["self-assessment"],
  },
  {
    id: "para-smoking",
    category: "paraphrase",
    question: "Can my staff have a cigarette while they are working in the packhouse?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 19.04"],
    expectedPhrases: ["designated"],
  },
  {
    id: "para-protected-areas",
    category: "paraphrase",
    question: "I want to clear a piece of wetland on my farm to plant more. Is that a problem?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 22.03.01"],
    expectedPhrases: ["conservation value"],
  },
  {
    id: "para-energy",
    category: "paraphrase",
    question: "Do I have to track how much electricity and diesel the farm gets through?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 23.01"],
  },
  {
    id: "para-recall-test",
    category: "paraphrase",
    question: "How often do I have to practice pulling product back from customers?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 09.01"],
    expectedPhrases: ["annual"],
  },
  {
    id: "para-training-records",
    category: "paraphrase",
    question: "What proof do I need that I have trained my people?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 03.03", "FV-Smart 03.04"],
  },
  {
    id: "para-foreign-bodies",
    category: "paraphrase",
    question: "How do I stop bits of glass or metal ending up in the packed product?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 33.02.01", "FV-Smart 33.02.02"],
    expectedPhrases: ["foreign"],
  },

  // -------------------------------------------------------------------------
  // Levels - the failure mode is saying "required" about a Recommendation.
  // -------------------------------------------------------------------------
  {
    id: "level-biodiversity-enhancement",
    category: "level",
    question: "Is enhancing biodiversity on the farm required for certification?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 22.01.03"],
    expectedPhrases: ["recommendation"],
    forbiddenPhrases: ["is required", "you must", "mandatory"],
    rationale:
      "FV-Smart 22.01.03 is a Recommendation while its neighbours 22.01.01 and 22.01.02 " +
      "are Minor Musts. Answering from the section rather than the criterion gets this wrong.",
  },
  {
    id: "level-water-metrics",
    category: "level",
    question: "Are water management metrics mandatory under IFA v6 Smart?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 30.06.03"],
    expectedPhrases: ["recommendation"],
    forbiddenPhrases: ["mandatory", "is required"],
  },
  {
    id: "level-allergen",
    category: "level",
    question: "What level is the allergen management program requirement?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 21.06"],
    expectedPhrases: ["major must"],
  },
  {
    id: "level-improvement-plan",
    category: "level",
    question: "Is a documented continuous improvement plan a Major Must?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 02.01"],
    expectedPhrases: ["major must"],
  },
  {
    id: "level-ghg",
    category: "level",
    question: "Do I have to reduce my greenhouse gas emissions to get certified?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 24.01"],
    expectedPhrases: ["recommendation"],
    forbiddenPhrases: ["you must", "mandatory"],
  },
  {
    id: "level-drinking-water",
    category: "level",
    question: "Is providing drinking water to workers a Major Must or a Minor Must?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 20.04.02"],
    expectedPhrases: ["major must"],
  },

  // -------------------------------------------------------------------------
  // Cross-edition - Smart and GFS differ, and conflating them is the failure.
  // -------------------------------------------------------------------------
  {
    id: "cross-escalations",
    category: "cross_edition",
    question: "Which criteria are graded more strictly in GFS than in Smart?",
    expectedPhrases: ["01.01", "major must"],
    rationale: "Exactly fourteen criteria escalate from Minor Must to Major Must.",
  },
  {
    id: "cross-gfs-only",
    category: "cross_edition",
    question: "Is there any criterion in the GFS edition that does not exist in Smart?",
    expectedCriteria: ["FV-GFS 33.07.01"],
    scoreRetrieval: false,
    rationale:
      "FV-GFS 33.07.01 is the single GFS-only criterion across 190 and 191. " +
      "Answered by compareEditions, not by searching the question's wording.",
  },
  {
    id: "cross-doc-control",
    category: "cross_edition",
    question: "Is document control a Major Must for a GFS producer?",
    versionCode: "ifa-v6-gfs-fv",
    expectedCriteria: ["FV-GFS 01.01"],
    expectedPhrases: ["major must"],
    forbiddenPhrases: ["minor must"],
    rationale:
      "Minor Must in Smart, Major Must in GFS. Answering from Smart and labelling it GFS " +
      "understates an audit blocker.",
  },
  {
    id: "cross-counts",
    category: "cross_edition",
    question: "How many criteria are there in each edition of IFA v6 for fruit and vegetables?",
    expectedPhrases: ["190", "191"],
  },
  {
    id: "cross-lab-testing",
    category: "cross_edition",
    question: "Compare the laboratory testing requirement between Smart and GFS.",
    expectedCriteria: ["FV-Smart 12.01", "FV-GFS 12.01"],
    expectedPhrases: ["major must", "minor must"],
  },
  {
    id: "cross-postharvest-transition",
    category: "cross_edition",
    question:
      "We are certified to IFA v6 Smart and moving to GFS. What changes for postharvest handling?",
    expectedCriteria: [
      "FV-GFS 33.01.03",
      "FV-GFS 33.03.01",
      "FV-GFS 33.05.01",
      "FV-GFS 33.06.01",
    ],
    scoreRetrieval: false,
    rationale:
      "Four of the fourteen escalations sit in section 33, plus the GFS-only 33.07.01. " +
      "The practically useful answer names them. Answered by compareEditions.",
  },

  // -------------------------------------------------------------------------
  // General Regulations - the certification process, not farm practice.
  // -------------------------------------------------------------------------
  {
    id: "reg-minor-must-threshold",
    category: "regulations",
    question: "What percentage of Minor Musts do I need to comply with?",
    expectedHeadings: ["Certification rules"],
    expectedPhrases: ["95%"],
  },
  {
    id: "reg-major-must-threshold",
    category: "regulations",
    question: "Can I fail a single Major Must and still get certified?",
    expectedHeadings: ["Certification rules"],
    expectedPhrases: ["100%"],
    forbiddenPhrases: ["yes, you can"],
  },
  {
    id: "reg-minor-must-calculation",
    category: "regulations",
    question: "How is the maximum allowable number of Minor Must non-compliances calculated?",
    expectedHeadings: ["Minor Must compliance calculation"],
    expectedPhrases: ["rounded down"],
    rationale:
      "The rounding direction is the whole point: rounding 2.5 up to 3 produces 94% and " +
      "fails the audit. A summary that omits it is worse than no answer.",
  },
  {
    id: "reg-unannounced-probability",
    category: "regulations",
    question: "What are the chances of getting an unannounced audit?",
    expectedHeadings: ["Unannounced CB audits"],
    expectedPhrases: ["10%"],
  },
  {
    id: "reg-unannounced-notice",
    category: "regulations",
    question: "How much notice will I get for an unannounced audit?",
    expectedHeadings: ["Unannounced CB audits"],
    expectedPhrases: ["48 hours"],
  },
  {
    id: "reg-unavailable-days",
    category: "regulations",
    question: "How many days a year can I declare myself unavailable for an unannounced audit?",
    expectedHeadings: ["Unannounced CB audits"],
    expectedPhrases: ["15 days"],
  },
  {
    id: "reg-refuse-unannounced",
    category: "regulations",
    question: "What happens if I turn down an unannounced audit date twice?",
    expectedHeadings: ["Unannounced CB audits"],
    expectedPhrases: ["suspension"],
  },
  {
    id: "reg-certificate-extension",
    category: "regulations",
    question: "Can my certificate be extended past its expiry date?",
    expectedHeadings: ["Certificate validity extension"],
    expectedPhrases: ["4 months"],
    rationale:
      "The trap is the second clause: an already-expired certificate cannot be extended " +
      "at all. An answer that gives the four months without that caveat is misleading.",
  },
  {
    id: "reg-transfer-cb",
    category: "regulations",
    question: "How do I move to a different certification body?",
    expectedHeadings: ["transfers"],
  },
  {
    id: "reg-self-assessment-required",
    category: "regulations",
    question: "Does the certification body require a self-assessment before their audit?",
    expectedHeadings: ["Self-assessments"],
  },

  // -------------------------------------------------------------------------
  // Applicability - resolved from the publisher's rules, never reasoned about.
  // -------------------------------------------------------------------------
  {
    id: "appl-no-ppp",
    category: "applicability",
    question:
      "I do not use any plant protection products at all. How many criteria still apply to me, " +
      "and which ones drop out?",
    versionCode: "ifa-v6-smart-fv",
    expectedPhrases: ["not applicable"],
    rationale:
      "Scoping question 47 excludes 34 criteria in Smart - by far the largest exclusion. " +
      "The count must come from filterChecklist, not from the model counting section 32.",
  },
  {
    id: "appl-questions",
    category: "applicability",
    question: "Which questions determine which parts of the checklist apply to my farm?",
    versionCode: "ifa-v6-smart-fv",
    expectedPhrases: ["subcontractor"],
    rationale: "Sixteen scoping questions in the Smart edition.",
  },
  {
    id: "appl-no-postharvest",
    category: "applicability",
    question: "We sell everything straight from the field with no postharvest handling. What drops out?",
    versionCode: "ifa-v6-smart-fv",
    expectedPhrases: ["postharvest"],
  },
  {
    id: "appl-no-irrigation",
    category: "applicability",
    question: "My crops are entirely rain-fed. Does the water section still apply?",
    versionCode: "ifa-v6-smart-fv",
    expectedCriteria: ["FV-Smart 30.01.01"],
    scoreRetrieval: false,
    rationale:
      "The honest answer is partly: only the irrigation-linked criteria drop out, and the " +
      "food safety water risk assessment still applies. Answered by filterChecklist.",
  },
  {
    id: "appl-na-exempt",
    category: "applicability",
    question: "Can any requirement be marked not applicable, or are some always in scope?",
    versionCode: "ifa-v6-smart-fv",
    expectedPhrases: ["not applicable"],
  },

  // -------------------------------------------------------------------------
  // Refusal - nothing in the corpus answers these.
  // -------------------------------------------------------------------------
  {
    id: "refuse-nonexistent-criterion",
    category: "refusal",
    question: "What does FV-Smart 99.14 require?",
    expectRefusal: true,
    forbiddenPhrases: ["FV-Smart 99.14 requires", "This criterion requires"],
    rationale:
      "There is no section 99. The model must say so rather than synthesise a " +
      "plausible-sounding requirement, which is what it will do if the prompt lets it.",
  },
  {
    id: "refuse-other-standard",
    category: "refusal",
    question: "What does ISO 22000 clause 8.5.2 require for hazard analysis?",
    expectRefusal: true,
    rationale: "A different standard entirely. The knowledge base contains only GLOBALG.A.P. IFA v6.",
  },
  {
    id: "refuse-v5-criterion",
    category: "refusal",
    question: "What did IFA v5 criterion AF 3.1.1 say?",
    expectRefusal: true,
    rationale:
      "v5 is not ingested. This is the case most likely to produce fabrication, because the " +
      "model has seen v5 numbering in training data and it looks like a legitimate question.",
  },
  {
    id: "refuse-prediction",
    category: "refusal",
    question: "Will my farm pass its GLOBALG.A.P. audit next month?",
    expectRefusal: true,
    rationale: "Not a knowledge question. The certification body decides.",
  },
];

// ---------------------------------------------------------------------------

export function casesByCategory(category: EvalCategory): readonly EvalCase[] {
  return EVAL_CASES.filter((testCase) => testCase.category === category);
}

/** Cases the retrieval suite scores: search questions with a known right hit. */
export function retrievalCases(): readonly EvalCase[] {
  return EVAL_CASES.filter((testCase) => {
    if (testCase.scoreRetrieval === false) return false;
    return (
      (testCase.expectedCriteria?.length ?? 0) > 0 ||
      (testCase.expectedHeadings?.length ?? 0) > 0
    );
  });
}
