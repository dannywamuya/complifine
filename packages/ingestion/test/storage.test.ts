import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetEnvCache } from "@complifine/core";
import {
  readStoredFile,
  sha256,
  storageRoot,
  storeSourceFile,
  storageUsage,
  storedFilePath,
  verifyStoredFile,
} from "../src/storage.ts";

// The storage layer reads STORAGE_ROOT through the env loader, so the tests
// redirect it at a temporary directory rather than writing into the real one.
let root: string;
let previous: string | undefined;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "complifine-storage-"));
  previous = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = root;
  resetEnvCache();
});

afterAll(async () => {
  if (previous === undefined) delete process.env.STORAGE_ROOT;
  else process.env.STORAGE_ROOT = previous;
  resetEnvCache();
  await rm(root, { recursive: true, force: true });
});

const bytes = (text: string) => new TextEncoder().encode(text);

const params = (content: string) => ({
  standardSlug: "globalgap-ifa",
  scopeSlug: "fruit-and-vegetables",
  versionSlug: "ifa-v6-smart-fv",
  extension: "pdf",
  bytes: bytes(content),
});

describe("sha256", () => {
  test("matches the known digest of the empty input", () => {
    expect(sha256(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("is stable and content-dependent", () => {
    expect(sha256(bytes("a"))).toBe(sha256(bytes("a")));
    expect(sha256(bytes("a"))).not.toBe(sha256(bytes("b")));
  });
});

describe("storeSourceFile", () => {
  test("writes under a path derived from the content hash", async () => {
    const stored = await storeSourceFile(params("first revision"));

    expect(stored.hash).toBe(sha256(bytes("first revision")));
    expect(stored.key).toContain("globalgap-ifa/fruit-and-vegetables/ifa-v6-smart-fv/source");
    expect(stored.key).toContain(stored.hash);
    expect(stored.key.endsWith(".pdf")).toBe(true);
    expect(stored.written).toBe(true);
    expect(storedFilePath(stored.key)).toBe(join(storageRoot(), stored.key));
  });

  // Re-fetching an unchanged document must not rewrite it: an interrupted
  // write over a good file is the one way content-addressed storage can lose
  // data, and there is no reason to take the risk.
  test("is a no-op when the identical bytes are already stored", async () => {
    const first = await storeSourceFile(params("stable content"));
    const second = await storeSourceFile(params("stable content"));

    expect(second.key).toBe(first.key);
    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
  });

  // Two revisions of a document are published under the same filename. Keying
  // on the name would let the newer one destroy the older.
  test("keeps two revisions of the same document side by side", async () => {
    const v1 = await storeSourceFile(params("September 2022 revision"));
    const v2 = await storeSourceFile(params("April 2025 revision"));

    expect(v1.key).not.toBe(v2.key);
    expect(new TextDecoder().decode(await readStoredFile(v1.key))).toBe("September 2022 revision");
    expect(new TextDecoder().decode(await readStoredFile(v2.key))).toBe("April 2025 revision");
  });

  test("round-trips bytes exactly", async () => {
    const payload = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x0a]);
    const stored = await storeSourceFile({ ...params(""), bytes: payload });
    expect([...(await readStoredFile(stored.key))]).toEqual([...payload]);
  });
});

describe("readStoredFile", () => {
  test("names the recovery command when a file has gone missing", async () => {
    await expect(readStoredFile("globalgap-ifa/nope/source/deadbeef.pdf")).rejects.toThrow(
      /kb fetch/,
    );
  });
});

describe("verifyStoredFile", () => {
  test("confirms an untouched file", async () => {
    const stored = await storeSourceFile(params("verified content"));
    expect(await verifyStoredFile(stored.key, stored.hash)).toBe(true);
  });

  // The point of recording a hash is to detect the file changing underneath
  // us - disk corruption, or a well-meaning edit to a "source" document.
  test("detects a file that has been edited since it was recorded", async () => {
    const stored = await storeSourceFile(params("original content"));
    await writeFile(storedFilePath(stored.key), "tampered");
    expect(await verifyStoredFile(stored.key, stored.hash)).toBe(false);
  });

  test("reports false rather than throwing for a missing file", async () => {
    expect(await verifyStoredFile("missing/file.pdf", "0".repeat(64))).toBe(false);
  });
});

describe("storageUsage", () => {
  test("counts every file beneath the root", async () => {
    const usage = await storageUsage();
    expect(usage.files).toBeGreaterThan(0);
    expect(usage.bytes).toBeGreaterThan(0);
  });
});
