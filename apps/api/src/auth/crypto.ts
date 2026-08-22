/**
 * Password hashing and refresh-token hashing.
 *
 * Bun's argon2id is the primitive. Refresh tokens are random bytes; only the
 * SHA-256 lives in the database, so a dump of `refresh_tokens` is not a
 * session.
 */

import { sha256 } from "@complifine/core";

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export function newRefreshToken(): { raw: string; hash: string } {
  const raw = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  return { raw, hash: sha256(raw) };
}

export function hashRefreshToken(raw: string): string {
  return sha256(raw);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return EMAIL.test(normalizeEmail(value));
}
