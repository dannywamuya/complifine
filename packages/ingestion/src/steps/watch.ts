/**
 * Drift detection.
 *
 * A compliance knowledge base decays silently. GLOBALG.A.P. republishes
 * documents without announcement, and a standard that has moved on while your
 * database has not is worse than no database at all - it is confidently wrong.
 *
 * Two complementary checks:
 *
 *   1. HEAD every URL the manifest declares and compare size and ETag against
 *      what we recorded. Cheap, exact, catches revisions of known documents.
 *
 *   2. Re-scrape the publisher's solution pages for document links that the
 *      manifest does not mention. Catches entirely new documents, which the
 *      first check by definition cannot.
 *
 * The second check is why discovery is automated but adoption is not. A new
 * URL is reported, never ingested: deciding that a document belongs in the
 * knowledge base is a judgement about authority, and judgements get reviewed.
 */

import { isNotNull, type Database } from "@complifine/db";
import { standardDocuments } from "@complifine/db";
import { env } from "@complifine/core";
import { headDocument } from "../fetch.ts";
import { MANIFEST, manifestUrls } from "../manifest.ts";

export interface DriftItem {
  readonly slug: string;
  readonly url: string;
  readonly reason: string;
}

export interface DriftReport {
  readonly checked: number;
  readonly changed: readonly DriftItem[];
  readonly unreachable: readonly DriftItem[];
  /** Document URLs found on the publisher's pages but absent from the manifest. */
  readonly undeclared: readonly string[];
}

export async function checkForDrift(db: Database): Promise<DriftReport> {
  const documents = await db
    .select()
    .from(standardDocuments)
    .where(isNotNull(standardDocuments.sourceUrl));

  const changed: DriftItem[] = [];
  const unreachable: DriftItem[] = [];
  let checked = 0;

  for (const document of documents) {
    if (!document.sourceUrl) continue;
    checked++;

    try {
      const head = await headDocument(document.sourceUrl);

      if (!head.ok) {
        unreachable.push({
          slug: document.slug,
          url: document.sourceUrl,
          reason: `HTTP ${head.status}`,
        });
        continue;
      }

      // Never fetched: not drift, just work outstanding.
      if (!document.fileHash) continue;

      const reasons: string[] = [];
      if (head.etag && document.etag && head.etag !== document.etag) {
        reasons.push(`ETag ${document.etag} -> ${head.etag}`);
      }
      if (head.byteSize !== null && document.byteSize !== null && head.byteSize !== document.byteSize) {
        reasons.push(`size ${document.byteSize} -> ${head.byteSize} bytes`);
      }
      if (
        head.lastModified &&
        document.lastModifiedHeader &&
        head.lastModified.getTime() > document.lastModifiedHeader.getTime()
      ) {
        reasons.push(
          `last modified ${document.lastModifiedHeader.toISOString().slice(0, 10)} -> ${head.lastModified.toISOString().slice(0, 10)}`,
        );
      }

      if (reasons.length > 0) {
        changed.push({
          slug: document.slug,
          url: document.sourceUrl,
          reason: `${reasons.join("; ")}. Run \`bun run kb fetch --slug ${document.slug} --force\` to take the new revision.`,
        });
      }
    } catch (error) {
      unreachable.push({
        slug: document.slug,
        url: document.sourceUrl,
        reason: (error as Error).message,
      });
    }
  }

  const undeclared = await discoverUndeclaredDocuments();

  return { checked, changed, unreachable, undeclared };
}

/**
 * Scrape the publisher's server-rendered solution pages for document links.
 *
 * Only the anchor hrefs are read, and only to compare against the manifest.
 * The document centre itself is a client-rendered application with no public
 * API - `/api/documents`, `/api/document-center` and `/api/search` all
 * redirect - so these two pages are the practical discovery surface.
 */
async function discoverUndeclaredDocuments(): Promise<string[]> {
  const declared = new Set(manifestUrls().map(normalizeUrl));
  const found = new Set<string>();

  for (const standard of MANIFEST) {
    for (const page of standard.discoveryPages) {
      try {
        const response = await fetch(page, {
          headers: { "User-Agent": env().FETCH_USER_AGENT },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) continue;

        const html = await response.text();
        const pattern = standard.discoveryUrlPattern
          ? new RegExp(standard.discoveryUrlPattern, "gi")
          : /https:\/\/documents\.globalgap\.org\/documents\/[^"'\s<>\\]+\.(?:pdf|xlsx|docx)/gi;
        for (const match of html.matchAll(pattern)) {
          const url = decodeHtmlEntities(match[0]);
          if (!declared.has(normalizeUrl(url))) found.add(url);
        }
      } catch {
        // A discovery page being down is not a failure of drift detection; the
        // HEAD sweep above is the load-bearing check.
      }
    }
  }

  return [...found].sort();
}

/** Compare URLs ignoring percent-encoding differences in the filename. */
function normalizeUrl(url: string): string {
  try {
    return decodeURIComponent(url).replace(/\s+/g, " ").trim();
  } catch {
    return url;
  }
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&#47;/g, "/");
}
