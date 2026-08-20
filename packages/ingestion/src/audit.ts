/**
 * Audit trail writer.
 *
 * Deliberately fire-and-forget in shape but awaited in practice: an audit
 * write that fails should not roll back the change it describes, but it must
 * not be silently swallowed either, so failures are logged loudly.
 */

import { auditLogs, type Database } from "@complifine/db";

export interface AuditEntry {
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly action: string;
  readonly actor: string;
  readonly changes?: Record<string, { from: unknown; to: unknown }>;
  readonly metadata?: Record<string, unknown>;
}

export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      actor: entry.actor,
      changes: entry.changes ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record entry", entry, error);
  }
}

/**
 * Build a field-level diff of the keys present in `next`.
 *
 * Returns null when nothing changed, so callers can skip both the update and
 * the audit row in one check.
 */
export function diffFields<T extends Record<string, unknown>>(
  previous: T,
  next: Partial<T>,
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [key, value] of Object.entries(next)) {
    const before = previous[key];
    // JSON comparison handles the jsonb columns and the Date instances that
    // postgres.js returns, both of which fail a naive !== check.
    if (JSON.stringify(before) !== JSON.stringify(value)) {
      changes[key] = { from: before, to: value };
    }
  }

  return Object.keys(changes).length === 0 ? null : changes;
}
