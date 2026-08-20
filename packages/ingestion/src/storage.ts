/**
 * Content-addressed storage for preserved source documents.
 *
 * The original file is never modified and never overwritten. It is written
 * once under a path derived from its SHA-256, which gives three properties the
 * PRD asks for in section 20 and section 47:
 *
 *   - re-fetching an unchanged document is a no-op, not a rewrite;
 *   - two revisions that reuse the same filename cannot clobber each other;
 *   - the bytes on disk provably match the hash recorded in the database, so
 *     "this is what we ingested" is checkable rather than asserted.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { env, sourceStoragePath } from "@complifine/core";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Absolute path of the storage root, resolved from STORAGE_ROOT. */
export function storageRoot(): string {
  const configured = env().STORAGE_ROOT;
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export interface StoredFile {
  /** Path relative to the storage root. Persisted as `storage_key`. */
  readonly key: string;
  readonly absolutePath: string;
  readonly hash: string;
  readonly byteSize: number;
  /** False when an identical file was already present. */
  readonly written: boolean;
}

export interface StoreParams {
  readonly standardSlug: string;
  readonly scopeSlug: string;
  readonly versionSlug: string;
  readonly stage?: "source" | "parsed" | "normalized";
  readonly extension: string;
  readonly bytes: Uint8Array;
}

export async function storeSourceFile(params: StoreParams): Promise<StoredFile> {
  const hash = sha256(params.bytes);
  const key = sourceStoragePath({
    standardSlug: params.standardSlug,
    scopeSlug: params.scopeSlug,
    versionSlug: params.versionSlug,
    stage: params.stage ?? "source",
    contentHash: hash,
    extension: params.extension,
  });

  const absolutePath = join(storageRoot(), key);

  const existing = await fileSize(absolutePath);
  if (existing !== null) {
    // Same hash means same bytes; writing again would only risk a torn file.
    return { key, absolutePath, hash, byteSize: existing, written: false };
  }

  await mkdir(dirname(absolutePath), { recursive: true });
  await Bun.write(absolutePath, params.bytes);

  return { key, absolutePath, hash, byteSize: params.bytes.byteLength, written: true };
}

export async function readStoredFile(key: string): Promise<Uint8Array> {
  const absolutePath = join(storageRoot(), key);
  const file = Bun.file(absolutePath);
  if (!(await file.exists())) {
    throw new Error(
      `Stored file missing: ${key}. Re-run \`bun run kb fetch\` to restore it from the origin.`,
    );
  }
  return new Uint8Array(await file.arrayBuffer());
}

export function storedFilePath(key: string): string {
  return join(storageRoot(), key);
}

/**
 * Confirm a stored file still hashes to the value recorded for it.
 *
 * Cheap insurance against disk corruption or a well-meaning edit, and the kind
 * of check a certification body would expect a system of record to perform.
 */
export async function verifyStoredFile(key: string, expectedHash: string): Promise<boolean> {
  try {
    return sha256(await readStoredFile(key)) === expectedHash;
  } catch {
    return false;
  }
}

async function fileSize(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** Total bytes held under the storage root. Reported by `kb status`. */
export async function storageUsage(): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        files++;
        const info = await stat(path);
        bytes += info.size;
      }
    }
  }

  await walk(storageRoot());
  return { files, bytes };
}
