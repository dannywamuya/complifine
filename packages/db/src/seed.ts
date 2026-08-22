#!/usr/bin/env bun
/**
 * `bun run db:seed` — operator user, control library, SMETA profile questions.
 */

import { createDatabase } from "./client.ts";
import { seedOperator } from "./seed-operator.ts";
import { seedControls } from "./seed-controls.ts";

export async function seedAll(db = createDatabase()) {
  const operator = await seedOperator(db);
  const controls = await seedControls(db);
  return { operator, controls };
}

if (import.meta.main) {
  const db = createDatabase({ max: 1 });
  try {
    const result = await seedAll(db);
    console.log(
      `Operator ${result.operator.created ? "created" : "updated"}: ${result.operator.email}`,
    );
    console.log(
      `Control library: ${result.controls.controls} controls, ${result.controls.links} requirement links`,
    );
  } finally {
    await db.$close();
  }
}
