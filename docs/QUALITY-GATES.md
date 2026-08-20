# Quality gates

A standard version may not reach `published` until every gate below passes.
Gates are assertions against numbers the publisher states independently of the
file being parsed, so a parser bug cannot satisfy its own test.

Enforced at the `approved` to `published` transition. A failing gate raises
`QualityGateError` and blocks the transition.

---

## Measured constants

Read directly from the official workbooks. These are the expected values.

| Gate | Smart | GFS |
| --- | --- | --- |
| Criteria imported | **190** | **191** |
| Distinct publisher GUIDs | **190** | **191** |
| Major Must | **103** | **118** |
| Minor Must | **67** | **53** |
| Recommendation | **20** | **20** |
| Sections | **33** | **33** |
| Subsections | **38** | **39** |
| Depth-3 criteria | **110** | **111** |
| Scoping questions | **16** | **16** |
| Applicability mappings | **250** | **145** |

---

## G1 — Criterion count

Smart imports exactly 190 criteria, GFS exactly 191.

Independently corroborated by the official *Summary of Changes IFA v5 to v6*,
which tabulates total P&Cs as 222 (v5.2), 190 (v6 Smart), 191 (v6 GFS). Two
unrelated documents agreeing on the count is what makes this gate meaningful.

## G2 — Identity integrity

- Every criterion has a publisher GUID matching `^[0-9A-Za-z]{20,22}$`.
- GUIDs are unique within an edition: 190 rows yield 190 distinct GUIDs.
- Every criterion number parses to a canonical form.
- Numbers are unique within an edition.

Catches the most damaging class of import bug: a placeholder (`-`, `#N/A`) or a
composite key (`<guid>NO`) written into an identity column.

## G3 — Level classification

Every criterion has a level from the closed set, and the counts match the table
above exactly. No criterion may have a null or unrecognized level.

The Smart split (103/67/20) sums to 190 and the GFS split (118/53/20) to 191,
so G3 also re-proves G1 by a different route.

> **Known discrepancy, accepted.** The April 2022 *Summary of Changes* gives
> Major Must counts of 102 (Smart) and 117 (GFS) — one lower than measured in
> both cases, while totals agree exactly. That summary is dated `v1.0_Apr22`
> and predates both the Sep 2022 Smart release and the Aug 2024 GFS release; a
> single criterion was regraded to Major Must in each edition after it was
> written. The gate uses the values measured from the current published
> workbooks, which are the authority. This is recorded rather than silently
> tolerated so the next person to notice the mismatch does not re-derive it.

## G4 — Text completeness

- Every criterion has non-empty principle text.
- Criteria text is present, or its absence is explicitly recorded.
- No text contains an unresolved placeholder (`#N/A`, `#REF!`, a bare `-`).
- No text is a truncated shared-string index — that is, no requirement text is
  a bare integer.

## G5 — Structural integrity

- Every criterion resolves to a section that exists in `unique_sections`.
- Every depth-3 criterion resolves to a subsection in `unique_sub`.
- Section and subsection numbers derived from criterion numbers agree with the
  section GUIDs the workbook assigns. This is a genuine cross-check: the two
  facts are stored independently in the source, so agreement means neither the
  hierarchy import nor the number parser is wrong.
- 33 sections, matching the 33 entries in the P&C table of contents.

## G6 — Cross-document reconciliation

For every criterion imported from the workbook, its text must be locatable in
the P&C PDF.

- Trigram coverage of criterion text against its located PDF page ≥ **0.95**.
- ≥ **98%** of criteria are located on some page.
- Every located criterion gets a page number recorded for citation.

Coverage rather than a symmetric similarity, because a page holds several
criteria plus headers and footers; see `ngramCoverage` in
`packages/core/src/text.ts`.

Failures are reported per criterion with both texts, so a reviewer adjudicates
a real discrepancy rather than a formatting artefact.

## G7 — Applicability integrity

- 16 scoping questions imported per edition.
- Every mapping references a criterion GUID and a question GUID that both
  exist. No orphans.
- The `PIGUID & "NO"` composite in column D decomposes to the row's own
  `PIGUID` — verifying the relation the workbook asserts about itself.
- Every question carries the official justification text.

## G8 — Provenance

Non-negotiable, from PRD section 20.

- Every requirement links to the source document it came from.
- Every source document has a SHA-256 matching its stored bytes.
- Every requirement carries a source location: sheet, row and columns for
  workbook rows, page for PDF-derived facts.
- No published requirement derives from a source above authority level 3.

## G9 — Retrieval readiness

Applies to the embedding index rather than the requirement set.

- Every published requirement has at least one chunk.
- Every chunk has an embedding of exactly the configured dimension.
- Every chunk carries the metadata needed to cite it.
- Exact-ID lookup returns the right criterion for all 190 Smart and 191 GFS
  identifiers. A retrieval layer that cannot find `FV-Smart 03.01` when asked
  for it by name is not usable regardless of how good its semantic search is.

---

## Running them

```bash
bun kb gates --version v6-smart
bun kb gates --version v6-gfs --verbose
```

Exit code is non-zero if any gate fails, so this is CI-usable. `--verbose`
prints per-criterion detail for every failure.
