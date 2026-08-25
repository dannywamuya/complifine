#!/bin/sh
set -eu

mkdir -p "${STORAGE_ROOT:-/data/storage}"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  bun packages/db/src/migrate.ts
fi

exec bun apps/api/src/index.ts
