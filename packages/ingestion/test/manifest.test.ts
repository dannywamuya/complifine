/**
 * The manifest is data, not code, so these are consistency assertions rather
 * than unit tests. They exist because the manifest is edited by hand whenever
 * the publisher issues a document, and the failure modes of a hand-edited
 * registry - a duplicated slug, a version with two Principles & Criteria
 * documents, a local file that has moved - are silent and only surface much
 * later as a confusing ingestion error.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { AUTHORITY_LEVELS, DOCUMENT_TYPES } from "@complifine/core";
import {
  MANIFEST,
  NON_AUTHORITATIVE_SOURCES,
  allManifestDocuments,
  documentMirrorUrl,
  documentUrl,
  findDocument,
  findVersion,
  isWithdrawn,
  manifestUrls,
} from "../src/manifest.ts";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const documents = allManifestDocuments();

describe("manifest integrity", () => {
  test("declares at least one standard with versions and documents", () => {
    expect(MANIFEST.length).toBeGreaterThan(0);
    expect(documents.length).toBeGreaterThan(0);
    for (const standard of MANIFEST) {
      expect(standard.versions.length).toBeGreaterThan(0);
    }
  });

  // Slugs are the join key between the manifest and every database row. A
  // duplicate silently makes one document overwrite the other.
  test("every document slug is unique", () => {
    const slugs = documents.map((d) => d.document.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("every version code is unique", () => {
    const codes = MANIFEST.flatMap((s) => s.versions).map((v) => v.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("slugs are lower-case and URL-safe", () => {
    for (const { document } of [...documents, ...NON_AUTHORITATIVE_SOURCES.map((d) => ({ document: d }))]) {
      expect(document.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  test("every document declares a known type and authority level", () => {
    const types = new Set<string>(Object.values(DOCUMENT_TYPES));
    const levels = new Set<number>(Object.values(AUTHORITY_LEVELS));
    for (const { document } of documents) {
      expect(types.has(document.documentType)).toBe(true);
      expect(levels.has(document.authorityLevel)).toBe(true);
    }
  });

  // Authority level is what stops a guidance note being cited as a
  // requirement, so the two documents where it matters most are pinned.
  test("the standard outranks the checklist, which outranks the guideline", () => {
    const level = (slug: string) => findDocument(slug)!.authorityLevel;
    expect(level("ifa-v6-smart-fv-pcs")).toBe(AUTHORITY_LEVELS.OFFICIAL_STANDARD);
    expect(level("ifa-v6-smart-fv-checklist")).toBe(AUTHORITY_LEVELS.OFFICIAL_CHECKLIST);
    expect(level("ifa-v6-guideline-fv")).toBe(AUTHORITY_LEVELS.OFFICIAL_GUIDANCE);
    expect(level("ifa-v6-smart-fv-pcs")).toBeLessThan(level("ifa-v6-smart-fv-checklist"));
    expect(level("ifa-v6-smart-fv-checklist")).toBeLessThan(level("ifa-v6-guideline-fv"));
  });

  test("the third-party summary is registered below every official source", () => {
    const agrinfo = NON_AUTHORITATIVE_SOURCES.find((d) => d.slug === "agrinfo-ifa-v6-briefing")!;
    const officialMax = Math.max(...documents.map((d) => d.document.authorityLevel));
    expect(agrinfo.authorityLevel).toBeGreaterThan(officialMax);
  });

  // Exactly one of each per version: these are the two documents the whole
  // import is built from, and a second copy would make "the standard" ambiguous.
  test("each GLOBALG.A.P. version has exactly one Principles & Criteria and one checklist", () => {
    const ggap = MANIFEST.find((s) => s.code === "globalgap-ifa") ?? MANIFEST[0]!;
    for (const version of ggap.versions) {
      const ofType = (type: string) =>
        version.documents.filter((d) => d.documentType === type).length;
      expect(ofType("principles_and_criteria")).toBe(1);
      expect(ofType("checklist")).toBe(1);
    }
  });

  test("both GLOBALG.A.P. editions register the shared general regulations", () => {
    for (const standard of MANIFEST.filter((s) => s.versions.some((v) => v.edition === "smart" || v.edition === "gfs"))) {
      for (const version of standard.versions.filter((v) => v.edition === "smart" || v.edition === "gfs")) {
        const count = version.documents.filter(
          (d) => d.documentType === "general_regulations",
        ).length;
        expect(count).toBe(6);
      }
    }
  });

  test("every document has a licence note", () => {
    for (const { document } of documents) {
      expect(document.licenseNote?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("every document explains why it is registered", () => {
    for (const { document } of documents) {
      expect(document.note?.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("manifest URLs", () => {
  test("a remote GLOBALG.A.P. document has a primary and a mirror URL; a local one has neither", () => {
    for (const { document } of documents) {
      const channel = document.channel ?? (document.localPath ? "local" : "http");
      if (channel === "member_gated" || channel === "local") {
        expect(documentMirrorUrl(document)).toBeNull();
        continue;
      }
      if (document.originUrl && !document.originUrl.includes("documents.globalgap.org")) {
        expect(documentUrl(document)).toBe(document.originUrl);
        expect(documentMirrorUrl(document)).toBeNull();
        continue;
      }
      if (document.localPath) {
        expect(documentUrl(document)).toBeNull();
        expect(documentMirrorUrl(document)).toBeNull();
      } else {
        expect(documentUrl(document)).toStartWith("https://documents.globalgap.org/documents/");
        expect(documentMirrorUrl(document)).not.toBeNull();
      }
    }
  });

  test("filenames with spaces are percent-encoded", () => {
    const withSpace = documents.find(({ document }) => document.filename.includes(" "));
    if (withSpace && !withSpace.document.localPath) {
      expect(documentUrl(withSpace.document)).not.toContain(" ");
    }
    // The transition tool is the file with a space in its name, and it is local.
    expect(findDocument("hpss-to-ifa-v6-gfs-transition-tool")!.filename).toContain(" ");
  });

  // The six general regulations are registered against both editions, so the
  // raw document list contains each of their URLs twice. The watcher must not
  // HEAD the same file twice and report one change as two.
  test("manifestUrls deduplicates the documents shared by both editions", () => {
    const urls = manifestUrls();
    const remote = documents
      .filter(({ document }) => documentUrl(document))
      .map(({ document }) => documentUrl(document)!);

    expect(new Set(urls).size).toBe(urls.length);
    expect(new Set(urls)).toEqual(new Set(remote));
    expect(urls.length).toBeLessThan(remote.length);
  });

  // A withdrawn document must point somewhere other than the dead primary URL,
  // or marking it withdrawn achieves nothing.
  test("a withdrawn document overrides its mirror", () => {
    const withdrawn = documents.filter(({ document }) => isWithdrawn(document));
    expect(withdrawn.length).toBeGreaterThan(0);
    for (const { document } of withdrawn) {
      expect(document.mirrorOverride).toBeDefined();
      expect(documentMirrorUrl(document)).toBe(document.mirrorOverride!);
    }
  });

  test("the summary of changes is recorded as withdrawn, with the reason", () => {
    const summary = findDocument("ifa-v5-to-v6-summary-of-changes")!;
    expect(isWithdrawn(summary)).toBe(true);
    expect(summary.note).toContain("Withdrawn");
  });
});

describe("locally supplied documents", () => {
  function resolvedLocalPath(localPath: string): string {
    return isAbsolute(localPath) ? localPath : resolve(REPO_ROOT, localPath);
  }

  /** Publisher bytes are not in git. Paths outside the repo (`../global gap/`)
   *  or under gitignored `storage/` are operator drops, same as member-gated. */
  function isOperatorDrop(absPath: string): boolean {
    const rel = relative(REPO_ROOT, absPath);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return true;
    return rel === "storage" || rel.startsWith(`storage/`);
  }

  test("every declared in-repo local file exists on disk, except operator drops", () => {
    for (const { document } of documents) {
      if (!document.localPath) continue;
      if ((document.channel ?? "local") === "member_gated") continue;
      const path = resolvedLocalPath(document.localPath);
      if (isOperatorDrop(path)) continue;
      expect({ slug: document.slug, exists: existsSync(path) }).toEqual({
        slug: document.slug,
        exists: true,
      });
    }
  });
});

describe("lookup helpers", () => {
  test("finds a version by code and a document by slug", () => {
    expect(findVersion("ifa-v6-smart-fv")!.edition).toBe("smart");
    expect(findVersion("ifa-v6-gfs-fv")!.edition).toBe("gfs");
    expect(findDocument("ifa-v6-smart-fv-checklist")!.documentType).toBe("checklist");
  });

  test("returns null rather than throwing for an unknown key", () => {
    expect(findVersion("ifa-v7")).toBeNull();
    expect(findDocument("nope")).toBeNull();
  });
});

describe("SMETA 7 registry", () => {
  test("registers 2-pillar and 4-pillar as parallel editions", () => {
    expect(findVersion("smeta-7-2-pillar")?.edition).toBe("2-pillar");
    expect(findVersion("smeta-7-4-pillar")?.edition).toBe("4-pillar");
    expect(findVersion("smeta-7-2-pillar")?.levelScheme).toBe("smeta_7");
  });

  test("ETI Base Code is a public HTTP source", () => {
    const eti = findDocument("eti-base-code-en")!;
    expect(eti.documentType).toBe("base_code");
    expect(eti.channel).toBe("http");
    expect(documentUrl(eti)).toContain("ethicaltrade.org");
    expect(documentMirrorUrl(eti)).toBeNull();
  });

  test("Workplace Requirements are member-gated drop targets, not Scribd", () => {
    const wr = findDocument("smeta-7-2p-workplace-requirements")!;
    expect(wr.channel).toBe("member_gated");
    expect(wr.localPath).toContain("SMETA-7.0-Workplace-Requirements.pdf");
    expect(wr.note?.toLowerCase()).not.toContain("scribd");
    expect(documentUrl(wr)).toBeNull();
  });
});
