/**
 * Company file storage under STORAGE_ROOT.
 *
 * Kept apart from the knowledge tree (`storage/<publisher>/…`) so a company
 * upload can never be mistaken for, or overwrite, a published source. Files are
 * content-addressed per organisation: identical bytes are stored once and the
 * stored file always hashes to the `file_hash` recorded for it.
 */

import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sha256 } from "@complifine/core";
import { storageRoot } from "@complifine/ingestion";

export type OrgFileKind = "evidence" | "captures";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

const BY_FILENAME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  webm: "audio/webm",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

/**
 * Browsers report CSV and some audio inconsistently, so trust a known
 * extension when the declared type is generic.
 */
export function normaliseMime(declared: string, filename: string): string | null {
  const base = declared.split(";")[0]!.trim().toLowerCase();
  if (EXTENSIONS[base]) return base;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return BY_FILENAME[ext] ?? null;
}

export function isAudio(mime: string): boolean {
  return mime.startsWith("audio/");
}

export function maxBytesFor(mime: string): number {
  return isAudio(mime) ? MAX_AUDIO_BYTES : MAX_DOCUMENT_BYTES;
}

export interface StoredOrgFile {
  readonly key: string;
  readonly hash: string;
  readonly byteSize: number;
  readonly written: boolean;
}

export async function storeOrgFile(
  orgId: string,
  kind: OrgFileKind,
  mime: string,
  bytes: Uint8Array,
): Promise<StoredOrgFile> {
  const hash = sha256(bytes);
  const extension = EXTENSIONS[mime] ?? "bin";
  const key = `orgs/${orgId}/${kind}/${hash}.${extension}`;
  const absolute = join(storageRoot(), key);
  try {
    const existing = await stat(absolute);
    return { key, hash, byteSize: existing.size, written: false };
  } catch {
    await mkdir(dirname(absolute), { recursive: true });
    await Bun.write(absolute, bytes);
    return { key, hash, byteSize: bytes.byteLength, written: true };
  }
}

export async function readOrgFile(key: string): Promise<Uint8Array> {
  if (!key.startsWith("orgs/")) throw new Error("Not a company file");
  const file = Bun.file(join(storageRoot(), key));
  return new Uint8Array(await file.arrayBuffer());
}
