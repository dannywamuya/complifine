import { describe, expect, test } from "bun:test";
import {
  hashPassword,
  hashRefreshToken,
  isEmail,
  newRefreshToken,
  normalizeEmail,
  verifyPassword,
} from "../src/auth/crypto.ts";

describe("auth crypto", () => {
  test("hashes and verifies a password with argon2id", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  test("refresh tokens are stored hashed, never as the raw value", () => {
    const token = newRefreshToken();
    expect(token.raw).not.toBe(token.hash);
    expect(hashRefreshToken(token.raw)).toBe(token.hash);
    expect(token.hash).toHaveLength(64);
  });

  test("normalises and validates email addresses", () => {
    expect(normalizeEmail("  Ada@Farm.KE ")).toBe("ada@farm.ke");
    expect(isEmail("ada@farm.ke")).toBe(true);
    expect(isEmail("not-an-email")).toBe(false);
  });
});
