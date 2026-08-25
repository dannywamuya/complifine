/**
 * Who may read unpublished knowledge.
 *
 * Operators inspect drafts, gates and failed fetches. Members and anonymous
 * callers only see editions a human has published. Returning 404 rather than
 * 403 for an unpublished code avoids leaking that the edition exists.
 */

import { status } from "elysia";
import type { AuthUser } from "./auth/plugin.ts";

export function publishedOnly(auth: AuthUser | null): boolean {
  return auth?.kind !== "operator";
}

export function assertPublishedVersion<T extends { status: string }>(
  version: T | null | undefined,
  unpublishedVisible: boolean,
  code: string,
): T {
  if (!version) throw status(404, { error: `Unknown version "${code}"` });
  if (!unpublishedVisible && version.status !== "published") {
    throw status(404, { error: `Unknown version "${code}"` });
  }
  return version;
}
