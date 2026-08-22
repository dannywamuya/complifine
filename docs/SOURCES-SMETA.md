# SMETA / Sedex source registry

How CompliFine obtains SMETA 7.0 and the ETI Base Code, what is public, and
what must be dropped by an operator. Written the same way as
[SOURCES.md](SOURCES.md): identify the publisher channel, then register only
reviewed URLs.

Sedex is **not** a second principles-and-criteria set. Sedex is the membership
platform (company ZC, Self-Assessment Questionnaire, sharing audits with
buyers). SMETA is Sedex’s audit methodology. Current version: **SMETA 7.0,
June 2024**.

A site is measured against the **ETI Base Code**, **ILO conventions**, and
**local law** (whichever is more protective). Scopes:

| Scope | Covers |
| --- | --- |
| 2-pillar | Labour + health & safety |
| 4-pillar | The above, plus environment + business ethics |

These are parallel scopes, like IFA Smart vs GFS — not interchangeable.

There is **no** `documents.globalgap.org` for SMETA. Normative Workplace
Requirements live behind Sedex membership / e-Learning.

---

## Level 1 — what a site is measured against

### ETI Base Code (English)

Public. Official labour clauses SMETA audits against.

- Page: https://www.ethicaltrade.org/resources/guidance-and-reports/eti-base-code
- PDF: https://www.ethicaltrade.org/sites/default/files/shared_resources/eti_base_code_english.pdf

Copyright Ethical Trading Initiative. English is the official language.
Registered in the manifest as `eti-base-code-en` (`base_code`, authority 1).

### SMETA 7.0 Workplace Requirements

Official title: *Member Manual Annex 4 — The Workplace Requirements, August
2024 v1.0*. This is the P&C analogue.

**Member-gated.** Do not ingest Scribd, HubSpot guides, or AAC rehosts as
Level 1. Place the member PDF at:

```
storage/drops/smeta/SMETA-7.0-Workplace-Requirements.pdf
```

Then re-run `bun run kb parse` (or the console Ingest step) for
`smeta-7-2-pillar` / `smeta-7-4-pillar`. Fetch records the document as gated
rather than failed until the file appears. The file is hashed like every other
source.

---

## Level 2 — methodology

**SMETA 7.0 Auditor Manual v1.0, June 2024** consolidates the former Best
Practice Guidance and Measurement Criteria. Official for Affiliate Audit
Companies. Same drop pattern:

```
storage/drops/smeta/Sedex-Auditor-Manual-SMETA-7.0-June-2024.pdf
```

A third-party copy is not Level 1 until its SHA-256 matches a member original.

---

## Level 3 — assessment instruments

The Sedex **SAQ** lives on the platform, not a public XLSX. CompliFine does not
scrape it. Until an official mapping exists, a short SMETA site profile
(labour providers, worker-count band, accommodation) is stored as authored
scoping questions on the site.

---

## Level 4–5 — discovery and guidance

- https://www.sedex.com/solutions/smeta-audit/ — watcher discovery page
- SMETA 7.0 FAQs (July 2024) — MSA, CAR; observations removed
- Marketing “complete SMETA guides” — never a requirement source

The watcher scrapes the discovery pages with the SMETA URL pattern and reports
unmanifested PDFs. Adoption stays a reviewed diff.

---

## Findings vocabulary

SMETA 7.0 uses **NC**, **CAR** (Collaborative Action Required; no prescribed
close date), and **MSA** grades. Observations are obsolete. These are not
Major Must / Minor Must / Recommendation. Requirement level is stored as text
plus `level_scheme = smeta_7` on the version.

---

## ILO

Conventions the Base Code cites (C29, C87, C98, C100, C105, C111, C138, C182,
…) via NORMLEX are related instruments, not SMETA clauses. They are not
ingested as requirements in this phase.

---

## Copyright

Email Sedex and ETI before selling full Workplace Requirement or Base Code
text in a SaaS product, the same flag as the GLOBALG.A.P. Secretariat. The
bytes stay in `storage/` (gitignored).
