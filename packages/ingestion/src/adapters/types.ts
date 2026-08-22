/**
 * Per-standard ingestion adapter.
 *
 * GLOBALG.A.P. has a relational XLSX. SMETA has a public Base Code PDF and a
 * member-gated Workplace Requirements PDF. The next cert will have something
 * else. Nothing above this interface should know which.
 */

import type { Database } from "@complifine/db";
import type { JobContext } from "../jobs.ts";

export interface AdapterVersion {
  readonly id: string;
  readonly code: string;
  readonly standardId: string;
  readonly standardCode: string;
  readonly edition: string;
  readonly levelScheme: string;
}

export interface StandardAdapter {
  readonly standardCode: string;
  ingest(db: Database, ctx: JobContext, version: AdapterVersion): Promise<unknown>;
}

export function asGgapEdition(edition: string): "smart" | "gfs" {
  if (edition === "smart" || edition === "gfs") return edition;
  throw new Error(`GLOBALG.A.P. adapter cannot ingest edition "${edition}"`);
}
