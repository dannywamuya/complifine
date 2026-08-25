/**
 * Migration runner.
 *
 * Applies the extension prerequisites, then each Drizzle journal file in its
 * own transaction. Docker's initdb hook already runs the same prerequisites
 * file, but only on a fresh volume — pointing at an existing database would
 * otherwise fail on the first `vector` column. Executing the identical file
 * in both places means there is one definition of "a database this schema
 * can be applied to".
 *
 * Per-file commits are required because Drizzle's stock migrator wraps every
 * pending journal file in a single transaction, which breaks two things:
 *
 * 1. Fresh databases. A pre-pass of `0003` (`ALTER TYPE … ADD VALUE`) would
 *    run before `0000` creates `document_type`.
 * 2. Enum values. Postgres will not let a newly added label be used until
 *    that `ALTER TYPE` has been committed, and `0004` uses `base_code`.
 *
 * Bookkeeping matches drizzle-orm (`drizzle.__drizzle_migrations`, sha256 of
 * the file, skip by latest `created_at`) so the table stays compatible.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../drizzle");
const journalPath = resolve(migrationsFolder, "meta/_journal.json");
const prerequisites = resolve(here, "../../../infra/initdb/00-extensions.sql");

interface Journal {
  entries: Array<{
    tag: string;
    when: number;
  }>;
}

async function main() {
  const db = createDatabase({ max: 1 });
  const sql = db.$client;

  try {
    console.log(`Applying prerequisites from ${prerequisites}...`);
    // `unsafe` because this is a multi-statement script including a DO block;
    // the content is a checked-in file, not user input.
    await sql.unsafe(await readFile(prerequisites, "utf8"));

    const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;

    await sql.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle");
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const lastRows = await sql<{ created_at: string | number | bigint }[]>`
      SELECT created_at FROM drizzle.__drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const lastApplied = lastRows[0] ? Number(lastRows[0].created_at) : 0;

    console.log(`Applying migrations from ${migrationsFolder}...`);
    for (const entry of journal.entries) {
      if (lastApplied >= entry.when) continue;

      const file = resolve(migrationsFolder, `${entry.tag}.sql`);
      const content = await readFile(file, "utf8");
      const hash = createHash("sha256").update(content).digest("hex");
      const statements = content
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);

      console.log(`  ${entry.tag}`);
      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${entry.when})
        `;
      });
    }
    console.log("Migrations applied.");
  } finally {
    await db.$close();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
