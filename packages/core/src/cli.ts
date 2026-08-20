/**
 * Argument parsing and terminal formatting, shared by every CLI in the repo.
 *
 * Hand-rolled rather than pulled from a dependency because the surface needed
 * here is tiny, and these helpers run inside library packages that also get
 * imported by the API process - dragging a CLI framework into that import
 * graph to save fifty lines is a bad trade.
 */

import { style } from "./logger.ts";

export interface Args {
  readonly command: string;
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

export function parseArgs(argv: readonly string[]): Args {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }

    // A flag followed by another flag is a boolean. Without this check,
    // `fetch --force --slug x` would swallow `--slug` as the value of
    // `--force` and then silently fetch everything.
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[body] = next;
      i++;
    } else {
      flags[body] = true;
    }
  }

  return { command, positional, flags };
}

export function flagString(args: Args, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function flagBool(args: Args, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === "true";
}

export function flagList(args: Args, name: string): string[] {
  const value = flagString(args, name);
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export function flagNumber(args: Args, name: string): number | undefined {
  const value = flagString(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number, got "${value}".`);
  return parsed;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function heading(text: string): void {
  console.log(`\n${style.bold(text)}`);
  console.log(style.dim("─".repeat(Math.max(text.length, 40))));
}

export const CHECK = style.green("✓");
export const CROSS = style.red("✗");
export const WARN = style.yellow("!");

/** Render rows as an aligned table. Empty input prints nothing. */
export function table(rows: ReadonlyArray<readonly string[]>): void {
  if (rows.length === 0) return;

  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, stripAnsi(cell).length);
    });
  }

  for (const row of rows) {
    const line = row
      .map((cell, i) =>
        i === row.length - 1
          ? cell
          : cell + " ".repeat(Math.max(0, widths[i]! - stripAnsi(cell).length)),
      )
      .join("  ");
    console.log(line);
  }
}

/** Width is measured on the visible text, so colour codes do not skew columns. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await work();
  console.log(style.dim(`  ${label} in ${formatDuration(performance.now() - start)}`));
  return result;
}

/** Wrap prose to a column width with a fixed left indent. */
export function wrapText(text: string, indent: number, width = 92): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    let line = pad;
    for (const word of paragraph.trim().split(/\s+/)) {
      if (line.length + word.length + 1 > width && line.trim().length > 0) {
        lines.push(line);
        line = pad;
      }
      line += (line === pad ? "" : " ") + word;
    }
    if (line.trim().length > 0) lines.push(line);
  }

  return lines.join("\n");
}
