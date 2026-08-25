#!/usr/bin/env bun
/**
 * `bun run db:seed` — operator user, control library, SMETA profile questions.
 */

import { createDatabase } from './client.ts';
import { seedOperator } from './seed-operator.ts';
import { seedControls } from './seed-controls.ts';

export async function seedAll(db = createDatabase()) {
	const operator = await seedOperator(db);
	const controls = await seedControls(db);
	return { operator, controls };
}

function unreachableDatabaseHint(error: unknown): string | null {
	let current: unknown = error;
	for (let i = 0; i < 8 && current && typeof current === 'object'; i++) {
		const rec = current as { code?: string; message?: string; cause?: unknown };
		const blob = `${rec.code ?? ''} ${rec.message ?? ''}`;
		if (blob.includes('ECONNREFUSED') || blob.includes('Failed to connect')) {
			return (
				'Cannot reach DATABASE_URL. A host ending in .railway.internal only ' +
				'resolves inside Railway — from your laptop use the Postgres public ' +
				'URL, or rely on the API pre-deploy command (scripts/predeploy.sh).'
			);
		}
		current = rec.cause;
	}
	return null;
}

if (import.meta.main) {
	const db = createDatabase({ max: 1 });
	try {
		const result = await seedAll(db);
		console.log(
			`Operator ${result.operator.created ? 'created' : 'updated'}: ${result.operator.email}`,
		);
		console.log(
			`Control library: ${result.controls.controls} controls, ${result.controls.links} requirement links`,
		);
	} catch (error) {
		const hint = unreachableDatabaseHint(error);
		if (hint) console.error(hint);
		console.error('Seed failed:', error);
		process.exit(1);
	} finally {
		await db.$close();
	}
}
