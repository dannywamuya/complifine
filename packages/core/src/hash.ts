/**
 * Content hashing.
 *
 * PRD section 47 requires every official source file to carry a cryptographic
 * hash so the system can tell a re-publication from a re-download. SHA-256 is
 * used for source files. A shorter non-cryptographic digest is used for chunk
 * deduplication, where the only requirement is a stable content key.
 */

import { createHash } from "node:crypto";

/** Lowercase hex SHA-256 of arbitrary bytes. */
export function sha256(data: Uint8Array | ArrayBuffer | string): string {
  const buffer =
    typeof data === "string"
      ? Buffer.from(data, "utf8")
      : data instanceof ArrayBuffer
        ? Buffer.from(new Uint8Array(data))
        : Buffer.from(data);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Stable content key for a chunk.
 *
 * Used to skip re-embedding text that has not changed, which makes re-running
 * the indexer free. Truncated to 128 bits: collisions are irrelevant for a
 * cache key at this corpus size, and the shorter value keeps the index small.
 */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

/** Short, human-quotable prefix of a hash for logs and UI. */
export function shortHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}
