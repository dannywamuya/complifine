/**
 * The source registry.
 *
 * PRD section 19 step 1: before parsing anything, declare every official
 * document you intend to ingest. This file is that declaration, checked into
 * version control so that "which sources is the knowledge base built from" is
 * answered by a diff rather than by querying production.
 *
 * Why a checked-in manifest rather than scraping the document centre: the
 * GLOBALG.A.P. document centre is client-rendered and exposes no public JSON
 * API (probing `/api/documents`, `/api/document-center` and `/api/search` all
 * returns 301). Scraping it would be fragile in exactly the way a compliance
 * source registry must not be. The two solution pages ARE server-rendered, so
 * `watch.ts` re-scrapes those to detect documents missing from this list, and
 * HEAD-checks these URLs for content drift. Discovery is automated; adoption
 * stays a deliberate, reviewed act.
 *
 * Every URL here returned HTTP 200 when the manifest was written.
 */

import {
  AUTHORITY_LEVELS,
  type AuthorityLevel,
  type DocumentType,
  type SourceChannel,
} from "@complifine/core";
import { SMETA_7 } from "./manifest-smeta.ts";

const DOCS = "https://documents.globalgap.org/documents";
/** Azure blob mirror serving the same objects, used when the primary fails. */
const MIRROR = "https://globalgapfiles1.blob.core.windows.net/documents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManifestDocument {
  /** Stable machine key. Never change one; add a new document instead. */
  readonly slug: string;
  readonly title: string;
  readonly documentType: DocumentType;
  readonly authorityLevel: AuthorityLevel;
  /** Filename at the origin, or a local basename when there is no public URL. */
  readonly filename: string;
  /**
   * How the bytes are obtained. Default is inferred: `localPath` → local,
   * otherwise the GLOBALG.A.P. CDN. SMETA Workplace Requirements are
   * `member_gated` until an operator drops the member file.
   */
  readonly channel?: SourceChannel;
  /** Absolute URL when the file is not named on the GLOBALG.A.P. document CDN. */
  readonly originUrl?: string;
  /** Set when the file is supplied locally rather than downloaded. */
  readonly localPath?: string;
  /**
   * `withdrawn` means the publisher no longer serves this file. It stays in
   * the registry because the knowledge base once relied on it and its
   * metadata is still meaningful, but a failure to fetch it is expected rather
   * than an error. See `mirrorOverride` for the surviving copy, if any.
   */
  readonly availability?: "available" | "withdrawn";
  /** Overrides the default Azure mirror, e.g. with a surviving third-party copy. */
  readonly mirrorOverride?: string;
  readonly language?: string;
  /** Publisher's internal code, from the document's own footer. */
  readonly documentCode?: string;
  readonly publishedAt?: string;
  readonly validFrom?: string;
  readonly licenseNote?: string;
  /** Why this document is in the registry, for a reader of the diff. */
  readonly note?: string;
}

export interface ManifestVersion {
  readonly code: string;
  readonly name: string;
  readonly edition: string;
  /**
   * Vocabulary for requirement levels on this version.
   * Defaults to `globalgap_ifa` for IFA editions.
   */
  readonly levelScheme?: string;
  readonly version: string;
  readonly scope: string;
  readonly effectiveDate?: string;
  readonly mandatoryFrom?: string;
  readonly replacesLabel?: string;
  readonly documents: readonly ManifestDocument[];
}

export interface ManifestStandard {
  readonly code: string;
  readonly name: string;
  readonly publisher: string;
  readonly description: string;
  readonly homepageUrl: string;
  /** Server-rendered pages re-scraped by the watcher to find new documents. */
  readonly discoveryPages: readonly string[];
  /**
   * Regex (as a string) matching document URLs on those pages.
   * GLOBALG.A.P. defaults to documents.globalgap.org pdf/xlsx links.
   */
  readonly discoveryUrlPattern?: string;
  readonly versions: readonly ManifestVersion[];
}

// ---------------------------------------------------------------------------
// Shared notes
// ---------------------------------------------------------------------------

const GG_LICENSE =
  "Copyright GLOBALG.A.P. c/o FoodPLUS GmbH. Published free of charge for use in certification. " +
  "Redistribution of full requirement text in a commercial product may require written permission - see docs/sources.md.";

/**
 * The general regulations are shared by both editions: each document states on
 * its own cover that it "applies to the Integrated Farm Assurance version 6
 * Smart (IFA v6 Smart) edition, the Integrated Farm Assurance version 6 GFS
 * (IFA v6 GFS) edition, the Harmonized Produce Safety Standard (HPSS), and the
 * Produce Handling Assurance (PHA) standard".
 *
 * They are therefore registered against both versions. The bytes are stored
 * once because storage is content-addressed by hash, so this duplicates a row,
 * not a file.
 */
function generalRegulations(editionSuffix: string): ManifestDocument[] {
  const gr = (
    slug: string,
    filename: string,
    title: string,
    note: string,
  ): ManifestDocument => ({
    slug: `${slug}-${editionSuffix}`,
    title,
    documentType: "general_regulations",
    authorityLevel: AUTHORITY_LEVELS.OFFICIAL_REGULATIONS,
    filename,
    licenseNote: GG_LICENSE,
    note,
  });

  return [
    gr(
      "gg-gr-individual-producers",
      "240902_GG_GR_Rules_for_IP_v6_0_Aug24_en.pdf",
      "GLOBALG.A.P. General Regulations - Rules for individual producers",
      "Applies to a single producer with or without multiple sites where no QMS is implemented. The default route for a Kenyan estate exporter.",
    ),
    gr(
      "gg-gr-producer-groups-qms",
      "240902_GG_GR_Rules_for_QMS_v6_0_Aug24_en.pdf",
      "GLOBALG.A.P. General Regulations - Rules for producer groups and multisite producers with QMS",
      "The route most Kenyan smallholder aggregation schemes certify under.",
    ),
    gr(
      "gg-gr-plants",
      "220929_GG_GR_Rules_for_plants_v6_0_Sep22_en.pdf",
      "GLOBALG.A.P. General Regulations - Rules for the plants scope",
      "Scope-specific certification rules for plant products, including fruit and vegetables.",
    ),
    gr(
      "gg-gr-parallel-ownership",
      "220929_GG_GR_Rules_for_PO_v6_0_Sep22_en.pdf",
      "GLOBALG.A.P. General Regulations - Rules for parallel ownership and parallel production",
      "Governs handling certified and non-certified product of the same crop. Directly relevant to exporters who buy in fruit.",
    ),
    gr(
      "gg-gr-flexible-distribution",
      "220929_GG_GR_Rules_for_FD_v6_0_Sep22_en.pdf",
      "GLOBALG.A.P. General Regulations - Rules for flexible distribution",
      "Rules for distributing certified product through flexible supply arrangements.",
    ),
    gr(
      "gg-gr-certification-bodies",
      "250401_GG_GR_Rules_for_CBs_v6_0_Apr25_en.pdf",
      "GLOBALG.A.P. General Regulations - Rules for certification bodies",
      "April 2025 revision, newer than the August 2024 file still linked from the fruit and vegetables solution page. A worked example of why the manifest pins exact filenames and the watcher checks for drift.",
    ),
  ];
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const GLOBALGAP_IFA_FV: ManifestStandard = {
  code: "globalgap-ifa",
  name: "GLOBALG.A.P. Integrated Farm Assurance",
  publisher: "GLOBALG.A.P. c/o FoodPLUS GmbH",
  description:
    "The GLOBALG.A.P. Integrated Farm Assurance standard for fruit and vegetables, published in two parallel and equally valid editions: Smart and GFS.",
  homepageUrl: "https://www.globalgap.org/what-we-offer/solutions/ifa-fruit-and-vegetables",
  discoveryPages: [
    "https://www.globalgap.org/what-we-offer/solutions/ifa-fruit-and-vegetables",
    "https://www.globalgap.org/what-we-offer/solutions/rms-checklist",
  ],

  versions: [
    // -----------------------------------------------------------------------
    // IFA v6 Smart
    // -----------------------------------------------------------------------
    {
      code: "ifa-v6-smart-fv",
      name: "IFA v6 Smart for Fruit and Vegetables",
      edition: "smart",
      version: "6.0",
      scope: "fruit-and-vegetables",
      effectiveDate: "2022-10-01",
      mandatoryFrom: "2024-01-01",
      replacesLabel: "5.2",
      documents: [
        {
          slug: "ifa-v6-smart-fv-pcs",
          title:
            "Integrated Farm Assurance Smart - Principles and Criteria for Fruit and Vegetables",
          documentType: "principles_and_criteria",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
          filename: "220929_IFA_Smart_PCs_FV_v6_0_Sep22_en.pdf",
          documentCode: "IFA Smart PCs for FV; v6.0_Sep22",
          publishedAt: "2022-09-29",
          validFrom: "2022-10-01",
          licenseNote: GG_LICENSE,
          note: "The authoritative statement of the requirements. Used for page-level provenance rather than text extraction, because the checklist workbook carries the same text in structured form.",
        },
        {
          slug: "ifa-v6-smart-fv-checklist",
          title: "IFA v6 Smart for Fruit and Vegetables - Checklist",
          documentType: "checklist",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_CHECKLIST,
          filename: "240321_IFA_Smart_checklist_FV_v6_0_Sep22_protected_en.xlsx",
          publishedAt: "2024-03-21",
          licenseNote: GG_LICENSE,
          note: "The primary structured source. Its hidden PI sheet is a normalised table of all 190 criteria with the publisher's own stable GUIDs, and its Instructions sheet carries the 16 scoping questions that drive applicability.",
        },
        ...generalRegulations("smart"),
        {
          slug: "ifa-v6-guideline-fv",
          title: "Integrated Farm Assurance - Guideline for Fruit and Vegetables",
          documentType: "guidance",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_GUIDANCE,
          filename: "220929_IFA_guideline_FV_v6_0_Sep22_en.pdf",
          documentCode: "IFA guideline for FV; v6.0_Sep22",
          validFrom: "2022-10-01",
          licenseNote: GG_LICENSE,
          note: "Explicitly non-normative: its cover states it 'is a recommendation for consideration'. Registered at authority level 4 so it can never be cited as the basis for a requirement.",
        },
        {
          slug: "ifa-v5-to-v6-summary-of-changes",
          title: "Summary of Changes from IFA v5 to IFA v6 Smart and GFS Editions",
          documentType: "update",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_UPDATE,
          filename: "220503_Summary_of_Changes_IFA_v5_to_v6_GFS-Smart_en.pdf",
          documentCode: "Summary of changes v5 to v6; v1.0_Apr22",
          availability: "withdrawn",
          // The primary URL answers 200 with an OpenCms redirect descriptor
          // pointing at 220623_..., and that blob has since been deleted. The
          // document is genuinely gone from the publisher's document centre.
          // This surviving copy is byte-identical to the April 2022 v1.0
          // release and is hosted by a certification consultancy.
          mirrorOverride:
            "http://qmsconseil.ma/wp-content/uploads/2022/05/220503_Summary_of_Changes_IFA_v5_to_v6_GFS-Smart_en.pdf",
          licenseNote: GG_LICENSE,
          note:
            "Withdrawn by the publisher. Retained because it is the origin of the widely cited criterion counts (v5.2: 222, v6 Smart: 190, v6 GFS: 191). " +
            "Note that its level breakdown (Smart 102/68/20, GFS 117/54/20) disagrees by one criterion with the published workbooks (103/67/20 and 118/53/20). " +
            "The summary was written in April 2022 against a pre-publication draft; the September 2022 and August 2024 workbooks are newer and authoritative. " +
            "The quality gates assert the workbook figures.",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // IFA v6 GFS
    // -----------------------------------------------------------------------
    {
      code: "ifa-v6-gfs-fv",
      name: "IFA v6 GFS for Fruit and Vegetables",
      edition: "gfs",
      version: "6.0-GFS",
      scope: "fruit-and-vegetables",
      effectiveDate: "2024-08-06",
      mandatoryFrom: "2025-01-01",
      replacesLabel: "5.4-1-GFS",
      documents: [
        {
          slug: "ifa-v6-gfs-fv-pcs",
          title:
            "Integrated Farm Assurance GFS - Principles and Criteria for Fruit and Vegetables",
          documentType: "principles_and_criteria",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_STANDARD,
          filename: "240902_IFA_GFS_PCs_FV_v6_0_Aug24_en.pdf",
          documentCode: "IFA GFS PCs for FV; v6.0-GFS_Aug24",
          publishedAt: "2024-09-02",
          validFrom: "2024-08-06",
          licenseNote: GG_LICENSE,
          note: "The GFSI-recognised edition. Recognised by GFSI on 6 August 2024.",
        },
        {
          slug: "ifa-v6-gfs-fv-checklist",
          title: "IFA v6 GFS for Fruit and Vegetables - Checklist",
          documentType: "checklist",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_CHECKLIST,
          filename: "240902_IFA_GFS_checklist_FV_v6_0-GFS_Aug24_protected_en.xlsx",
          publishedAt: "2024-09-02",
          licenseNote: GG_LICENSE,
          note: "Structurally identical to the Smart checklist, so one adapter serves both. Carries 191 criteria against Smart's 190.",
        },
        ...generalRegulations("gfs"),
        {
          slug: "hpss-to-ifa-v6-gfs-transition-tool",
          title:
            "Transition tool - GLOBALG.A.P. HPSS v1.2 to IFA v6 GFS for Fruit and Vegetables",
          documentType: "transition_tool",
          authorityLevel: AUTHORITY_LEVELS.OFFICIAL_UPDATE,
          filename: "260115_transition tool_HPSS_v1.2_-_IFA_v6_GFS_for_FV_v1_protected_en.xlsx",
          licenseNote: GG_LICENSE,
          note: "Public on the GLOBALG.A.P. document CDN. Independent third check: it restates every GFS criterion number, principle text and level, so reconciliation can verify the checklist import against a separately produced document.",
        },
      ],
    },
  ],
};

/**
 * Sources that are NOT authoritative but are registered so that their presence
 * is deliberate and their standing is explicit.
 *
 * The PRD's source hierarchy only works if lower-authority material is inside
 * the system carrying its level, rather than sitting in a folder where someone
 * eventually mistakes it for the standard.
 */
export const NON_AUTHORITATIVE_SOURCES: readonly ManifestDocument[] = [
  {
    slug: "agrinfo-ifa-v6-briefing",
    title: "AGRINFO briefing - GLOBALG.A.P. IFA v6",
    documentType: "third_party_summary",
    authorityLevel: AUTHORITY_LEVELS.CB_GUIDANCE,
    filename: "globalgap-ifa-v6.pdf",
    originUrl: "https://agrinfo.eu/book-of-reports/globalgap-ifa-v6/pdf/",
    licenseNote: "Copyright COLEAD. AGRINFO is funded by the European Union and implemented by COLEAD.",
    note: "A four-page third-party news summary, NOT a GLOBALG.A.P. document. Registered at authority level 6 with no requirement extraction, purely so that its non-authoritative status is recorded rather than assumed. Fetched from AGRINFO, not from a laptop folder.",
  },
];

export const MANIFEST: readonly ManifestStandard[] = [GLOBALGAP_IFA_FV, SMETA_7];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function documentUrl(doc: ManifestDocument): string | null {
  if (doc.localPath || resolveChannel(doc) === "member_gated") return doc.originUrl ?? null;
  if (doc.originUrl) return doc.originUrl;
  if (resolveChannel(doc) === "local") return null;
  return `${DOCS}/${encodeURIComponent(doc.filename)}`;
}

export function resolveChannel(doc: ManifestDocument): SourceChannel {
  if (doc.channel) return doc.channel;
  if (doc.localPath) return "local";
  return "http";
}

export function documentMirrorUrl(doc: ManifestDocument): string | null {
  if (resolveChannel(doc) === "local" || resolveChannel(doc) === "member_gated") return null;
  if (doc.mirrorOverride) return doc.mirrorOverride;
  if (doc.originUrl && !doc.originUrl.includes("documents.globalgap.org")) return null;
  if (doc.localPath) return null;
  return `${MIRROR}/${encodeURIComponent(doc.filename)}`;
}

export function isWithdrawn(doc: ManifestDocument): boolean {
  return doc.availability === "withdrawn";
}

/** Every document in the manifest, paired with the version it belongs to. */
export function allManifestDocuments(): Array<{
  standard: ManifestStandard;
  version: ManifestVersion;
  document: ManifestDocument;
}> {
  const out: Array<{
    standard: ManifestStandard;
    version: ManifestVersion;
    document: ManifestDocument;
  }> = [];
  for (const standard of MANIFEST) {
    for (const version of standard.versions) {
      for (const document of version.documents) {
        out.push({ standard, version, document });
      }
    }
  }
  return out;
}

export function findVersion(code: string): ManifestVersion | null {
  for (const standard of MANIFEST) {
    const version = standard.versions.find((v) => v.code === code);
    if (version) return version;
  }
  return null;
}

export function findDocument(slug: string): ManifestDocument | null {
  return (
    allManifestDocuments().find((d) => d.document.slug === slug)?.document ??
    NON_AUTHORITATIVE_SOURCES.find((d) => d.slug === slug) ??
    null
  );
}

/**
 * Distinct URLs the manifest declares, for the drift watcher.
 *
 * Deduplicated because the six general regulations are registered against both
 * editions and therefore appear twice. They are one file at the origin, so
 * HEAD-checking them twice would double the requests and report any change
 * twice over.
 */
export function manifestUrls(): string[] {
  return [
    ...new Set(
      allManifestDocuments()
        .map(({ document }) => documentUrl(document))
        .filter((url): url is string => url !== null),
    ),
  ];
}
