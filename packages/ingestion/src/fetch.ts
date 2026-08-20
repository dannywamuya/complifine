/**
 * Fetching official source documents.
 *
 * Politeness and reproducibility both matter here. We identify ourselves, we
 * retry with backoff rather than hammering, we fall back to the publisher's
 * own mirror before giving up, and we compare content hashes so that a
 * re-fetch of unchanged material costs one HEAD request rather than a
 * megabyte of transfer.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { env } from "@complifine/core";
import { sha256 } from "./storage.ts";

export interface FetchResult {
  readonly bytes: Uint8Array;
  readonly hash: string;
  readonly byteSize: number;
  readonly mimeType: string | null;
  readonly lastModified: Date | null;
  readonly etag: string | null;
  /** The URL that actually served the bytes: primary, mirror, or a file path. */
  readonly resolvedFrom: string;
}

export interface HeadResult {
  readonly ok: boolean;
  readonly status: number;
  readonly byteSize: number | null;
  readonly lastModified: Date | null;
  readonly etag: string | null;
  readonly mimeType: string | null;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const TIMEOUT_MS = 60_000;

function headers(): Record<string, string> {
  return {
    "User-Agent": env().FETCH_USER_AGENT,
    Accept: "application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
  };
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Metadata-only request.
 *
 * `Last-Modified` and `Content-Length` from documents.globalgap.org are stable
 * and accurate, which makes a HEAD sweep a cheap way to detect that a document
 * changed without downloading anything.
 */
export async function headDocument(url: string): Promise<HeadResult> {
  const response = await fetch(url, {
    method: "HEAD",
    headers: headers(),
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const length = response.headers.get("content-length");

  return {
    ok: response.ok,
    status: response.status,
    byteSize: length ? Number.parseInt(length, 10) : null,
    lastModified: parseDate(response.headers.get("last-modified")),
    etag: response.headers.get("etag"),
    mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() ?? null,
  };
}

/**
 * The document centre answers some requests with an OpenCms redirect
 * descriptor served as an XML body under HTTP 200, rather than with a real
 * 3xx. `fetch` cannot follow that, so a naive client stores 400 bytes of XML
 * where it expected a PDF.
 *
 * Returns the target filename when the body is one of these descriptors.
 */
export function parseOpenCmsRedirect(bytes: Uint8Array): string | null {
  // Cheap guard: only inspect bodies small enough to be a descriptor.
  if (bytes.byteLength > 8192) return null;

  const text = new TextDecoder().decode(bytes);
  if (!text.includes("<RedirectPages")) return null;

  const target = /<target><!\[CDATA\[([^\]]+)\]\]><\/target>/.exec(text)?.[1];
  if (!target) return null;

  // The descriptor gives an internal CMS path; only the filename is portable
  // to the public document URL.
  return target.split("/").pop() ?? null;
}

/**
 * Download a document, retrying transient failures and falling back to the
 * mirror. Retries only on 5xx, 408 and 429 - a 404 means the manifest is wrong
 * and repeating the request will not fix it.
 */
export async function fetchDocument(
  url: string,
  options: { mirrorUrl?: string | null; followedRedirect?: boolean } = {},
): Promise<FetchResult> {
  const candidates = [url, ...(options.mirrorUrl ? [options.mirrorUrl] : [])];
  const failures: string[] = [];

  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(candidate, {
          headers: headers(),
          redirect: "follow",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!response.ok) {
          const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
          failures.push(`${candidate} -> HTTP ${response.status}`);
          if (!retryable) break;
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0) {
          failures.push(`${candidate} -> empty body`);
          await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }

        // Follow the document centre's XML redirect descriptor, once. One hop
        // only: their descriptors sometimes point at deleted blobs, and a
        // chain would be a loop waiting to happen.
        const redirectTarget = parseOpenCmsRedirect(bytes);
        if (redirectTarget && !options.followedRedirect) {
          const base = candidate.slice(0, candidate.lastIndexOf("/") + 1);
          return fetchDocument(`${base}${encodeURIComponent(redirectTarget)}`, {
            mirrorUrl: options.mirrorUrl,
            followedRedirect: true,
          });
        }
        if (redirectTarget) {
          failures.push(
            `${candidate} -> redirects to "${redirectTarget}", which is not retrievable either`,
          );
          break;
        }

        return {
          bytes,
          hash: sha256(bytes),
          byteSize: bytes.byteLength,
          mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() ?? null,
          lastModified: parseDate(response.headers.get("last-modified")),
          etag: response.headers.get("etag"),
          resolvedFrom: candidate,
        };
      } catch (error) {
        failures.push(`${candidate} -> ${(error as Error).message}`);
        if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(`Failed to fetch ${url}. Attempts:\n  ${failures.join("\n  ")}`);
}

/**
 * Load a document supplied on disk rather than downloaded.
 *
 * Some official material is not published for download - certification body
 * extranet checklists, for instance. Those enter through the same pipeline and
 * get the same hashing and provenance; only the acquisition step differs.
 */
export async function loadLocalDocument(path: string, baseDir: string): Promise<FetchResult> {
  const absolute = isAbsolute(path) ? path : resolve(baseDir, path);
  const buffer = await readFile(absolute);
  const bytes = new Uint8Array(buffer);

  return {
    bytes,
    hash: sha256(bytes),
    byteSize: bytes.byteLength,
    mimeType: guessMimeType(absolute),
    lastModified: null,
    etag: null,
    resolvedFrom: `file://${absolute}`,
  };
}

function guessMimeType(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".csv")) return "text/csv";
  return null;
}

/**
 * Confirm the bytes really are the format the manifest claims.
 *
 * A silent HTML error page saved as `.pdf` is a classic ingestion failure, and
 * one that would otherwise surface much later as an inexplicable parse error.
 */
export function validateMagicBytes(bytes: Uint8Array, extension: string): void {
  const head = Array.from(bytes.slice(0, 4));
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK, the container for xlsx/docx

  const expectation: Record<string, boolean> = {
    pdf: isPdf,
    xlsx: isZip,
    docx: isZip,
  };

  const expected = expectation[extension.toLowerCase()];
  if (expected === undefined) return;

  if (!expected) {
    const preview = new TextDecoder().decode(bytes.slice(0, 120)).replace(/\s+/g, " ");
    throw new Error(
      `Downloaded content is not a valid .${extension} file. First bytes: "${preview}". ` +
        `This usually means the origin served an error page instead of the document.`,
    );
  }
}
