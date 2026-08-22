/**
 * Seed the operator account the console signs in with.
 *
 * Idempotent: the email in OPERATOR_EMAIL is created or updated so a changed
 * password in `.env` takes effect on the next bootstrap.
 */

import { eq } from "drizzle-orm";
import type { Database } from "./client.ts";
import { users } from "./schema/tenancy.ts";
import { env } from "@complifine/core";

export async function seedOperator(db: Database): Promise<{ email: string; created: boolean }> {
  const email = env().OPERATOR_EMAIL.trim().toLowerCase();
  const passwordHash = await Bun.password.hash(env().OPERATOR_PASSWORD, { algorithm: "argon2id" });
  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    await db
      .update(users)
      .set({
        kind: "operator",
        passwordHash,
        name: existing.name || "CompliFine operator",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    return { email, created: false };
  }

  await db.insert(users).values({
    email,
    name: "CompliFine operator",
    passwordHash,
    kind: "operator",
  });
  return { email, created: true };
}
