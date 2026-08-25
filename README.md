# CompliFine

A knowledge base and operations layer for **GLOBALG.A.P. IFA v6 Fruit & Vegetables**
(Smart and GFS) plus **SMETA 7.0** (ETI Base Code public; Workplace Requirements
member-gated). Built from the publishers' own files, not from a model's memory
of them.

Every criterion keeps its number, its level, its page, and the SHA-256 of the
source it came from. The agent may only answer from those records. Citations
that name a criterion the tools never returned are flagged, not trusted.

## What is in here

| Layer | What it does |
| --- | --- |
| Ingestion | Fetch official documents, parse the checklist XLSX and the PDFs, map Smart to GFS, run quality gates |
| Knowledge base | Postgres + pgvector. 190 Smart criteria, 191 GFS, 16 scoping questions, publisher GUIDs as identity |
| Retrieval | Identifier lookup, then IDF-weighted full text fused with embeddings by Reciprocal Rank Fusion |
| Agent | Tools over the database, including the signed-in farm profile. The model chooses what to fetch; the database answers questions of fact |
| API | Elysia on port 3311. JWT auth, OpenAPI at `/swagger` |
| Web | Next.js on port 3000. Marketing site, Book a Demo, producer `/app` |
| Console | Next.js on port 3001. Ingest, gates, review, demo inbox. Operator login |

## Requirements

- [Bun](https://bun.sh) 1.2+
- Docker (for Postgres 17 + pgvector, and for deploying the apps)
- An OpenAI key for embeddings and the agent. Everything else runs without it.

## Quick start

```bash
cp .env.example .env          # then set OPENAI_API_KEY
bun install
bun run bootstrap             # Docker Postgres, migrate, ingest, embed
bun run api                   # http://localhost:3311
bun run web                   # http://localhost:3000  (producers)
bun run console               # http://localhost:3001  (operators)
```

`bootstrap` is idempotent. Re-run it after fixing a missing key or a dead Docker
daemon; it resumes rather than starting over.

Without a key, the knowledge base, quality gates, lexical search and the whole
CLI still work. Semantic search and `/ask` wait until you add one and run
`bun run ai index`.

## Docker deploy

Each app has a Dockerfile. Build context is this directory (`complifine/`), not
the app folder — Bun workspaces cannot be installed from a nested package.

```bash
cp .env.example .env          # JWT_SECRET, OPENAI_API_KEY, operator login
docker compose up --build     # Postgres, API :3311, web :3000, console :3001
```

Then migrate/seed/ingest as needed (`docker compose exec api bun run db:seed`,
`docker compose exec api bun run kb all`, `docker compose exec api bun run ai index`).
The API image runs migrations on start (`RUN_MIGRATIONS=true`).

On Railway the GitHub repo **is** this folder. Leave **Root Directory empty**
on every service. Do not set it to `complifine` or `apps/api` — that makes
Docker copy only the API package, and Bun fails with `workspace:* not found`.

| Service | Root Directory | Dockerfile path | Variables |
| --- | --- | --- | --- |
| api | *(empty)* | `apps/api/Dockerfile` | [apps/api/.env.example](apps/api/.env.example) |
| web | *(empty)* | `apps/web/Dockerfile` | [apps/web/.env.example](apps/web/.env.example) |
| console | *(empty)* | `apps/console/Dockerfile` | [apps/console/.env.example](apps/console/.env.example) |

Map one Railway environment per branch: `main` → production, `dev` →
development, `staging` → staging. GitHub Actions tests those branches; Railway
should **Wait for CI** on the API so a red check stops the deploy. Details in
[the runbook](docs/RUNBOOK.md#ci--cd).

Use **Bun**, never npm (`workspace:*` will fail). Give the API a volume at
`/data/storage`. Set `PORT` (injected by Railway) and `DATABASE_URL`.

On **web**, copy [apps/web/.env.example](apps/web/.env.example). The one
required runtime variable is:

`API_PROXY_TARGET=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`

On **console** (admin), copy [apps/console/.env.example](apps/console/.env.example)
— same `API_PROXY_TARGET`, no calendar URL, no producer secrets.

Use the API service's exact name in place of `api`. Browser calls stay on
`/api`. Do not put `DATABASE_URL` or `JWT_SECRET` on web or console.

Do not run `docker compose up` and `bun run db:up` at the same time; both bind
Postgres on **5434**.

## Everyday commands

```bash
bun run kb status                      # what is in the knowledge base
bun run kb show "FV 03.01"             # one criterion, with provenance
bun run kb diff                        # Smart vs GFS
bun run kb gates                       # blocking publication checks

bun run ai search "when can workers go back after spraying"
bun run ai ask "Do I need to test my irrigation water?"
bun run ai eval retrieval              # recall@5 / MRR, no chat model
bun run ai eval answer                 # agent answers, costs tokens

bun test
bun run typecheck
```

Postgres is on **5434** so it does not collide with other local instances.

## Editions

Smart and GFS are parallel, equally valid editions. They are not interchangeable:

- 190 shared criteria
- 1 GFS-only criterion (`FV-GFS 33.07.01`)
- 14 Smart → GFS level escalations (Minor Must or Recommendation raised to Major Must)

Cross-edition correspondence is stored as an explicit relationship. The two
workbooks share zero publisher GUIDs, so identity is not inferred from numbers.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — packages, data flow, why the seams are where they are
- [Data model](docs/DATA-MODEL.md) — tables, identity, authority levels
- [Retrieval and the agent](docs/RAG.md) — chunking, hybrid search, tools, eval
- [Quality gates](docs/QUALITY-GATES.md) — the numbers that must match the publisher
- [Sources](docs/SOURCES.md) — GLOBALG.A.P. official files, authority, licence notes
- [SMETA sources](docs/SOURCES-SMETA.md) — ETI public vs Sedex member-gated
- [Workbook structure](docs/WORKBOOK-STRUCTURE.md) — the hidden Excel tables
- [Runbook](docs/RUNBOOK.md) — operate, recover, re-index, drop a SMETA file

## Licence

Code in this repository is original. The GLOBALG.A.P. documents it ingests are
not: they stay in `storage/` (gitignored) and remain the publisher's copyright.
See [docs/SOURCES.md](docs/SOURCES.md).
