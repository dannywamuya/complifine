# Data model

Identity is the publisher's GUID. Wording is versioned. Retrieval is a
projection of those facts, not a second copy of the standard.

Drizzle schema lives in `packages/db/src/schema/`. Enums are declared once in
`@complifine/core` and imported into the schema so the Postgres constraint and
the TypeScript union cannot drift.

## Core

### `standards` / `standard_versions`

A `standard` is the scheme (`globalgap-ifa`). A `standard_version` is one
immutable published edition for one product scope:

- `ifa-v6-smart-fv`
- `ifa-v6-gfs-fv`

Smart and GFS are separate versions, not flags on one version. Their GUID
namespaces are disjoint.

Status is a state machine: `draft`, `ingesting`, `extracted`, `validation`,
`review`, `approved`, `published`, `retired`.

### `standard_documents`

One official file. Authority level, document type, source URL, SHA-256,
`Last-Modified`, byte size, MIME, retrieval time. Filenames are reused by the
publisher; hashes are not.

### `standard_sections`

The outline of a document: checklist sections/subsections, or General
Regulations headings. `source_identifier` is the publisher's number (`03`,
`03.01`, `GR 2.1`). Nested via `parent_id`.

## Requirements

### `requirements`

Stable identity across editions of a standard. `stable_key` is GLOBALG.A.P.'s
own GUID from the checklist `PIs` table (e.g. `1Gmd3v6po0V454XQEGKJ0x`). Unique
per standard, not per version, so a future v6.1 that reuses a GUID is the same
requirement with a new wording row.

This does **not** unify Smart and GFS. Those GUIDs never overlap.

### `requirement_versions`

What one published version says: principle text, criteria text, level
(`major_must` / `minor_must` / `recommendation`), page, NA-exempt flag, PHU
flag, sort key, source requirement id (`FV-Smart 03.01`).

Principle and criteria are stored separately because they are separate columns
in the source and because an answer that quotes the principle as if it were
the audit criterion is a specific, catchable error.

### `requirement_relationships`

Cross-edition mapping: 190 shared, 1 GFS-only, 14 level escalations. Origin is
tagged so a later official mapping can replace our inference without rewriting
history.

## Applicability

### `applicability_questions`

The 16 official scoping questions from the `S2PQ` table, with the publisher's
justification template and the exempting answer.

### `requirement_applicability`

`S2PQ_relational`: which question, answered which way, drops which criterion.
Source = `globalgap_official`. `filterChecklist` is a join, not a prompt.

### `checklists` / `checklist_items`

The auditor-facing list derived from the workbook, with cell-level row refs
back to the XLSX.

## Ingestion and governance

### `ingestion_jobs` / `ingestion_events`

Pipeline runs and the structured log of what each step did. Re-runs are
idempotent; events are how you see *why* a document was skipped.

### `quality_gate_results`

One row per named gate per version. Re-running overwrites, so the table is
current truth; `checked_at` says how fresh. Publication reads this table.

### `knowledge_reviews`

Named reviewer, decision (`approved` / `rejected` / `changes_requested`),
notes, timestamp. Required before a version can be published.

### `audit_logs`

State transitions and who requested them.

## Retrieval

### `document_chunks`

Retrievable text. Two kinds:

- `requirement` — one row per `requirement_version`. Never split. Heading is
  the breadcrumb (`FV-Smart 32.10.06 — …`).
- `section` — General Regulations and guidelines, heading-bounded, overlapping
  windows only when a section exceeds the token budget.

`search_vector` is a stored generated `tsvector` with the heading weighted `A`
and the body `B`, using the `complifine_en` text-search config created in
`infra/initdb`. Authority level is denormalised from the parent document.

`content_hash` is SHA-256 of heading + text. It drives embedding reuse.

### `chunk_embeddings`

One vector per chunk per model. Separate from chunks so a new model is an
insert, not a rewrite, and two models can coexist while you compare them.

Column width is 1536 (`text-embedding-3-small`). Changing family is a
migration; see [RAG.md](RAG.md). Indexed with HNSW over cosine distance.

### `retrieval_logs` / `agent_runs` / `agent_tool_calls` / `eval_results`

Every search, every tool call, every eval case. Tuning fusion without logs is
guesswork; reconstructing an agent answer without them is impossible.

## Authority levels

| Level | Meaning | Citable as a requirement? |
| --- | --- | --- |
| 1 | Official standard (P&Cs) | yes |
| 2 | Official regulations | yes |
| 3 | Official checklist | yes |
| 4 | Official guidance | no |
| 5 | Official update | no |
| 6 | CB guidance | no |
| 7 | Company practice | no |
| 8 | AI interpretation | no |

The guideline's own cover page says it is a recommendation. The schema
believes it.
