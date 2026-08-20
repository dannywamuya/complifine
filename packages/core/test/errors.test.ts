import { describe, expect, test } from "bun:test";
import {
  CompliFineError,
  describeError,
  IntegrityError,
  ParseError,
  QualityGateError,
  SourceFetchError,
} from "../src/errors.ts";
import { contentHash, sha256, shortHash } from "../src/hash.ts";

describe("errors", () => {
  test("carry a stable machine-readable code", () => {
    expect(new SourceFetchError("boom").code).toBe("SOURCE_FETCH_FAILED");
    expect(new IntegrityError("boom").code).toBe("INTEGRITY_MISMATCH");
    expect(new QualityGateError("boom").code).toBe("QUALITY_GATE_FAILED");
  });

  test("are instances of Error and of the shared base", () => {
    const error = new ParseError("bad row");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CompliFineError);
    expect(error.name).toBe("ParseError");
  });

  // Context is what makes an ingestion failure debuggable without re-running it.
  test("preserve the source location that failed", () => {
    const error = new ParseError("level not recognised", {
      document: "IFA v6 Smart checklist",
      sheet: "PI",
      cell: "I42",
      row: 42,
    });
    expect(error.context.location).toEqual({
      document: "IFA v6 Smart checklist",
      sheet: "PI",
      cell: "I42",
      row: 42,
    });
  });

  test("context is frozen so a handler cannot mutate the record of what failed", () => {
    const error = new SourceFetchError("boom", { url: "https://example.com" });
    expect(Object.isFrozen(error.context)).toBe(true);
  });

  test("serialize to JSON with code, message and context", () => {
    const json = new IntegrityError("hash mismatch", { expected: "abc", actual: "def" }).toJSON();
    expect(json.code).toBe("INTEGRITY_MISMATCH");
    expect(json.message).toBe("hash mismatch");
    expect(json.context).toEqual({ expected: "abc", actual: "def" });
  });

  test("retain the underlying cause", () => {
    const cause = new Error("ECONNRESET");
    const error = new SourceFetchError("download failed", { url: "u" }, { cause });
    expect(error.cause).toBe(cause);
    expect(error.toJSON().cause).toBe("ECONNRESET");
  });
});

describe("describeError", () => {
  test("renders a CompliFine error with its code and context on one line", () => {
    expect(describeError(new IntegrityError("hash mismatch", { expected: "abc" }))).toBe(
      '[INTEGRITY_MISMATCH] hash mismatch {"expected":"abc"}',
    );
  });

  test("omits an empty context", () => {
    expect(describeError(new IntegrityError("hash mismatch"))).toBe(
      "[INTEGRITY_MISMATCH] hash mismatch",
    );
  });

  test("handles plain errors and non-error throws", () => {
    expect(describeError(new TypeError("nope"))).toBe("TypeError: nope");
    expect(describeError("a string")).toBe("a string");
    expect(describeError(undefined)).toBe("undefined");
  });
});

describe("hashing", () => {
  // The empty-string SHA-256 is a well-known constant; if this changes, the
  // hashing has silently changed and every stored file hash is invalidated.
  test("sha256 matches the reference value for the empty string", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("sha256 accepts strings, Uint8Array and ArrayBuffer identically", () => {
    const text = "GLOBALG.A.P.";
    const bytes = new TextEncoder().encode(text);
    expect(sha256(bytes)).toBe(sha256(text));
    expect(sha256(bytes.buffer as ArrayBuffer)).toBe(sha256(text));
  });

  test("sha256 is sensitive to a single byte change", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  test("contentHash is stable and 32 hex characters", () => {
    const hash = contentHash("some chunk text");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(contentHash("some chunk text")).toBe(hash);
    expect(contentHash("different text")).not.toBe(hash);
  });

  test("shortHash truncates for display", () => {
    expect(shortHash(sha256("x"))).toHaveLength(12);
    expect(shortHash(sha256("x"), 8)).toHaveLength(8);
  });
});
