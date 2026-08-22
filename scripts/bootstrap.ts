#!/usr/bin/env bun
/**
 * `bun run bootstrap` - from a fresh clone to a queryable knowledge base.
 *
 * There is nothing here that an operator could not do by reading the README and
 * running six commands. The point is that they should not have to, and that the
 * failure modes of those six commands - Docker not installed, the daemon not
 * running, the database not accepting connections yet, no `.env`, no API key -
 * are diagnosed here with an instruction rather than a stack trace.
 *
 * Every step is idempotent, so re-running after fixing a problem resumes rather
 * than restarts.
 */

import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CHECK,
  CROSS,
  WARN,
  flagBool,
  heading,
  parseArgs,
  style,
} from "../packages/ingestion/src/cli-support.ts";

const ROOT = resolve(import.meta.dir, "..");
const COMPOSE = resolve(ROOT, "infra/docker-compose.yml");

class BootstrapError extends Error {
  constructor(
    message: string,
    readonly remedy: string,
  ) {
    super(message);
    this.name = "BootstrapError";
  }
}

async function run(
  command: string[],
  options: { cwd?: string; quiet?: boolean } = {},
): Promise<string> {
  const proc = Bun.spawn(command, {
    cwd: options.cwd ?? ROOT,
    stdout: options.quiet ? "pipe" : "inherit",
    stderr: options.quiet ? "pipe" : "inherit",
    env: process.env,
  });

  const stdout = options.quiet ? await new Response(proc.stdout).text() : "";
  const stderr = options.quiet ? await new Response(proc.stderr).text() : "";
  const code = await proc.exited;

  if (code !== 0) {
    throw new Error(
      `${command.join(" ")} exited with ${code}${stderr ? `\n${stderr.trim()}` : ""}`,
    );
  }

  return stdout;
}

async function commandExists(name: string): Promise<boolean> {
  try {
    await run(["which", name], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function ensureEnvFile(): Promise<void> {
  const envPath = resolve(ROOT, ".env");
  if (existsSync(envPath)) {
    console.log(`  ${CHECK} .env present`);
    return;
  }

  await copyFile(resolve(ROOT, ".env.example"), envPath);
  console.log(
    `  ${CHECK} Created .env from .env.example ` +
      style.dim("(add OPENAI_API_KEY when you want embeddings and the agent)"),
  );
}

async function ensureDocker(): Promise<void> {
  if (!(await commandExists("docker"))) {
    throw new BootstrapError(
      "Docker is not installed.",
      "Install Docker Desktop or the Docker Engine, then re-run `bun run bootstrap`.\n" +
        "  Alternatively, point DATABASE_URL at any PostgreSQL 16+ with the pgvector\n" +
        "  extension available and re-run with --skip-docker.",
    );
  }

  try {
    await run(["docker", "info"], { quiet: true });
  } catch {
    throw new BootstrapError(
      "The Docker daemon is not responding.",
      "Start Docker and re-run `bun run bootstrap`.",
    );
  }

  console.log(`  ${CHECK} Docker available`);
}

async function startDatabase(): Promise<void> {
  await run(["docker", "compose", "-f", COMPOSE, "up", "-d"], { quiet: true });
  console.log(`  ${CHECK} Postgres container started`);
}

/**
 * Wait for the container's own health check rather than for a TCP connection.
 * Postgres accepts connections during initdb and then restarts, so a socket
 * that opens is not a database that is ready; migrating against it fails
 * intermittently and confusingly.
 */
async function waitForHealthy(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastState = "";

  while (Date.now() < deadline) {
    let state = "unknown";
    try {
      state = (
        await run(
          [
            "docker",
            "inspect",
            "--format",
            "{{.State.Health.Status}}",
            "complifine-postgres",
          ],
          { quiet: true },
        )
      ).trim();
    } catch {
      state = "starting";
    }

    if (state === "healthy") {
      console.log(`  ${CHECK} Postgres healthy`);
      return;
    }

    if (state !== lastState) {
      process.stdout.write(`  ${style.dim(`waiting for postgres (${state})`)}\r`);
      lastState = state;
    }

    await Bun.sleep(1000);
  }

  throw new BootstrapError(
    `Postgres did not become healthy within ${timeoutMs / 1000}s.`,
    "Inspect the container with `bun run db:logs`.",
  );
}

async function migrate(): Promise<void> {
  await run(["bun", "packages/db/src/migrate.ts"], { quiet: true });
  console.log(`  ${CHECK} Schema migrated`);
}

async function seed(): Promise<void> {
  await run(["bun", "packages/db/src/seed.ts"], { quiet: false });
  console.log(`  ${CHECK} Operator user and control library seeded`);
}

async function ingest(): Promise<void> {
  console.log();
  await run(["bun", "packages/ingestion/src/cli.ts", "all"]);
}

async function index(): Promise<void> {
  if (!process.env.OPENAI_API_KEY && !existsSync(resolve(ROOT, ".env"))) return;

  const envText = existsSync(resolve(ROOT, ".env"))
    ? await Bun.file(resolve(ROOT, ".env")).text()
    : "";
  const hasKey =
    Boolean(process.env.OPENAI_API_KEY) || /^OPENAI_API_KEY=.+$/m.test(envText);

  if (!hasKey) {
    console.log(
      `\n  ${WARN} ${style.yellow("No OPENAI_API_KEY")} - skipping embeddings.\n` +
        style.dim(
          "      Everything above works without it: the knowledge base, the gates,\n" +
            "      lexical search and the whole CLI. Add a key and run `bun run ai index`\n" +
            "      to enable semantic search and the agent.",
        ),
    );
    return;
  }

  console.log();
  await run(["bun", "packages/ai/src/cli.ts", "index"]);
}

// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  // `bootstrap` takes no subcommand, so the first token is already a flag.
  const args = parseArgs(["bootstrap", ...process.argv.slice(2)]);
  const skipDocker = flagBool(args, "skip-docker");
  const skipIndex = flagBool(args, "skip-index");

  heading("CompliFine bootstrap");

  try {
    await ensureEnvFile();

    if (skipDocker) {
      console.log(`  ${WARN} Skipping Docker; using DATABASE_URL as configured`);
    } else {
      await ensureDocker();
      await startDatabase();
      await waitForHealthy();
    }

    await migrate();
    await seed();
    await ingest();
    await seed();
    if (!skipIndex) await index();

    console.log(`\n${CHECK} ${style.green(style.bold("Ready."))}`);
    console.log(style.dim("\n  bun run kb status              what is in the knowledge base"));
    console.log(style.dim('  bun run kb show "FV 03.01"     one criterion, with provenance'));
    console.log(style.dim("  bun run kb diff                Smart vs GFS"));
    console.log(style.dim("  bun run web                    the producer app on :3000"));
    console.log(style.dim("  bun run console                the operator console on :3001"));
    return 0;
  } catch (error) {
    if (error instanceof BootstrapError) {
      console.error(`\n${CROSS} ${style.red(error.message)}\n`);
      console.error(`  ${error.remedy}\n`);
    } else {
      console.error(`\n${CROSS} ${style.red((error as Error).message)}`);
    }
    return 1;
  }
}

process.exit(await main());
