/**
 * Database client.
 *
 * One pooled connection per process, created lazily so that importing anything
 * from `@complifine/db` does not open a socket. That matters for the CLI,
 * where `--help` should not require a running database.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@complifine/core";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDatabase>;

export interface DatabaseOptions {
  readonly url?: string;
  readonly max?: number;
  /** Log every statement. Useful when tuning the hybrid search SQL. */
  readonly debug?: boolean;
}

export function createDatabase(options: DatabaseOptions = {}) {
  const url = options.url ?? env().DATABASE_URL;

  const sql = postgres(url, {
    max: options.max ?? 10,
    // The knowledge base holds long requirement texts and 1536-float vectors;
    // the default 30s statement timeout is ample, but an idle timeout keeps
    // CLI processes from lingering.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    // Return `numeric` as a JS number. Every numeric column here is a score or
    // a similarity in [0, 1], never money, so precision loss is not a concern.
    types: {
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (v: number) => String(v),
        parse: (v: string) => Number.parseFloat(v),
      },
    },
    ...(options.debug
      ? {
          debug: (_conn: number, query: string, params: unknown[]) => {
            console.error("[sql]", query.replace(/\s+/g, " ").trim(), params);
          },
        }
      : {}),
  });

  const db = drizzle(sql, { schema, casing: "snake_case" });

  return Object.assign(db, {
    /** Underlying postgres.js client, for raw SQL and clean shutdown. */
    $client: sql,
    /** Close the pool. Always call this from a CLI so the process can exit. */
    $close: () => sql.end({ timeout: 5 }),
  });
}

let shared: Database | null = null;

/** Process-wide client. Prefer this in long-running services. */
export function db(): Database {
  shared ??= createDatabase();
  return shared;
}

export async function closeSharedDatabase(): Promise<void> {
  if (shared) {
    await shared.$close();
    shared = null;
  }
}
