# Retrieval and the agent

The standard is small enough to put in a prompt and too important to trust a
model's memory of. Retrieval exists so the model is never the source.

## Chunking

Requirements are never split. One criterion is one chunk, with a breadcrumb
heading that names the number, the section and the subsection. A hit is then
always a complete, citable rule. Splitting "records shall be retained for two
years" off the sentence that says *which* records would produce an answer that
reads finished and is wrong.

Prose (General Regulations, guidelines) splits on headings. Only a section that
still exceeds the token budget is windowed, and the window respects sentence
boundaries, including the abbreviations this corpus uses constantly (`e.g.`,
`i.e.`, `No.`, `GLOBALG.A.P.`).

Every chunk stores `content_hash`. Re-indexing a corpus that has not changed
embeds nothing.

## Embeddings

Default model: `text-embedding-3-small`, 1536 dimensions, matching the
pgvector column.

A deterministic `hash-bow-v1` embedder exists so tests and CI can exercise the
SQL, fusion and filters without an API key. It is not semantic. Hybrid search
down-weights a non-semantic embedder (RRF weight 0.25) so it cannot drown
lexical ranking with noise.

Query vectors must come from the same model that built the index. Comparing
two 1536-dimensional spaces is not a type error and looks like search. The
query embedder therefore inspects `chunk_embeddings` and follows the index,
not the `.env` file, when they disagree.

Both models can be stored at once. `bun run ai index` writes the configured
model; `--local` writes the hash embedder.

## Hybrid search

Three retrievers, because each fails in a way the others do not.

1. **Identifier lookup.** `FV-Smart 32.10.06` has one correct row. Sending it
   to a vector index is slower and capable of being wrong. An exact number
   short-circuits everything else.
2. **Lexical, IDF-weighted.** Compliance vocabulary is precise. Postgres
   `ts_rank_cd` without IDF ranks a criterion that repeats a common word above
   one that uses a rare term of art. The lexical retriever sums BM25-style IDF
   over query terms and uses `ts_rank_cd` as a tiebreaker.
3. **Semantic.** Producers do not say "re-entry times". They say "when can
   workers go back into the field after spraying". That query shares no content
   word with the criterion it must find.

The two ranked lists are fused with Reciprocal Rank Fusion (`k = 60`). The IDF
sum is unbounded; cosine is in `[-1, 1]`. Adding them requires a mapping nobody
can justify. RRF uses only ranks.

Filters match the tool the agent will actually call: farm-practice questions
search `requirement` chunks; certification-process questions search `section`
chunks. Scoring unfiltered hybrid search would measure a mode the product
never uses.

## Agent

Nine tools, all lookups:

| Tool | Answers |
| --- | --- |
| `searchRequirements` | Farm-practice retrieval over criterion chunks |
| `searchGeneralRegulations` | Certification-process retrieval over GR sections |
| `getRequirement` | Full text of one criterion |
| `listSections` / `getSection` | Outline and prose |
| `getApplicability` | The 16 scoping questions |
| `filterChecklist` | Publisher's own applicability map, applied |
| `compareEditions` | Stored Smart ↔ GFS relationships |
| `getDocument` | Provenance for a source file |

The system prompt forbids answering from training data. After generation, the
answer is scanned for criterion IDs. Any ID that did not appear in a tool
result is returned as `ungroundedCitations` and shown in the UI.

Every run is stored: question, answer, citations, token counts, and each tool
call with arguments and duration.

## Evaluation

Two suites, deliberately separable.

**Retrieval** (`bun run ai eval retrieval`) scores search alone: recall@5,
MRR, recall@10. It needs no chat model. With the hash embedder it needs no
key, so it can run in development without billing. With OpenAI embeddings it
measures the system operators actually query.

**Answer** (`bun run ai eval answer`) scores the agent: required phrases,
forbidden phrases, refusal on questions the corpus cannot answer, and
citation grounding. It costs tokens and runs on demand.

Cases live in `packages/ai/src/eval/cases.ts`. Every expected criterion number
was read out of the ingested database, not recalled. Paraphrase cases are
written in producer language on purpose. Refusal cases exist so a system that
says "yes, you must" to everything cannot look good.

Results are written to `eval_results` under a shared run id, so two runs can
be compared with a query rather than two terminal scrollbacks.

Against the OpenAI index (`text-embedding-3-small`, 1053 vectors), with filters
matching the agent tools, the retrieval suite last scored **33/38 (86.8%)**
recall@5, **97.4%** recall@10, MRR **0.73**. Identifier, level and
cross-edition cases are all passing. Remaining misses are producer paraphrases
that land just outside the top five (water testing, smoking, protected areas)
and two General Regulations headings. The hash embedder scores much lower on
the same cases; that is why it is down-weighted, not used as the production
query model.

## Changing the embedding model

The vector column width is part of the Postgres type. A new family with a
different size needs:

1. A Drizzle migration changing `EMBEDDING_DIMENSIONS` and the column.
2. `bun run ai index --force` to fill `chunk_embeddings` for the new model.
3. A retrieval eval against the new index before switching `EMBEDDING_MODEL`
   in production.

Keeping the old rows until the eval passes is why embeddings are a separate
table.
