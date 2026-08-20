/**
 * The controlled vocabulary of the compliance knowledge layer.
 *
 * Every value here mirrors something the source publisher actually says. Where
 * CompliFine invents a concept (job status, review decision) it is marked as
 * such. The distinction matters: source-derived values are immutable facts we
 * must preserve, CompliFine values are ours to evolve.
 */

// ---------------------------------------------------------------------------
// Source hierarchy (PRD section 17)
// ---------------------------------------------------------------------------

/**
 * Authority levels, lowest number = highest authority.
 *
 * The rule this encodes: a lower-authority document must never silently
 * override a higher-authority one. A consultant's interpretation (level 7)
 * cannot contradict the published P&Cs (level 1). Enforced at query time in
 * the retrieval layer, not merely documented.
 */
export const AUTHORITY_LEVELS = {
  /** Official standard documents: the principles and criteria themselves. */
  OFFICIAL_STANDARD: 1,
  /** Official certification rules: the GLOBALG.A.P. general regulations. */
  OFFICIAL_REGULATIONS: 2,
  /** Official checklists used by CB auditors and for self-assessment. */
  OFFICIAL_CHECKLIST: 3,
  /** Official guidance and implementation documents. Recommendations, not rules. */
  OFFICIAL_GUIDANCE: 4,
  /** Official updates: technical news, transition tools, summaries of changes. */
  OFFICIAL_UPDATE: 5,
  /** Certification body guidance. Authoritative for that CB's clients only. */
  CB_GUIDANCE: 6,
  /** Company interpretation and implementation practice. */
  COMPANY_PRACTICE: 7,
  /** AI-generated interpretation. Never authoritative, always attributed. */
  AI_INTERPRETATION: 8,
} as const;

export type AuthorityLevel =
  (typeof AUTHORITY_LEVELS)[keyof typeof AUTHORITY_LEVELS];

export const AUTHORITY_LEVEL_LABELS: Record<AuthorityLevel, string> = {
  1: "Official standard",
  2: "Official regulations",
  3: "Official checklist",
  4: "Official guidance",
  5: "Official update",
  6: "Certification body guidance",
  7: "Company practice",
  8: "AI interpretation",
};

/**
 * Only these levels may be cited as the basis for a compliance requirement.
 * Guidance (4) is explicitly excluded: the IFA guideline states on its own
 * cover page that it "is a recommendation for consideration".
 */
export const NORMATIVE_AUTHORITY_LEVELS: readonly AuthorityLevel[] = [1, 2, 3];

export function isNormative(level: AuthorityLevel): boolean {
  return NORMATIVE_AUTHORITY_LEVELS.includes(level);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  "principles_and_criteria",
  "checklist",
  "general_regulations",
  "guidance",
  "update",
  "transition_tool",
  "third_party_summary",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  principles_and_criteria: "Principles & Criteria",
  checklist: "Checklist",
  general_regulations: "General Regulations",
  guidance: "Guidance",
  update: "Official update",
  transition_tool: "Transition tool",
  third_party_summary: "Third-party summary",
};

/** The default authority level implied by a document type. Overridable per document. */
export const DOCUMENT_TYPE_AUTHORITY: Record<DocumentType, AuthorityLevel> = {
  principles_and_criteria: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
  checklist: AUTHORITY_LEVELS.OFFICIAL_CHECKLIST,
  general_regulations: AUTHORITY_LEVELS.OFFICIAL_REGULATIONS,
  guidance: AUTHORITY_LEVELS.OFFICIAL_GUIDANCE,
  update: AUTHORITY_LEVELS.OFFICIAL_UPDATE,
  transition_tool: AUTHORITY_LEVELS.OFFICIAL_UPDATE,
  third_party_summary: AUTHORITY_LEVELS.CB_GUIDANCE,
};

export const DOCUMENT_STATUSES = [
  "registered",
  "fetched",
  "parsed",
  "failed",
  "superseded",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Requirement levels (PRD section 10)
// ---------------------------------------------------------------------------

/**
 * GLOBALG.A.P. grades every criterion at one of three levels. The source
 * spells "Recommendation" as "Recom." in the checklist XLSX `Level` table; we
 * normalize the label but keep the source spelling in `sourceLabel`.
 *
 * Deliberately NOT hard-coded into scoring logic (PRD section 10): the
 * compliance engine reads thresholds from configuration, because the meaning
 * of these levels is a certification rule that can change, not a law of nature.
 */
export const REQUIREMENT_LEVELS = [
  "major_must",
  "minor_must",
  "recommendation",
] as const;

export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export const REQUIREMENT_LEVEL_LABELS: Record<RequirementLevel, string> = {
  major_must: "Major Must",
  minor_must: "Minor Must",
  recommendation: "Recommendation",
};

/**
 * Every spelling of a level observed across the official Smart checklist, the
 * GFS checklist and the HPSS transition tool. Matched case-insensitively after
 * whitespace collapse.
 */
const LEVEL_ALIASES: Record<string, RequirementLevel> = {
  "major must": "major_must",
  majormust: "major_must",
  major: "major_must",
  "minor must": "minor_must",
  minormust: "minor_must",
  minor: "minor_must",
  "recom.": "recommendation",
  recom: "recommendation",
  recommendation: "recommendation",
  rec: "recommendation",
};

/**
 * Parse a level label from source data.
 *
 * Returns null rather than throwing or guessing. An unrecognised level is a
 * reconciliation failure that must surface to a human, never a silent default:
 * misclassifying a Major Must as a Recommendation would understate an audit
 * blocker.
 */
export function parseRequirementLevel(
  raw: string | null | undefined,
): RequirementLevel | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return LEVEL_ALIASES[key] ?? LEVEL_ALIASES[key.replace(/\s/g, "")] ?? null;
}

// ---------------------------------------------------------------------------
// Editions
// ---------------------------------------------------------------------------

/**
 * IFA v6 ships as two parallel, equally valid editions. They are NOT
 * interchangeable (PRD section 8) and are modelled as separate standard
 * versions with their own documents, requirements and checklists.
 */
export const EDITIONS = ["smart", "gfs"] as const;
export type Edition = (typeof EDITIONS)[number];

export const EDITION_LABELS: Record<Edition, string> = {
  smart: "Smart",
  gfs: "GFS",
};

/** The prefix GLOBALG.A.P. uses in criterion identifiers for each edition. */
export const EDITION_ID_PREFIX: Record<Edition, string> = {
  smart: "FV-Smart",
  gfs: "FV-GFS",
};

// ---------------------------------------------------------------------------
// Knowledge lifecycle (PRD sections 24, 56)
// ---------------------------------------------------------------------------

/**
 * The publication state machine for a standard version. A version only becomes
 * usable product knowledge at `published`, and only after every quality gate
 * passes.
 */
export const VERSION_STATUSES = [
  "draft",
  "ingesting",
  "extracted",
  "validation",
  "review",
  "approved",
  "published",
  "retired",
] as const;

export type VersionStatus = (typeof VERSION_STATUSES)[number];

/**
 * Legal transitions. Encoded as data so the API, the CLI and the admin UI all
 * enforce the same machine rather than each reimplementing it.
 */
export const VERSION_TRANSITIONS: Record<VersionStatus, readonly VersionStatus[]> = {
  draft: ["ingesting"],
  ingesting: ["extracted", "draft"],
  extracted: ["validation", "ingesting"],
  validation: ["review", "extracted"],
  review: ["approved", "validation"],
  approved: ["published", "review"],
  published: ["retired"],
  retired: [],
};

export function canTransition(from: VersionStatus, to: VersionStatus): boolean {
  return VERSION_TRANSITIONS[from].includes(to);
}

/** Requirement lifecycle. Only `published` requirements are authoritative. */
export const REQUIREMENT_STATUSES = [
  "draft",
  "extracted",
  "under_review",
  "approved",
  "published",
  "retired",
] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Ingestion jobs (PRD section 46)
// ---------------------------------------------------------------------------

export const JOB_STAGES = [
  "registry",
  "fetch",
  "parse",
  "normalize",
  "reconcile",
  "chunk",
  "embed",
  "publish",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_STATUSES = [
  "queued",
  "processing",
  "failed",
  "awaiting_review",
  "approved",
  "published",
  "succeeded",
  "skipped",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// ---------------------------------------------------------------------------
// Applicability
// ---------------------------------------------------------------------------

/**
 * GLOBALG.A.P.'s scoping questions are answered yes/no, plus an unanswered
 * state. The checklist uses "-" for unanswered, which we model explicitly
 * rather than as null so "not yet asked" is distinguishable from "no".
 */
export const SCOPING_ANSWERS = ["yes", "no", "unanswered"] as const;
export type ScopingAnswer = (typeof SCOPING_ANSWERS)[number];

/**
 * Where an applicability rule came from. Official rules are extracted from the
 * checklist's own S2PQ tables; authored rules are ones CompliFine adds later.
 * Keeping them distinguishable prevents our inferences masquerading as the
 * publisher's.
 */
export const APPLICABILITY_SOURCES = [
  "globalgap_official",
  "complifine_authored",
  "ai_proposed",
] as const;

export type ApplicabilitySource = (typeof APPLICABILITY_SOURCES)[number];

// ---------------------------------------------------------------------------
// Chunking and retrieval
// ---------------------------------------------------------------------------

export const CHUNK_TYPES = ["requirement", "section", "table"] as const;
export type ChunkType = (typeof CHUNK_TYPES)[number];

// ---------------------------------------------------------------------------
// Requirement relationships (PRD section 44)
// ---------------------------------------------------------------------------

export const RELATIONSHIP_TYPES = [
  "unchanged",
  "modified_to",
  "replaced_by",
  "split_into",
  "merged_from",
  "equivalent_to",
  "related_to",
  "overlaps_with",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_ORIGINS = [
  "source_declared",
  "deterministic_match",
  "ai_proposed",
  "human_asserted",
] as const;

export type RelationshipOrigin = (typeof RELATIONSHIP_ORIGINS)[number];

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const REVIEW_DECISIONS = ["approved", "rejected", "changes_requested"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
