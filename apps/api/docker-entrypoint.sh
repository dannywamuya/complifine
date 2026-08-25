#!/bin/sh
set -eu

mkdir -p "${STORAGE_ROOT:-/data/storage}"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  bun packages/db/src/migrate.ts
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  bun packages/db/src/seed.ts
fi

exec bun apps/api/src/index.ts
