# GLOBALG.A.P. source registry

How to obtain the authoritative IFA v6 documents, which ones matter, and how to
notice when they change.

Every URL below was verified to return `HTTP 200` from
`https://documents.globalgap.org/documents/<filename>` with no authentication.

---

## 1. The channel

GLOBALG.A.P. publishes normative documents at:

```
https://documents.globalgap.org/documents/<filename>
```

Properties that make this usable as an automated source:

- **No login, no rate limiting.** Plain HTTP GET.
- **`Last-Modified` and `Content-Length` on HEAD.** Cheap drift detection
  without downloading a megabyte each time.
- **Stable filenames.** A given version keeps its filename; a new version gets
  a new one.
- **A mirror** at `https://globalgapfiles1.blob.core.windows.net/documents/<filename>`
  serving the same bytes, usable as a fallback.

This is confirmed by the standard itself. GR *Rules for Individual Producers*
§2.2 states: "The latest versions of all normative documents can be downloaded
free of charge from the GLOBALG.A.P. website."

### The filename convention

```
240321_IFA_Smart_checklist_FV_v6_0_Sep22_protected_en.xlsx
`----'  `-------------------' `--' `---' `-------' `'
  |              subject      ver.  ver.   sheet   lang
  |                                 date  locked
file date
```

The trap this encodes, and the reason `packages/core/src/filename.ts` exists:
**the leading date is when the file was regenerated, not the version it
carries.** The example above is a March 2024 file containing the September 2022
version of the standard. Treating the leading date as the version date makes
change detection report a new standard every time GLOBALG.A.P. re-exports a
workbook.

GR §2.2(c) defines the version numbering:

| Change | Meaning |
| --- | --- |
| `5.0` to `6.0` | Version change, requirements changed |
| `6.0` to `6.1` | Version update |
| `6.0` to `6.0-1` | Edition update |

---

## 2. The registry

Authority levels follow PRD section 17. Only levels 1-3 are normative — they
may be cited as the basis of a requirement. Level 4 and weaker are reference
material, enforced in code by `isNormative()` in `packages/core/src/enums.ts`.

### Level 1 — Principles and Criteria

The standard itself.

| Document | Filename | Version facts |
| --- | --- | --- |
| IFA v6 **Smart** P&Cs, Fruit & Vegetables | `220929_IFA_Smart_PCs_FV_v6_0_Sep22_en.pdf` | v6.0_Sep22. Published 29 Sep 2022, valid from 1 Oct 2022, replaced v5.2 on 1 Jan 2024. 80 pages. |
| IFA v6 **GFS** P&Cs, Fruit & Vegetables | `240902_IFA_GFS_PCs_FV_v6_0_Aug24_en.pdf` | v6.0-GFS_Aug24. Published 2 Sep 2024, valid from 6 Aug 2024, replaced v5.4-1-GFS on 1 Jan 2025. 82 pages. |

### Level 2 — General Regulations

The rules of the certification system, kept separate from the P&Cs per PRD
section 12. v6 split the previously monolithic GR into several documents.

| Document | Filename |
| --- | --- |
| Rules for individual producers | `240902_GG_GR_Rules_for_IP_v6_0_Aug24_en.pdf` |
| Rules for producer groups and multisite with QMS | `240902_GG_GR_Rules_for_QMS_v6_0_Aug24_en.pdf` |
| Rules for the plants scope | `220929_GG_GR_Rules_for_plants_v6_0_Sep22_en.pdf` |
| Rules for parallel ownership | `220929_GG_GR_Rules_for_PO_v6_0_Sep22_en.pdf` |
| Rules for flexible distribution | `220929_GG_GR_Rules_for_FD_v6_0_Sep22_en.pdf` |
| Rules for certification bodies | `250401_GG_GR_Rules_for_CBs_v6_0_Apr25_en.pdf` |

Note the CB rules carry an April 2025 file date while the rest of the set is
2022-2024. Documents in a "version" do not move in lockstep, which is precisely
what the drift watcher is for.

### Level 3 — Checklists

**The most valuable artefacts in the entire registry.** These are not flat
checklists; they are relational workbooks carrying the publisher's own GUIDs,
section hierarchy and applicability logic. See
[WORKBOOK-STRUCTURE.md](./WORKBOOK-STRUCTURE.md).

| Document | Filename |
| --- | --- |
| IFA v6 Smart checklist, F&V | `240321_IFA_Smart_checklist_FV_v6_0_Sep22_protected_en.xlsx` |
| IFA v6 GFS checklist, F&V | `240902_IFA_GFS_checklist_FV_v6_0-GFS_Aug24_protected_en.xlsx` |

`protected` in the filename refers to Excel sheet protection. It does not
encrypt the file and does not impede reading the XML.

### Level 4 — Guidance

| Document | Filename |
| --- | --- |
| IFA v6 guideline, F&V | `220929_IFA_guideline_FV_v6_0_Sep22_en.pdf` (91 pages) |

Explicitly non-normative. Its own cover page reads: *"This guideline is a
recommendation for consideration."* Excellent RAG material for "how do I
actually do this", never a citation for "what is required".

### Level 5 — Updates and transition

| Document | Filename | Why it matters |
| --- | --- | --- |
| Summary of changes, IFA v5 to v6 | `220503_Summary_of_Changes_IFA_v5_to_v6_GFS-Smart_en.pdf` | Authoritative v5 to v6 delta with official P&C counts. Feeds the version engine. |
| HPSS v1.2 → IFA v6 GFS FV transition tool | `260115_transition tool_HPSS_v1.2_-_IFA_v6_GFS_for_FV_v1_protected_en.xlsx` | Official GLOBALG.A.P. workbook. Public on the document CDN. Independent cross-check of GFS criterion IDs, text and levels. |
| Technical News for CBs | `240819_Technical_News_CB_2024_02_en.pdf`, `260430_Technical_News_CB_2026_01_en.pdf` | Corrections issued between releases. A criterion's wording can change here without the P&C PDF being reissued. |

### Level 6 — Third-party summary

| Document | Origin | Assessment |
| --- | --- | --- |
| AGRINFO briefing, GLOBALG.A.P. IFA v6 | `https://agrinfo.eu/book-of-reports/globalgap-ifa-v6/pdf/` | **Not a GLOBALG.A.P. document.** A COLEAD/AGRINFO news summary. Accurate background, never treated as the standard. Fetched like any other HTTP source. |

---

## 3. Documents you cannot download

These are CB-only and must come from your pilot exporter's certification body.
Register them at level 6.

- **CB Extranet checklists** — the editable audit checklists CBs upload to the
  GLOBALG.A.P. database.
- **Audit method and justification guideline** — includes the list of
  operational and non-operational items that governs reduced-scope audits in
  years 2 and 3 of a cycle (per Technical News 02/2024).

---

## 4. Discovery and drift detection

**Do not scrape the document centre.** `https://www.globalgap.org/document-center`
is JavaScript-rendered and exposes no JSON API — `/api/documents`,
`/api/document-center` and `/api/search` all return 301. Anything built on
scraping it will break silently.

The reliable approach has three parts:

1. **A checked-in manifest** is the declared source of truth. Nothing enters
   the knowledge base that is not declared.

2. **A HEAD-based watcher** checks every known URL for `Last-Modified` or
   `Content-Length` drift, then re-downloads and compares SHA-256 before
   raising anything. Filenames are never trusted as identity — only content
   hashes are.

3. **A solution-page sweep** re-reads the server-rendered pages below and
   reports any `documents.globalgap.org` link not in the manifest. These pages
   carry the publisher's own "Key documents" list and are how the checklist
   URLs were found in the first place.

   - `https://www.globalgap.org/what-we-offer/solutions/ifa-fruit-and-vegetables`
   - `https://www.globalgap.org/what-we-offer/solutions/rms-checklist`

Out-of-band signals worth wiring in later: GLOBALG.A.P. publishes *Technical
News for CBs*, and under GR §2.2(c)(5) your certification body is obliged to
inform you of version and edition changes.

---

## 5. Copyright

GLOBALG.A.P. documents are free to download and use for certification purposes.
Reproducing full requirement text inside a commercial SaaS product is a
different question and is **not resolved**. Worth written clarification from the
GLOBALG.A.P. Secretariat before commercial launch.

The schema is built so this can be handled without re-architecting: every
document carries an authority level and licence metadata, so full text can be
gated per document while structure, identifiers and mappings stay queryable.
