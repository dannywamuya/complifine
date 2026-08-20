import { describe, expect, test } from "bun:test";
import { parseGlobalGapFilename, sourceStoragePath } from "../src/filename.ts";

/**
 * Every filename below is a real file in the GLOBALG.A.P. document centre,
 * verified to return HTTP 200 at
 * https://documents.globalgap.org/documents/<filename>.
 */

describe("parseGlobalGapFilename", () => {
  test("separates file date from version date on the Smart checklist", () => {
    const p = parseGlobalGapFilename("240321_IFA_Smart_checklist_FV_v6_0_Sep22_protected_en.xlsx");

    // The distinction this parser exists for: a March 2024 file that carries
    // the September 2022 version of the standard. Treating the leading date as
    // the version date would make change detection report a new standard every
    // time GLOBALG.A.P. regenerates a workbook.
    expect(p.fileDate).toBe("2024-03-21");
    expect(p.versionDate).toBe("2022-09");
    expect(p.version).toBe("6.0");
    expect(p.language).toBe("en");
    expect(p.isProtected).toBe(true);
    expect(p.extension).toBe("xlsx");
    expect(p.subject).toBe("IFA Smart checklist FV");
  });

  test("keeps the GFS edition suffix, because 6.0 and 6.0-GFS are different documents", () => {
    const p = parseGlobalGapFilename(
      "240902_IFA_GFS_checklist_FV_v6_0-GFS_Aug24_protected_en.xlsx",
    );
    expect(p.fileDate).toBe("2024-09-02");
    expect(p.versionDate).toBe("2024-08");
    expect(p.version).toBe("6.0-GFS");
    expect(p.isProtected).toBe(true);
    expect(p.subject).toBe("IFA GFS checklist FV");
  });

  test("parses the Smart principles and criteria PDF", () => {
    const p = parseGlobalGapFilename("220929_IFA_Smart_PCs_FV_v6_0_Sep22_en.pdf");
    expect(p.fileDate).toBe("2022-09-29");
    expect(p.versionDate).toBe("2022-09");
    expect(p.version).toBe("6.0");
    expect(p.isProtected).toBe(false);
    expect(p.extension).toBe("pdf");
    expect(p.subject).toBe("IFA Smart PCs FV");
  });

  test("parses the GFS principles and criteria PDF", () => {
    const p = parseGlobalGapFilename("240902_IFA_GFS_PCs_FV_v6_0_Aug24_en.pdf");
    expect(p.fileDate).toBe("2024-09-02");
    expect(p.versionDate).toBe("2024-08");
    expect(p.version).toBe("6.0");
    expect(p.subject).toBe("IFA GFS PCs FV");
  });

  test("parses the general regulations documents", () => {
    const qms = parseGlobalGapFilename("240902_GG_GR_Rules_for_QMS_v6_0_Aug24_en.pdf");
    expect(qms.version).toBe("6.0");
    expect(qms.versionDate).toBe("2024-08");
    expect(qms.subject).toBe("GG GR Rules for QMS");

    // The CB rules are on a later revision than the rest of the v6 set, which
    // is exactly the drift the source registry needs to notice.
    const cbs = parseGlobalGapFilename("250401_GG_GR_Rules_for_CBs_v6_0_Apr25_en.pdf");
    expect(cbs.fileDate).toBe("2025-04-01");
    expect(cbs.versionDate).toBe("2025-04");
    expect(cbs.subject).toBe("GG GR Rules for CBs");
  });

  test("parses the guideline", () => {
    const p = parseGlobalGapFilename("220929_IFA_guideline_FV_v6_0_Sep22_en.pdf");
    expect(p.version).toBe("6.0");
    expect(p.subject).toBe("IFA guideline FV");
  });

  test("handles a filename with no leading date", () => {
    const p = parseGlobalGapFilename("GLOBALGAP_product_list_April2026_en.pdf");
    expect(p.fileDate).toBeNull();
    expect(p.language).toBe("en");
    expect(p.extension).toBe("pdf");
  });

  test("defaults language to English when the file omits it", () => {
    expect(parseGlobalGapFilename("220929_IFA_Smart_PCs_FV_v6_0_Sep22.pdf").language).toBe("en");
  });

  test("reads non-English variants", () => {
    const es = parseGlobalGapFilename("260515_SPRING_checklist_v2_0-1_May26_protected_es.xlsx");
    expect(es.language).toBe("es");
    expect(es.isProtected).toBe(true);
  });

  test("strips a leading directory path", () => {
    const p = parseGlobalGapFilename("/tmp/downloads/220929_IFA_Smart_PCs_FV_v6_0_Sep22_en.pdf");
    expect(p.filename).toBe("220929_IFA_Smart_PCs_FV_v6_0_Sep22_en.pdf");
  });

  test("rejects an invalid leading date rather than accepting a bad ISO string", () => {
    // 991399 is not a date; it must not become "2099-13-99".
    const p = parseGlobalGapFilename("991399_something_en.pdf");
    expect(p.fileDate).toBeNull();
  });

  test("does not throw on input that follows no convention at all", () => {
    const p = parseGlobalGapFilename("notes.txt");
    expect(p.fileDate).toBeNull();
    expect(p.version).toBeNull();
    expect(p.versionDate).toBeNull();
    expect(p.extension).toBe("txt");
  });
});

describe("sourceStoragePath", () => {
  const HASH = "b3ab17e2dea2d5133e1cc199672147f76657e956abfa3acfd92e73a6b720ce75";

  test("mirrors the standard hierarchy and names the leaf by content hash", () => {
    expect(
      sourceStoragePath({
        standardSlug: "globalgap-ifa",
        scopeSlug: "fruit-vegetables",
        versionSlug: "v6-smart",
        stage: "source",
        contentHash: HASH,
        extension: "pdf",
      }),
    ).toBe(`globalgap-ifa/fruit-vegetables/v6-smart/source/${HASH}.pdf`);
  });

  test("a re-fetch of unchanged bytes resolves to the same path", () => {
    const args = {
      standardSlug: "globalgap-ifa",
      scopeSlug: "fruit-vegetables",
      versionSlug: "v6-smart",
      stage: "source",
      contentHash: HASH,
      extension: "pdf",
    } as const;
    expect(sourceStoragePath(args)).toBe(sourceStoragePath({ ...args }));
  });

  test("a changed publication cannot overwrite the file it replaces", () => {
    const base = {
      standardSlug: "globalgap-ifa",
      scopeSlug: "fruit-vegetables",
      versionSlug: "v6-smart",
      stage: "source",
      extension: "pdf",
    } as const;
    expect(sourceStoragePath({ ...base, contentHash: HASH })).not.toBe(
      sourceStoragePath({ ...base, contentHash: "a".repeat(64) }),
    );
  });

  test("separates pipeline stages for the same object", () => {
    const base = {
      standardSlug: "globalgap-ifa",
      scopeSlug: "fruit-vegetables",
      versionSlug: "v6-smart",
      contentHash: HASH,
    } as const;
    expect(sourceStoragePath({ ...base, stage: "parsed", extension: "json" })).toBe(
      `globalgap-ifa/fruit-vegetables/v6-smart/parsed/${HASH}.json`,
    );
  });
});
