# Runbook

Operate CompliFine without rereading the architecture.

## First run

```bash
cp .env.example .env          # set OPENAI_API_KEY, FETCH_USER_AGENT
bun install
bun run bootstrap
```

`bootstrap` will:

1. Create `.env` if missing
2. Start `complifine-postgres` (port **5434**) and wait until it is **healthy**,
   not merely accepting TCP (initdb accepts connections, then restarts)
3. Migrate
4. Fetch and ingest both editions
5. Embed if a key is present

Re-run after fixing a problem. Every step is idempotent.

Skip Docker with `--skip-docker` if `DATABASE_URL` already points at a
Postgres 16+ with `vector` and `pg_trgm`. Skip embeddings with `--skip-index`.

## Daily

| Want | Command |
| --- | --- |
| Coverage | `bun run kb status` / `curl localhost:3311/status` |
| One criterion | `bun run kb show "FV 03.01"` |
| Smart vs GFS | `bun run kb diff` |
| Gates | `bun run kb gates` or `/gates` in the UI |
| Search | `bun run ai search "…"` or `/search` (chat; Passages for retrieval only) |
| Ask | `bun run ai ask "…"` or `/search` |
| API docs | http://localhost:3311/swagger |

Start API, the user app and the console from the **repo root** in three
terminals: `bun run api`, `bun run web`, `bun run console`. Environment
variables live in the root `.env`; the API loads that file even if you start
it from `apps/api`.

## Re-ingest

```bash
bun run kb all                 # fetch + parse + map + gate
bun run ai index               # only embeds chunks whose hash changed
bun run ai index --force       # ignore hashes, re-embed everything
```

Fetch skips unchanged files by SHA-256. A publisher that reuses a filename
with new bytes is a new document; the old bytes stay in content-addressed
storage.

## Quality gates failed

Read [QUALITY-GATES.md](QUALITY-GATES.md). Blocking failures stop
`approved → published`. Advisory failures do not.

Common causes:

- Partial ingest (re-run `bun run kb all`)
- A parser change that dropped a section (look at `ingestion_events`)
- Comparing the April 2022 *Summary of Changes* Major Must counts to the Sep
  2022 / Aug 2024 workbooks — that discrepancy is documented and accepted

Refresh stored results: `GET /versions/{code}/gates?refresh=true`.

## Search looks wrong

1. `bun run ai status` — confirm the index is `text-embedding-3-small`, not
   only `hash-bow-v1`. A key added after ingest does not retroactively embed.
2. `bun run ai index` if OpenAI rows are missing.
3. Identifier queries should short-circuit. If `FV-Smart 03.01` goes through
   hybrid search, the number is not canonicalising; check
   `canonicalizeCriterionNumber`.
4. Farm-practice questions search requirement chunks; GR questions search
   section chunks. Mixing them in eval is a measurement error, not a retrieval
   bug.

## Agent refuses or cites the wrong ID

- No key: `/ask` returns 503. Search still works.
- Quota: the OpenAI client distinguishes billing from rate-limit; wait or add
  credit.
- Ungrounded citation: the model named a criterion the tools did not return.
  That is shown in the UI on purpose. Tighten the question or inspect the tool
  trace; do not "fix" it by stripping the check.
- Empty tools: the embedder used for the query does not match the index. See
  `embedderForQuery`.

## Postgres

```bash
bun run db:up
bun run db:logs
bun run db:psql
bun run db:nuke                 # destroys the volume
```

`db:nuke` is the recovery path for a broken initdb (extensions missing,
`complifine_en` text-search config absent). You will need to ingest again.

Health check uses `pg_isready`. If the container is `unhealthy` after 90s,
`bun run db:logs` almost always shows a permission or volume problem.

## Embeddings after adding a key

If you bootstrapped without `OPENAI_API_KEY`:

```bash
# put the key in .env
bun run ai index
bun run ai eval retrieval
```

Hash embeddings can stay. Queries prefer the OpenAI model once its rows exist.

## CI

`.github/workflows/ci.yml` runs `bun test` and `bun run typecheck`. It does
not start Postgres and does not call OpenAI. Retrieval eval against the real
index is an operator command, not a PR gate, because it needs the ingested
corpus.

## Ports

| 5434 | Postgres |
| 3311 | API |
| 3000 | User app |
| 3001 | Operator console |
