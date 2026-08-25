#!/bin/sh
# Railway API pre-deploy: schema then operator (and control library).
# Runs once per deploy in a throwaway container with DATABASE_URL.
# Failures abort the release; the previous API stays live.
set -eu

echo "==> migrate"
bun packages/db/src/migrate.ts

echo "==> seed"
bun packages/db/src/seed.ts

echo "==> predeploy ok"
