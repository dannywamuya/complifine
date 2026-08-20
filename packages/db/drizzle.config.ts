import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is invoked with its cwd set to this package, so Bun's automatic
 * `.env` loading looks in the wrong place and finds nothing. Read the repo
 * root file directly rather than requiring every developer to keep a second
 * copy of their credentials in here.
 */
function readRootEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];

  // drizzle-kit bundles this config before evaluating it, so `import.meta` is
  // not reliable here. Walk up from the working directory instead.
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth++) {
    try {
      const contents = readFileSync(resolve(dir, ".env"), "utf8");
      for (const line of contents.split("\n")) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match?.[1] === key) {
          return match[2]!.trim().replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      // No .env at this level; keep walking.
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
}

const url = readRootEnv("DATABASE_URL");
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env at the repo root and run `bun run db:up`.",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
  // These are created by infra/initdb/00-extensions.sql before any migration
  // runs. Listing them here stops drizzle-kit from proposing to drop them.
  extensionsFilters: ["postgis"],
});
