/**
 * Typed errors carrying enough context to debug an ingestion failure without
 * re-running it. Every error records where in the source the problem occurred.
 */

/**
 * Where a failure occurred in a source document.
 *
 * Deliberately flat and all-optional, unlike the discriminated `SourceLocation`
 * in `citation.ts`: an error may be raised before we know enough to say whether
 * we are in a PDF or a workbook, and a parse failure must never be masked by a
 * second failure constructing its own error.
 */
export interface ErrorLocation {
  readonly document?: string;
  readonly sheet?: string;
  /** Excel cell reference, e.g. `P&Cs!D42`. */
  readonly cell?: string;
  readonly row?: number;
  readonly page?: number;
  readonly section?: string;
}

export abstract class CompliFineError extends Error {
  abstract readonly code: string;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(message: string, context: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.context = Object.freeze({ ...context });
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

/** A source document could not be downloaded or failed integrity checks. */
export class SourceFetchError extends CompliFineError {
  readonly code = "SOURCE_FETCH_FAILED";
}

/** A document was downloaded but its bytes do not match the pinned hash. */
export class IntegrityError extends CompliFineError {
  readonly code = "INTEGRITY_MISMATCH";
}

/** A document could not be parsed into its expected structure. */
export class ParseError extends CompliFineError {
  readonly code = "PARSE_FAILED";

  constructor(message: string, location: ErrorLocation = {}, options?: ErrorOptions) {
    super(message, { location }, options);
  }
}

/** Extracted data violated an invariant the knowledge base depends on. */
export class ValidationError extends CompliFineError {
  readonly code = "VALIDATION_FAILED";
}

/** A publication quality gate failed. Blocks the approved -> published transition. */
export class QualityGateError extends CompliFineError {
  readonly code = "QUALITY_GATE_FAILED";
}

/** An illegal state machine transition was attempted. */
export class StateTransitionError extends CompliFineError {
  readonly code = "INVALID_STATE_TRANSITION";
}

/**
 * A weaker source was used where an authoritative one is required, for example
 * trying to publish a requirement sourced from a third-party analysis.
 */
export class AuthorityError extends CompliFineError {
  readonly code = "INSUFFICIENT_SOURCE_AUTHORITY";
}

export class ConfigError extends CompliFineError {
  readonly code = "CONFIG_INVALID";
}

export class NotFoundError extends CompliFineError {
  readonly code = "NOT_FOUND";
}

/** Format any thrown value as a readable single line for logs and CLI output. */
export function describeError(error: unknown): string {
  if (error instanceof CompliFineError) {
    const context = Object.keys(error.context).length > 0 ? ` ${JSON.stringify(error.context)}` : "";
    return `[${error.code}] ${error.message}${context}`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
