/**
 * Minimal structured logger.
 *
 * Ingestion runs are long and mostly watched from a terminal, so the default
 * output is human readable with a stable prefix per stage. Set `LOG_FORMAT=json`
 * to emit one JSON object per line for machine consumption.
 */

import type { LogLevel } from "./enums.ts";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: COLORS.gray,
  info: COLORS.blue,
  warn: COLORS.yellow,
  error: COLORS.red,
};

function useColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout?.isTTY);
}

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.info;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** Derive a logger with an additional scope segment, e.g. `ingest:xlsx`. */
  child(scope: string): Logger;
}

function formatFields(fields: Record<string, unknown>, color: boolean): string {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  const rendered = entries
    .map(([k, v]) => {
      const value = typeof v === "string" ? v : JSON.stringify(v);
      return color ? `${COLORS.gray}${k}=${COLORS.reset}${value}` : `${k}=${value}`;
    })
    .join(" ");
  return ` ${rendered}`;
}

export function createLogger(scope: string): Logger {
  const emit = (level: LogLevel, message: string, fields: Record<string, unknown> = {}): void => {
    if (LEVEL_ORDER[level] < threshold()) return;

    if (process.env.LOG_FORMAT === "json") {
      process.stdout.write(
        `${JSON.stringify({ ts: new Date().toISOString(), level, scope, message, ...fields })}\n`,
      );
      return;
    }

    const color = useColor();
    const time = new Date().toISOString().slice(11, 23);
    const head = color
      ? `${COLORS.gray}${time}${COLORS.reset} ${LEVEL_COLOR[level]}${level.padEnd(5)}${COLORS.reset} ${COLORS.cyan}${scope}${COLORS.reset}`
      : `${time} ${level.padEnd(5)} ${scope}`;

    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(`${head} ${message}${formatFields(fields, color)}\n`);
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (child) => createLogger(`${scope}:${child}`),
  };
}

/** Terminal styling helpers for CLI output that is not a log line. */
export const style = {
  bold: (s: string) => (useColor() ? `${COLORS.bold}${s}${COLORS.reset}` : s),
  dim: (s: string) => (useColor() ? `${COLORS.dim}${s}${COLORS.reset}` : s),
  green: (s: string) => (useColor() ? `${COLORS.green}${s}${COLORS.reset}` : s),
  red: (s: string) => (useColor() ? `${COLORS.red}${s}${COLORS.reset}` : s),
  yellow: (s: string) => (useColor() ? `${COLORS.yellow}${s}${COLORS.reset}` : s),
  cyan: (s: string) => (useColor() ? `${COLORS.cyan}${s}${COLORS.reset}` : s),
  magenta: (s: string) => (useColor() ? `${COLORS.magenta}${s}${COLORS.reset}` : s),
  gray: (s: string) => (useColor() ? `${COLORS.gray}${s}${COLORS.reset}` : s),
};
