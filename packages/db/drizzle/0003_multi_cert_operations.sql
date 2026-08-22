-- Enum values that later statements in 0004 must see as committed.
-- Postgres forbids using a newly added enum value in the same transaction.
-- Drizzle also wraps every pending journal file in one transaction, so
-- `packages/db/src/migrate.ts` executes this file and commits it first.

ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'base_code';
ALTER TYPE "document_type" ADD VALUE IF NOT EXISTS 'methodology';
ALTER TYPE "applicability_source" ADD VALUE IF NOT EXISTS 'eti_official';
ALTER TYPE "applicability_source" ADD VALUE IF NOT EXISTS 'smeta_official';
