-- Database prerequisites: everything that must exist before the first Drizzle
-- migration runs, because the schema declares `vector(1536)` columns, trigram
-- indexes and generated tsvector columns at table-creation time.
--
-- This file is the single source of truth for those prerequisites. Docker runs
-- it via /docker-entrypoint-initdb.d on a fresh volume; `bun run db:migrate`
-- reads and executes this exact file before migrating, so a database that was
-- not created by our compose file (a colleague's, or a hosted one) ends up in
-- the same state. Every statement is therefore idempotent.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Text search configuration used by every full-text index in the schema.
-- Named explicitly rather than relying on `default_text_search_config`, which
-- varies by host locale and would silently change lexeme output - and with it
-- the contents of generated tsvector columns.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'complifine_en') THEN
    CREATE TEXT SEARCH CONFIGURATION complifine_en (COPY = english);
  END IF;
END
$$;

-- Fold accents before stemming, so that a producer searching for "Ruckstande"
-- finds "Rückstände" and one searching for "GLOBALGAP" is not defeated by the
-- punctuation in "GLOBALG.A.P.".
--
-- Applied unconditionally: re-applying the same mapping is a no-op, so this
-- cannot silently invalidate tsvector columns that were generated earlier.
ALTER TEXT SEARCH CONFIGURATION complifine_en
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, english_stem;
