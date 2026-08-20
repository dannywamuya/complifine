/**
 * Migration runner.
 *
 * Applies the extension prerequisites before migrating. Docker's initdb hook
 * already runs the same file, but only on a fresh volume - pointing at an
 * existing database would otherwise fail on the first `vector` column with a
 * confusing error. Executing the identical file in both places means there is
 * one definition of "a database this schema can be applied to".
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDatabase } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../drizzle");
const prerequisites = resolve(here, "../../../infra/initdb/00-extensions.sql");

async function main() {
  const db = createDatabase({ max: 1 });

  try {
    console.log(`Applying prerequisites from ${prerequisites}...`);
    // `unsafe` because this is a multi-statement script including a DO block;
    // the content is a checked-in file, not user input.
    await db.$client.unsafe(await readFile(prerequisites, "utf8"));

    console.log(`Applying migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await db.$close();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
