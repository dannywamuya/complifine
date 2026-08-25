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
4. Seed the operator user (`OPERATOR_EMAIL` / `OPERATOR_PASSWORD`) and the
   pilot control library
5. Fetch and ingest GLOBALG.A.P. IFA v6 and the public ETI Base Code
6. Seed again so SMETA profile questions and control-to-requirement links attach
7. Embed if a key is present

Re-run after fixing a problem. Every step is idempotent.

Skip Docker with `--skip-docker` if `DATABASE_URL` already points at a
Postgres 16+ with `vector` and `pg_trgm`. Skip embeddings with `--skip-index`.

## Migrations

Always apply schema with `bun run db:migrate`, not `drizzle-kit migrate`.
Postgres will not let a newly added enum value be used until that `ALTER TYPE
… ADD VALUE` has been committed, and Drizzle wraps every pending journal file
in one transaction. The runner therefore commits `0003_multi_cert_operations.sql`
(new `document_type` / `applicability_source` labels) before applying the rest.

Then seed: `bun run db:seed`.

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

## CI / CD

Push to `main`, `dev`, or `staging` runs GitHub Actions (`.github/workflows/ci.yml`):
`bun test` and `bun run typecheck`. That workflow does not start Postgres and
does not call OpenAI. Retrieval eval against the real index is an operator
command, not a PR gate.

Deploy and migrate are Railway's job, after CI is green:

1. One Railway **environment** per branch (`production` ← `main`, `staging` ←
   `staging`, `development` ← `dev`). Each environment has its own Postgres,
   API, web, and console.
2. Each environment **watches that branch**. A push builds the Dockerfiles.
3. On the API service, enable **Wait for CI** so a failing test blocks the
   deploy. The check name is **Test and typecheck**.
4. API **Pre-deploy command** (already in `apps/api/railway.toml`):

   ```text
   sh -c 'bun packages/db/src/migrate.ts'
   ```

   Use `bun run db:migrate`, not `drizzle-kit migrate`. The runner applies
   extension prerequisites and commits enum `ADD VALUE` files before Drizzle's
   migrator. Pre-deploy has `DATABASE_URL` and the private network; GitHub
   Actions does not.

5. Set `RUN_MIGRATIONS=false` on the Railway API service so a replica restart
   does not migrate again. Local `docker compose` still migrates on API start.

Do not migrate from GitHub Actions unless you expose a public `DATABASE_URL`
and accept that Actions and Railway can race. Pre-deploy is the gate that
keeps the old API up until schema is applied.

Seed, ingest, and embed are still one-off (`db:seed`, `kb all`, `ai index`),
not every deploy.

## Ports

| 5434 | Postgres |
| 3311 | API (`/swagger`, `/auth`, `/demo-requests`) |
| 3000 | Marketing site + producer app (`/app`) |
| 3001 | Operator console (sign in as `OPERATOR_EMAIL`) |

## Docker deploy

Production images live next to each app (`apps/api/Dockerfile`,
`apps/web/Dockerfile`, `apps/console/Dockerfile`). Always build from
`complifine/` so Bun can resolve `workspace:*`.

```bash
docker compose up --build
```

The API listens on `PORT` when that variable is set (Railway, Fly, Compose),
otherwise `API_PORT` (default 3311), on `0.0.0.0`. Set `STORAGE_ROOT=/data/storage`
and mount a volume there.

Web and console proxy `/api` using `API_PROXY_TARGET`. That value is read at
**Next build** for rewrites and at **runtime** for Server Components. Compose
defaults it to `http://api:3311`. On Railway, use the API service private
domain and port as a Docker build argument and as a runtime variable.

`nixpacks` is not used; do not let a host run `npm install` at an app
`package.json`.

## Auth

Producer register/login is `/signup` and `/login` on :3000. The console is
operator-only. JWT cookies (`cf_access`, `cf_refresh`) are set by the API and
sent through the Next `/api` rewrite so they stay same-origin.

`bun run db:seed` (also part of bootstrap) creates or updates the operator.

## SMETA member drop

Workplace Requirements are not on a public CDN. After a Sedex member obtains
the official PDF:

```bash
mkdir -p storage/drops/smeta
cp /path/to/member-file.pdf storage/drops/smeta/SMETA-7.0-Workplace-Requirements.pdf
bun run kb parse --version smeta-7-4-pillar
bun run ai index
```

Until that file exists, ingest still fetches the public ETI Base Code. The
agent must refuse invented Workplace Requirement numbers. See
[SOURCES-SMETA.md](SOURCES-SMETA.md).

## Answer evaluation

```bash
bun run ai eval retrieval          # no chat model
bun run ai eval answer             # costs tokens; needs OPENAI_API_KEY
bun run ai eval all
```

