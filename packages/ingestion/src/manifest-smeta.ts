/**
 * SMETA / Sedex source registry.
 *
 * Sedex is the membership platform (ZC numbers, SAQ, audit sharing). SMETA is
 * the audit methodology. They are not two standards. This file registers SMETA
 * 7.0 (June 2024) and the ETI Base Code it measures against.
 *
 * Unlike GLOBALG.A.P., Sedex does not publish a public document CDN for the
 * Workplace Requirements. Those files are member/e-Learning gated. The
 * adapter therefore:
 *
 *   1. always fetches the public ETI Base Code (normative labour clauses);
 *   2. waits for an operator to drop the member Workplace Requirements PDF
 *      at the localPath below before extracting SMETA WRs.
 *
 * Third-party rehosts (Scribd, AAC copies) are not Level 1. See docs/SOURCES-SMETA.md.
 */

import { AUTHORITY_LEVELS } from "@complifine/core";
import type { ManifestStandard } from "./manifest.ts";

const ETI_LICENSE =
  "Copyright Ethical Trading Initiative. The English-language Base Code is the official version. " +
  "Redistribution of the full text in a commercial product may require permission.";

const SEDEX_LICENSE =
  "Copyright Sedex. SMETA methodology documents are issued to members and Affiliate Audit Companies. " +
  "They are not published on a public CDN. Do not ingest Scribd or other rehosts as Level 1.";

export const SMETA_7: ManifestStandard = {
  code: "smeta",
  name: "Sedex Members Ethical Trade Audit (SMETA)",
  publisher: "Sedex",
  description:
    "SMETA 7.0 (June 2024) measures a site against the ETI Base Code, ILO conventions and local law. " +
    "2-pillar covers labour and health & safety; 4-pillar adds environment and business ethics. " +
    "The editions are parallel scopes, not interchangeable, the same way IFA Smart and GFS are.",
  homepageUrl: "https://www.sedex.com/solutions/smeta-audit/",
  discoveryPages: [
    "https://www.sedex.com/solutions/smeta-audit/",
    "https://www.ethicaltrade.org/resources/guidance-and-reports/eti-base-code",
  ],
  discoveryUrlPattern:
    "https://(?:www\\.ethicaltrade\\.org/sites/default/files/[^\"'\\s<>]+|info\\.sedex\\.com/[^\"'\\s<>]+)\\.pdf",

  versions: [
    {
      code: "smeta-7-2-pillar",
      name: "SMETA 7.0 2-pillar",
      edition: "2-pillar",
      levelScheme: "smeta_7",
      version: "7.0",
      scope: "labour-health-safety",
      effectiveDate: "2024-06-01",
      documents: [
        {
          slug: "eti-base-code-en",
          title: "ETI Base Code (English)",
          documentType: "base_code",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
          filename: "eti_base_code_english.pdf",
          originUrl:
            "https://www.ethicaltrade.org/sites/default/files/shared_resources/eti_base_code_english.pdf",
          channel: "http",
          language: "en",
          publishedAt: "2018-04-01",
          licenseNote: ETI_LICENSE,
          note:
            "The nine labour clauses SMETA audits against. Public, official, English is authoritative. " +
            "SMETA 7.0 Workplace Requirements break these into auditable items; until the member file is dropped, " +
            "the knowledge base answers from the Base Code itself.",
        },
        {
          slug: "smeta-7-2p-workplace-requirements",
          title: "SMETA 7.0 Workplace Requirements (2-pillar)",
          documentType: "principles_and_criteria",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
          filename: "SMETA-7.0-Workplace-Requirements.pdf",
          channel: "member_gated",
          localPath: "storage/drops/smeta/SMETA-7.0-Workplace-Requirements.pdf",
          licenseNote: SEDEX_LICENSE,
          note:
            "Member Manual Annex 4, August 2024 v1.0. Official P&C analogue. Place the member PDF at the localPath. " +
            "Until then, fetch records this as gated rather than failed.",
        },
        {
          slug: "smeta-7-auditor-manual",
          title: "SMETA 7.0 Auditor Manual",
          documentType: "methodology",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_REGULATIONS,
          filename: "Sedex-Auditor-Manual-SMETA-7.0-June-2024.pdf",
          channel: "member_gated",
          localPath: "storage/drops/smeta/Sedex-Auditor-Manual-SMETA-7.0-June-2024.pdf",
          licenseNote: SEDEX_LICENSE,
          note:
            "Consolidates former Best Practice Guidance and Measurement Criteria. Official for Affiliate Audit Companies. " +
            "Third-party AAC copies are not Level 1 until SHA-256 matches a member original.",
        },
      ],
    },
    {
      code: "smeta-7-4-pillar",
      name: "SMETA 7.0 4-pillar",
      edition: "4-pillar",
      levelScheme: "smeta_7",
      version: "7.0",
      scope: "labour-health-safety-environment-ethics",
      effectiveDate: "2024-06-01",
      documents: [
        {
          slug: "eti-base-code-en-4p",
          title: "ETI Base Code (English)",
          documentType: "base_code",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
          filename: "eti_base_code_english.pdf",
          originUrl:
            "https://www.ethicaltrade.org/sites/default/files/shared_resources/eti_base_code_english.pdf",
          channel: "http",
          language: "en",
          publishedAt: "2018-04-01",
          licenseNote: ETI_LICENSE,
          note: "Same bytes as the 2-pillar registration. Storage is content-addressed, so this duplicates a row, not a file.",
        },
        {
          slug: "smeta-7-4p-workplace-requirements",
          title: "SMETA 7.0 Workplace Requirements (4-pillar)",
          documentType: "principles_and_criteria",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
          filename: "SMETA-7.0-Workplace-Requirements.pdf",
          channel: "member_gated",
          localPath: "storage/drops/smeta/SMETA-7.0-Workplace-Requirements.pdf",
          licenseNote: SEDEX_LICENSE,
          note: "Same member file as 2-pillar; the adapter filters environment and business-ethics WRs onto this edition only.",
        },
      ],
    },
  ],
};
