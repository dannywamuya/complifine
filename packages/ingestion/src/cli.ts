#!/usr/bin/env bun
/**
 * `bun run kb <command>` - the knowledge base operator's interface.
 *
 * Every stage is individually runnable and individually idempotent, because
 * ingestion failures are normal and re-running the whole pipeline to retry one
 * document would be miserable. `kb all` chains them in the correct order for
 * the common case.
 */

import { resolve } from 'node:path';
import {
	and,
	createDatabase,
	eq,
	isNotNull,
	type Database,
} from '@complifine/db';
import {
	requirementVersions,
	standardDocuments,
	standards,
	standardSections,
	standardVersions,
} from '@complifine/db';
import {
	AUTHORITY_LEVEL_LABELS,
	requirementLevelLabel,
	type AuthorityLevel,
} from '@complifine/core';
import {
	CHECK,
	CROSS,
	WARN,
	flagBool,
	flagList,
	flagString,
	formatDuration,
	heading,
	parseArgs,
	style,
	table,
	wrapText,
} from './cli-support.ts';
import { newRunId, runJob } from './jobs.ts';
import { syncRegistry } from './steps/registry.ts';
import { fetchDocuments } from './steps/fetch-documents.ts';
import { adapterFor } from './adapters/index.ts';
import { mapRequirementPages, parseProseDocument } from './steps/parse-pdf.ts';
import { linkEditions } from './steps/cross-edition.ts';
import { runGates } from './gates.ts';
import {
	recordReview,
	transitionVersion,
	TransitionError,
} from './steps/publish.ts';
import { checkForDrift } from './steps/watch.ts';
import { storageUsage } from './storage.ts';
import { MANIFEST } from './manifest.ts';

/**
 * Base directory that manifest `localPath` entries resolve against.
 *
 * Repo-relative drops (`storage/drops/…`) are also looked up under
 * STORAGE_ROOT so a Railway volume at `/data/storage` is enough; public
 * documents are fetched over HTTP and do not need a laptop folder.
 */
const REPO_ROOT = resolve(import.meta.dir, '../../..');

const HELP = `
${style.bold('CompliFine knowledge base')}

${style.bold('Pipeline')}
  registry                 Reconcile sources/manifest into the database
  fetch [--slug a,b]       Download and hash-preserve source documents
      --force              Re-download even when unchanged at the origin
  parse [--version code]   Extract requirements from the checklist workbooks
  pages [--version code]   Map every criterion to its page in the P&C PDF
  prose [--version code]   Parse the General Regulations and guideline PDFs
  link                     Derive the Smart <-> GFS correspondence
  gates [--version code]   Run the quality gates
      --gate name          Run one gate only
  all                      registry -> fetch -> parse -> pages -> prose -> link -> gates

${style.bold('Governance')}
  review <version>         Record a human review decision
      --reviewer "Name"    Required
      --decision approved|rejected|changes_requested
      --notes "..."
  promote <version> --to <status> [--actor "Name"] [--force]
  publish <version> --actor "Name"    Shorthand for promoting all the way to published

${style.bold('Inspection')}
  status                   Everything at a glance
  show <criterion-id>      Full detail for one criterion, e.g. "FV-Smart 32.10.06"
  diff                     Smart vs GFS differences
  watch                    Check the publisher for changed or new documents

${style.dim('Flags: --json for machine-readable output on inspection commands.')}
`;

async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2));

	if (args.command === 'help' || flagBool(args, 'help')) {
		console.log(HELP);
		return 0;
	}

	const db = createDatabase();
	const started = performance.now();

	try {
		switch (args.command) {
			case 'registry':
				await commandRegistry(db);
				break;
			case 'fetch':
				await commandFetch(db, flagList(args, 'slug'), flagBool(args, 'force'));
				break;
			case 'parse':
				await commandParse(db, flagString(args, 'version'));
				break;
			case 'pages':
				await commandPages(db, flagString(args, 'version'));
				break;
			case 'prose':
				await commandProse(db, flagString(args, 'version'));
				break;
			case 'link':
				await commandLink(db);
				break;
			case 'gates':
				return await commandGates(
					db,
					flagString(args, 'version'),
					flagList(args, 'gate'),
				);
			case 'all':
				return await commandAll(db);
			case 'review':
				await commandReview(db, args.positional[0], args);
				break;
			case 'promote':
			case 'publish':
				await commandPromote(db, args.positional[0], args);
				break;
			case 'status':
				await commandStatus(db, flagBool(args, 'json'));
				break;
			case 'show':
				await commandShow(db, args.positional[0], flagBool(args, 'json'));
				break;
			case 'diff':
				await commandDiff(db, flagBool(args, 'json'));
				break;
			case 'watch':
				return await commandWatch(db);
			default:
				console.error(`Unknown command: ${args.command}`);
				console.log(HELP);
				return 1;
		}

		console.log(
			style.dim(`\nDone in ${formatDuration(performance.now() - started)}`),
		);
		return 0;
	} catch (error) {
		if (error instanceof TransitionError) {
			console.error(`\n${CROSS} ${error.message}`);
		} else {
			console.error(`\n${CROSS} ${(error as Error).message}`);
			if (process.env.DEBUG) console.error((error as Error).stack);
		}
		return 1;
	} finally {
		await db.$close();
	}
}

// ---------------------------------------------------------------------------
// Pipeline commands
// ---------------------------------------------------------------------------

async function commandRegistry(db: Database): Promise<void> {
	heading('Registry');
	const runId = newRunId();
	await runJob({ db, runId, stage: 'registry', echo: true }, (ctx) =>
		syncRegistry(db, ctx),
	);
}

async function commandFetch(
	db: Database,
	slugs: string[],
	force: boolean,
): Promise<void> {
	heading('Fetch');
	const runId = newRunId();
	const summary = await runJob(
		{ db, runId, stage: 'fetch', echo: true },
		(ctx) => fetchDocuments(db, ctx, { slugs, force, localBaseDir: REPO_ROOT }),
	);

	for (const item of summary.withdrawn) {
		console.log(
			`  ${WARN} ${item.slug}: withdrawn by the publisher, skipped ${style.dim('(recorded in the manifest)')}`,
		);
	}

	if (summary.failed > 0) {
		console.log();
		for (const failure of summary.failures) {
			console.log(
				`  ${CROSS} ${failure.slug}: ${failure.error.split('\n')[0]}`,
			);
		}
		throw new Error(
			`${summary.failed} document(s) could not be fetched. The registry still holds them; re-run \`kb fetch\` once the origin recovers.`,
		);
	}
}

async function commandParse(db: Database, versionCode?: string): Promise<void> {
	heading('Parse source documents');
	const runId = newRunId();

	for (const version of await selectVersions(db, versionCode)) {
		const [standard] = await db
			.select()
			.from(standards)
			.where(eq(standards.id, version.standardId));
		if (!standard) continue;

		console.log(style.cyan(`\n  ${version.code} (${standard.code})`));
		await runJob(
			{
				db,
				runId,
				stage: 'parse',
				standardVersionId: version.id,
				echo: true,
			},
			(ctx) =>
				adapterFor(standard.code).ingest(db, ctx, {
					id: version.id,
					code: version.code,
					standardId: version.standardId,
					standardCode: standard.code,
					edition: version.edition,
					levelScheme: version.levelScheme,
				}),
		);
	}
}

async function commandPages(db: Database, versionCode?: string): Promise<void> {
	heading('Map criteria to PDF pages');
	const runId = newRunId();

	for (const version of await selectVersions(db, versionCode)) {
		if (version.edition !== 'smart' && version.edition !== 'gfs') continue;

		const [pcDocument] = await db
			.select()
			.from(standardDocuments)
			.where(
				and(
					eq(standardDocuments.standardVersionId, version.id),
					eq(standardDocuments.documentType, 'principles_and_criteria'),
					isNotNull(standardDocuments.storageKey),
				),
			);

		if (!pcDocument?.storageKey) {
			console.log(`  ${WARN} ${version.code}: no fetched P&C PDF, skipping`);
			continue;
		}

		console.log(style.cyan(`\n  ${version.code}`));
		await runJob(
			{
				db,
				runId,
				stage: 'normalize',
				standardVersionId: version.id,
				documentId: pcDocument.id,
				echo: true,
			},
			(ctx) =>
				mapRequirementPages(db, ctx, {
					standardVersionId: version.id,
					documentId: pcDocument.id,
					storageKey: pcDocument.storageKey!,
					edition: version.edition as 'smart' | 'gfs',
				}),
		);
	}
}

async function commandProse(db: Database, versionCode?: string): Promise<void> {
	heading('Parse long-form documents');
	const runId = newRunId();

	for (const version of await selectVersions(db, versionCode)) {
		const documents = await db
			.select()
			.from(standardDocuments)
			.where(
				and(
					eq(standardDocuments.standardVersionId, version.id),
					isNotNull(standardDocuments.storageKey),
				),
			);

		const prose = documents.filter(
			(d) =>
				d.documentType === 'general_regulations' ||
				d.documentType === 'guidance',
		);

		if (prose.length === 0) {
			console.log(`  ${WARN} ${version.code}: no fetched long-form documents`);
			continue;
		}

		console.log(style.cyan(`\n  ${version.code}`));
		for (const document of prose) {
			await runJob(
				{
					db,
					runId,
					stage: 'parse',
					standardVersionId: version.id,
					documentId: document.id,
					echo: true,
				},
				async (ctx) => {
					await ctx.info(`Parsing ${document.slug}`);
					return parseProseDocument(db, ctx, {
						standardVersionId: version.id,
						documentId: document.id,
						storageKey: document.storageKey!,
						guidPrefix: document.slug,
					});
				},
			);
		}
	}
}

async function commandLink(db: Database): Promise<void> {
	heading('Cross-edition mapping');
	const runId = newRunId();
	const report = await runJob(
		{ db, runId, stage: 'reconcile', echo: true },
		(ctx) =>
			linkEditions(db, ctx, {
				smartVersionCode: 'ifa-v6-smart-fv',
				gfsVersionCode: 'ifa-v6-gfs-fv',
				write: true,
			}),
	);

	console.log();
	table([
		['  Matched criteria', String(report.matched)],
		['  GFS-only', report.gfsOnly.join(', ') || 'none'],
		['  Smart-only', report.smartOnly.join(', ') || 'none'],
		['  Level escalations', String(report.escalations.length)],
		['  Level relaxations', String(report.relaxations.length)],
		['  Reworded', String(report.textChanges.length)],
		['  Identical text', String(report.identicalTexts)],
	]);
}

async function commandGates(
	db: Database,
	versionCode: string | undefined,
	only: string[],
): Promise<number> {
	let allPassed = true;

	for (const version of await selectVersions(db, versionCode)) {
		heading(`Quality gates: ${version.code}`);
		const report = await runGates(db, version.id, { only });

		for (const result of report.results) {
			const icon = result.passed ? CHECK : result.blocking ? CROSS : WARN;
			const label = result.blocking
				? result.gate
				: `${result.gate} ${style.dim('(advisory)')}`;
			console.log(`  ${icon} ${style.bold(label)}`);
			console.log(`      ${style.dim(result.description)}`);
			if (!result.passed || !result.blocking) {
				console.log(`      expected: ${result.expected}`);
				console.log(
					`      actual:   ${result.passed ? style.green(result.actual) : style.red(result.actual)}`,
				);
			}
			if (!result.passed && result.failures?.length) {
				const preview = result.failures.slice(0, 8);
				for (const failure of preview) {
					console.log(`        ${style.dim('-')} ${formatFailure(failure)}`);
				}
				if (result.failures.length > preview.length) {
					console.log(
						`        ${style.dim(`... and ${result.failures.length - preview.length} more`)}`,
					);
				}
			}
		}

		console.log();
		if (report.passed) {
			console.log(
				`  ${CHECK} ${style.green(`All ${report.results.filter((r) => r.blocking).length} blocking gates passed`)}` +
					(report.advisoryFailures
						? style.dim(` (${report.advisoryFailures} advisory notes)`)
						: ''),
			);
		} else {
			console.log(
				`  ${CROSS} ${style.red(`${report.blockingFailures} blocking gate(s) failed`)}`,
			);
			allPassed = false;
		}
	}

	return allPassed ? 0 : 1;
}

function formatFailure(failure: unknown): string {
	if (typeof failure === 'string') return failure;
	if (failure && typeof failure === 'object') {
		return Object.entries(failure as Record<string, unknown>)
			.map(([key, value]) => `${key}=${String(value)}`)
			.join(' ');
	}
	return String(failure);
}

async function commandAll(db: Database): Promise<number> {
	await commandRegistry(db);
	await commandFetch(db, [], false);
	await commandParse(db, undefined);
	await commandPages(db, undefined);
	await commandProse(db, undefined);
	await commandLink(db);
	return commandGates(db, undefined, []);
}

// ---------------------------------------------------------------------------
// Governance commands
// ---------------------------------------------------------------------------

async function commandReview(
	db: Database,
	versionCode: string | undefined,
	args: ReturnType<typeof parseArgs>,
): Promise<void> {
	if (!versionCode)
		throw new Error(
			'Usage: kb review <version-code> --reviewer "Name" --decision approved',
		);

	const reviewer = flagString(args, 'reviewer');
	if (!reviewer)
		throw new Error('--reviewer is required: reviews must name a person.');

	const decision = (flagString(args, 'decision') ?? 'approved') as
		| 'approved'
		| 'rejected'
		| 'changes_requested';

	await recordReview(db, {
		versionCode,
		reviewer,
		decision,
		notes: flagString(args, 'notes'),
	});

	console.log(
		`${CHECK} Recorded ${decision} for ${versionCode} by ${reviewer}`,
	);
}

async function commandPromote(
	db: Database,
	versionCode: string | undefined,
	args: ReturnType<typeof parseArgs>,
): Promise<void> {
	if (!versionCode)
		throw new Error('Usage: kb promote <version-code> --to <status>');

	const actor = flagString(args, 'actor') ?? 'cli';
	const force = flagBool(args, 'force');

	// `publish` walks the machine all the way rather than making the operator
	// issue five promotions by hand; the intermediate states are still recorded.
	const target =
		args.command === 'publish' ? 'published' : flagString(args, 'to');
	if (!target) throw new Error('--to is required, e.g. --to review');

	const path =
		args.command === 'publish'
			? ([
					'ingesting',
					'extracted',
					'validation',
					'review',
					'approved',
					'published',
				] as const)
			: ([target] as const);

	for (const step of path) {
		const [current] = await db
			.select({ status: standardVersions.status })
			.from(standardVersions)
			.where(eq(standardVersions.code, versionCode));

		if (!current) throw new Error(`Unknown standard version: ${versionCode}`);
		// Already at or past this step in the chain.
		if (current.status === step) continue;

		const result = await transitionVersion(db, {
			versionCode,
			to: step as never,
			actor,
			force,
			notes: flagString(args, 'notes'),
		});
		console.log(`  ${CHECK} ${versionCode}: ${result.from} -> ${result.to}`);
	}
}

// ---------------------------------------------------------------------------
// Inspection commands
// ---------------------------------------------------------------------------

async function commandStatus(db: Database, json: boolean): Promise<void> {
	const versions = await db
		.select()
		.from(standardVersions)
		.orderBy(standardVersions.code);
	const rows: Array<Record<string, unknown>> = [];

	for (const version of versions) {
		const documents = await db
			.select()
			.from(standardDocuments)
			.where(eq(standardDocuments.standardVersionId, version.id));

		const requirements = await db
			.select({
				level: requirementVersions.level,
				page: requirementVersions.sourcePage,
			})
			.from(requirementVersions)
			.where(eq(requirementVersions.standardVersionId, version.id));

		const sections = await db
			.select({ id: standardSections.id })
			.from(standardSections)
			.where(eq(standardSections.standardVersionId, version.id));

		rows.push({
			code: version.code,
			status: version.status,
			documents: documents.length,
			fetched: documents.filter((d) => d.fileHash).length,
			sections: sections.length,
			requirements: requirements.length,
			withPages: requirements.filter((r) => r.page !== null).length,
			levels: Object.fromEntries(
				(['major_must', 'minor_must', 'recommendation'] as const).map(
					(level) => [
						level,
						requirements.filter((r) => r.level === level).length,
					],
				),
			),
		});
	}

	if (json) {
		console.log(JSON.stringify({ versions: rows }, null, 2));
		return;
	}

	heading('Knowledge base status');

	const [standard] = await db.select().from(standards);
	if (!standard) {
		console.log(
			`  ${WARN} Nothing registered yet. Run ${style.bold('bun run kb all')}.`,
		);
		return;
	}

	console.log(
		`  ${style.bold(standard.name)}  ${style.dim(standard.publisher)}\n`,
	);

	table([
		[
			style.dim('VERSION'),
			style.dim('STATUS'),
			style.dim('DOCS'),
			style.dim('SECTIONS'),
			style.dim('CRITERIA'),
			style.dim('PAGES'),
			style.dim('MAJOR/MINOR/REC'),
		],
		...rows.map((r) => {
			const levels = r.levels as Record<string, number>;
			return [
				String(r.code),
				colorStatus(String(r.status)),
				`${r.fetched}/${r.documents}`,
				String(r.sections),
				String(r.requirements),
				`${r.withPages}/${r.requirements}`,
				`${levels.major_must}/${levels.minor_must}/${levels.recommendation}`,
			];
		}),
	]);

	const usage = await storageUsage();
	console.log(
		style.dim(
			`\n  Preserved sources: ${usage.files} files, ${(usage.bytes / (1024 * 1024)).toFixed(1)} MB`,
		),
	);

	const manifestTotal = MANIFEST.flatMap((s) => s.versions).flatMap(
		(v) => v.documents,
	).length;
	console.log(style.dim(`  Manifest declares ${manifestTotal} documents`));
}

function colorStatus(status: string): string {
	if (status === 'published') return style.green(status);
	if (status === 'draft') return style.dim(status);
	if (status === 'review' || status === 'approved') return style.yellow(status);
	return status;
}

async function commandShow(
	db: Database,
	criterionId: string | undefined,
	json: boolean,
): Promise<void> {
	if (!criterionId) throw new Error('Usage: kb show "FV-Smart 32.10.06"');

	const { canonicalizeCriterionNumber } = await import('@complifine/core');
	const canonical = canonicalizeCriterionNumber(criterionId) ?? criterionId;

	const rows = await db
		.select({
			requirement: requirementVersions,
			version: standardVersions,
			section: standardSections,
			document: standardDocuments,
		})
		.from(requirementVersions)
		.innerJoin(
			standardVersions,
			eq(standardVersions.id, requirementVersions.standardVersionId),
		)
		.leftJoin(
			standardSections,
			eq(standardSections.id, requirementVersions.sectionId),
		)
		.leftJoin(
			standardDocuments,
			eq(standardDocuments.id, requirementVersions.documentId),
		)
		.where(eq(requirementVersions.sourceRequirementId, canonical));

	if (rows.length === 0) {
		throw new Error(`No criterion found with identifier "${canonical}".`);
	}

	if (json) {
		console.log(JSON.stringify(rows, null, 2));
		return;
	}

	for (const row of rows) {
		heading(
			`${row.requirement.sourceRequirementId}  ${style.dim(row.version.name)}`,
		);
		table([
			['  Level', style.bold(requirementLevelLabel(row.requirement.level))],
			[
				'  Section',
				row.section
					? `${row.section.sourceIdentifier ?? ''} ${row.section.title}`.trim()
					: '-',
			],
			[
				'  Page',
				row.requirement.sourcePage ? `p.${row.requirement.sourcePage}` : '-',
			],
			['  Publisher GUID', row.requirement.principleGuid ?? '-'],
			['  Status', row.requirement.status],
			['  NA exempt', row.requirement.naExempt ? 'yes' : 'no'],
			['  PHU related', row.requirement.phuRelated ? 'yes' : 'no'],
		]);
		console.log(`\n  ${style.bold('Principle')}`);
		console.log(wrapText(row.requirement.principleText, 4));
		if (row.requirement.criteriaText) {
			console.log(`\n  ${style.bold('Criteria')}`);
			console.log(wrapText(row.requirement.criteriaText, 4));
		}
		if (row.document) {
			console.log(
				style.dim(
					`\n  Source: ${row.document.title} [${AUTHORITY_LEVEL_LABELS[row.document.authorityLevel as AuthorityLevel]}]`,
				),
			);
		}
	}
}

async function commandDiff(db: Database, json: boolean): Promise<void> {
	const runId = newRunId();
	const report = await runJob({ db, runId, stage: 'reconcile' }, (ctx) =>
		linkEditions(db, ctx, {
			smartVersionCode: 'ifa-v6-smart-fv',
			gfsVersionCode: 'ifa-v6-gfs-fv',
			write: false,
		}),
	);

	if (json) {
		console.log(JSON.stringify(report, null, 2));
		return;
	}

	heading('IFA v6 Smart vs GFS');
	console.log(
		`  ${report.matched} criteria in both editions, ` +
			`${report.gfsOnly.length} only in GFS, ${report.smartOnly.length} only in Smart\n`,
	);

	if (report.gfsOnly.length) {
		console.log(`  ${style.bold('Only in GFS')}`);
		for (const id of report.gfsOnly) console.log(`    ${id}`);
		console.log();
	}

	if (report.escalations.length) {
		console.log(
			`  ${style.bold(`Stricter in GFS (${report.escalations.length})`)}`,
		);
		table(
			report.escalations.map((d) => [
				`    ${d.sourceRequirementId}`,
				style.dim(requirementLevelLabel(d.smartLevel)),
				style.dim('->'),
				style.yellow(requirementLevelLabel(d.gfsLevel)),
			]),
		);
		console.log();
	}

	if (report.textChanges.length) {
		console.log(
			`  ${style.bold(`Reworded in GFS (${report.textChanges.length})`)}`,
		);
		table(
			report.textChanges.map((d) => [
				`    ${d.sourceRequirementId}`,
				style.dim(`similarity ${d.textSimilarity.toFixed(3)}`),
			]),
		);
	}
}

async function commandWatch(db: Database): Promise<number> {
	heading('Checking the publisher for changes');
	const report = await checkForDrift(db);

	if (
		report.changed.length === 0 &&
		report.unreachable.length === 0 &&
		report.undeclared.length === 0
	) {
		console.log(
			`  ${CHECK} ${style.green(`All ${report.checked} documents unchanged`)}`,
		);
		return 0;
	}

	for (const item of report.changed) {
		console.log(`  ${WARN} ${style.yellow('changed')}  ${item.slug}`);
		console.log(`      ${style.dim(item.reason)}`);
	}
	for (const item of report.unreachable) {
		console.log(
			`  ${CROSS} ${style.red('unreachable')}  ${item.slug}: ${item.reason}`,
		);
	}
	if (report.undeclared.length > 0) {
		console.log(
			`\n  ${WARN} ${report.undeclared.length} document(s) on the publisher's pages are not in the manifest:`,
		);
		for (const url of report.undeclared) console.log(`      ${url}`);
		console.log(
			style.dim(
				'\n      Add them to packages/ingestion/src/manifest.ts if they belong in the knowledge base.',
			),
		);
	}

	// Non-zero so CI notices, but changed documents are news rather than an
	// error: someone must look, and looking is the whole point of the command.
	return 2;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function selectVersions(db: Database, versionCode?: string) {
	const versions = await db
		.select()
		.from(standardVersions)
		.orderBy(standardVersions.code);

	if (!versionCode) {
		if (versions.length === 0) {
			throw new Error(
				'No standard versions registered. Run `bun run kb registry` first.',
			);
		}
		return versions;
	}

	const match = versions.find((v) => v.code === versionCode);
	if (!match) {
		throw new Error(
			`Unknown version "${versionCode}". Known versions: ${versions.map((v) => v.code).join(', ')}`,
		);
	}
	return [match];
}

process.exit(await main());
