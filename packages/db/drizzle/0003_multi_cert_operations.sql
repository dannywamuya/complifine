-- Enum values that later statements in 0004 must see as committed.
-- Postgres forbids using a newly added enum value in the same transaction.
-- `packages/db/src/migrate.ts` applies each journal file in its own
-- transaction so this commit lands before 0004.

ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'base_code';
ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'methodology';
ALTER TYPE "applicability_source" ADD VALUE IF NOT EXISTS 'eti_official';
ALTER TYPE "applicability_source" ADD VALUE IF NOT EXISTS 'smeta_official';
