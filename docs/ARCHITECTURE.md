# Architecture

CompliFine is a Bun workspace. The interesting boundary is not "frontend vs
backend". It is **facts vs language**.

The database answers questions of fact: what FV-Smart 20.01 says, whether it is
a Major Must, whether it applies to a producer who does not irrigate, what
changed between Smart and GFS. The model is only allowed to do the things a
database cannot: read a question, choose which facts to fetch, and write prose.

That split is why ingestion is deterministic, why the agent is a set of tools
rather than a prompt stuffed with the standard, and why a citation that names
a criterion the tools never returned is a failure rather than a flourish.

## Packages

```
complifine/
  packages/core        identifiers, enums, env, errors, hashing
  packages/db          Drizzle schema, client, migrations, seeds
  packages/ingestion   adapters, fetch, parse, map, gate, publish
  packages/ai          chunk, embed, search, agent, eval
  packages/chat        shared assistant UI (web + console)
  apps/api             HTTP: JWT auth, demo, farm, knowledge, ingest, chat
  apps/web             marketing site + producer app (`/app`)
  apps/console         operator console (ingest, gates, demo inbox)
  infra/               Postgres 17 + pgvector
```

Workspaces share TypeScript path aliases. There is no compiled `dist/`: Bun
imports `.ts` files directly.

## Data flow

```
documents.globalgap.org  +  ethicaltrade.org  +  member-gated drops
        │  fetch (SHA-256, Last-Modified, byte-for-byte storage)
        ▼
  storage/<publisher>/…
        │  StandardAdapter (GlobalGapAdapter | SmetaAdapter)
        ▼
  Postgres
   requirements, sections, applicability, documents, gates
   users, organizations, sites, controls
        │  chunk (one criterion = one chunk; GR by heading; ETI by clause)
        ▼
  document_chunks  ──embed──►  chunk_embeddings
        │
        ├─ hybrid search
        └─ tenant-aware agent tools
                │
                ▼
         apps/api  ──►  apps/web (`/` marketing, `/app` product)
                   ──►  apps/console (operators)
```

Nothing in the right-hand column writes requirement text. The agent can fail to
find a criterion; it cannot invent one that survives the grounding check.

## Why two editions are two versions

IFA v6 Smart and IFA v6 GFS look like variants of one standard. The source data
says otherwise: the two checklists share **zero** criterion GUIDs, GFS has one
extra criterion, and fourteen shared numbers are graded more strictly in GFS.

They are modelled as two `standard_versions` of one `standard`. Correspondence
is an explicit `requirement_relationships` row, tagged as our mapping rather
than the publisher's assertion. Collapsing them into one version with a flag
would make "what is FV 03.01?" ambiguous and would hide the escalations.

## Authority

Every document carries an authority level (1 = principles and criteria, 8 = AI
interpretation). Retrieval can exclude anything above 3. The IFA guideline
states on its own cover that it is a recommendation; it is stored, searchable,
and may not be cited as a requirement.

Copied onto every chunk so the hot path does not join to remember that.

## Publication

A version moves `draft → ingesting → extracted → validation → review →
approved → published`. Quality gates run at the `approved → published` step
and block on mismatch with numbers the publisher states independently of the
file being parsed. A human review is a named person and a stored decision, not
a comment on a chat transcript.

## What the model never does

- Extract criteria from the checklist. The XLSX is already a relational
  database (`PIs`, `S2PQ`, `S2PQ_relational`). See [WORKBOOK-STRUCTURE.md](WORKBOOK-STRUCTURE.md).
- Decide applicability. `filterChecklist` applies the publisher's own
  question-to-criterion map.
- Compare editions. `compareEditions` reads `requirement_relationships`.
- Invent a citation. The answer is scanned for criterion IDs; any ID that was
  not in a tool result is returned as `ungroundedCitations`.

## Services

| Process | Port | Command |
| --- | --- | --- |
| Postgres + pgvector | 5434 | `bun run db:up` |
| HTTP API | 3311 | `bun run api` |
| User app | 3000 | `bun run web` |
| Operator console | 3001 | `bun run console` |

The user app is a public marketing site plus a signed-in producer product under
`/app` (ask, farm profile). The console is for ingesting, reviewing, publishing
and reading demo requests. Both talk only to the API, via `/api` rewrites so
JWT cookies stay same-origin.

Auth is Elysia JWT (`cf_access` / `cf_refresh` httpOnly cookies, or
`Authorization: Bearer`). Knowledge tables are global. Sites, scoping answers
and conversations hang off `organizations`.

SMETA 7.0 is adapter #2. Until the member Workplace Requirements PDF is dropped
at `storage/drops/smeta/`, the knowledge base answers from the public ETI Base
Code and refuses invented WR numbers. See [SOURCES-SMETA.md](SOURCES-SMETA.md).
