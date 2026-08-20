/**
 * Start ingestion and index processes outside the HTTP request.
 *
 * The knowledge-base schema is explicit: pipeline work must not run inside a
 * request. These helpers spawn the same CLIs an operator would run, so the
 * console can start a stage and then watch `ingestion_jobs` rather than
 * holding a socket open for twenty minutes.
 */

import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");

export const PIPELINE_STEPS = [
  "registry",
  "fetch",
  "parse",
  "pages",
  "prose",
  "link",
  "gates",
  "all",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

interface Spawned {
  readonly kind: "pipeline" | "index";
  readonly command: string;
  readonly pid: number;
  readonly startedAt: string;
}

let current: Spawned | null = null;

export function runningProcess(): Spawned | null {
  return current;
}

export function startPipeline(options: {
  step: PipelineStep;
  version?: string;
  force?: boolean;
}): Spawned {
  assertIdle();
  const args: string[] = [options.step];
  if (options.version && options.step !== "registry" && options.step !== "all") {
    args.push("--version", options.version);
  }
  if (options.force && (options.step === "fetch" || options.step === "all")) {
    args.push("--force");
  }
  return spawn("pipeline", "packages/ingestion/src/cli.ts", args);
}

export function startIndex(options: { force?: boolean } = {}): Spawned {
  assertIdle();
  const args = ["index"];
  if (options.force) args.push("--force");
  return spawn("index", "packages/ai/src/cli.ts", args);
}

function assertIdle(): void {
  if (current) {
    throw new Error(
      `A ${current.kind} process is already running (pid ${current.pid}, started ${current.startedAt}). Wait for it to finish.`,
    );
  }
}

function spawn(kind: Spawned["kind"], script: string, args: string[]): Spawned {
  const proc = Bun.spawn([process.execPath, script, ...args], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });

  current = {
    kind,
    command: `${script} ${args.join(" ")}`.trim(),
    pid: proc.pid,
    startedAt: new Date().toISOString(),
  };

  void proc.exited.finally(() => {
    current = null;
  });

  return current;
}
