/**
 * Typed environment configuration.
 *
 * Split into three groups by when they are needed. Ingestion and publication
 * must run with no AI credentials at all - that is a design guarantee, not an
 * accident - so `requireAiEnv()` is a separate call that only the embedding
 * and agent code paths make.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Bun auto-loads `.env` from the process cwd. Root scripts such as
 * `bun run api` `cd` into an app package first, so that file is never seen
 * even when it is sitting at the monorepo root. drizzle-kit has the same
 * problem (`packages/db/drizzle.config.ts`); load the root file here so every
 * consumer of `env()` behaves the same regardless of where it was started.
 *
 * Existing process.env keys win: a real deployment, a test preload, or an
 * already-exported variable must not be overwritten by the file.
 */
function applyRootEnvFile(): void {
  const path = resolve(import.meta.dir, "../../..", ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice("export ".length) : line;
    const eq = stripped.indexOf("=");
    if (eq === -1) continue;
    const key = stripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

applyRootEnvFile();

/**
 * Variables that a `.env` file may legitimately leave blank.
 *
 * `OPENAI_BASE_URL=` in a template means "use the default", but an empty
 * string is not the same as an unset variable to code that reads
 * `process.env` directly - and the OpenAI SDK does exactly that, refusing to
 * initialise with `baseURL must be a non-empty string`. Deleting the key
 * outright is the only fix that also covers third-party readers; validating it
 * away in our own schema would leave the SDK broken.
 */
const BLANKABLE = [
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "EMBEDDING_MODEL",
  "AGENT_MODEL",
  "LOG_FORMAT",
  "LOG_LEVEL",
  "OPERATOR_EMAIL",
  "OPERATOR_PASSWORD",
  "NEXT_PUBLIC_CAL_URL",
] as const;

function unsetBlanks(): void {
  for (const key of BLANKABLE) {
    if (process.env[key] !== undefined && process.env[key]!.trim() === "") {
      delete process.env[key];
    }
  }
}

unsetBlanks();

/**
 * PaaS platforms (Railway, Fly, Render, Docker) inject `PORT`. Honour it so
 * the API binds where the proxy expects, without every host mapping `API_PORT`.
 */
function applyPlatformPort(): void {
  const port = process.env.PORT?.trim();
  if (port && /^\d+$/.test(port)) {
    process.env.API_PORT = port;
  }
}

applyPlatformPort();

const baseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required. Copy .env.example to .env and start the database with `bun run db:up`.")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgres:// connection string",
    }),
  STORAGE_ROOT: z.string().default("./storage"),
  FETCH_USER_AGENT: z
    .string()
    .default("CompliFine/0.1 (compliance knowledge base)"),
  API_PORT: z.coerce.number().int().positive().default(3311),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(16).default("complifine-dev-jwt-secret-change-me"),
  OPERATOR_EMAIL: z.string().email().default("operator@complifine.local"),
  OPERATOR_PASSWORD: z.string().min(8).default("changeme-operator"),
  NEXT_PUBLIC_CAL_URL: z.string().optional(),
});

const aiSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .min(1, "OPENAI_API_KEY is required for embeddings and the agent. Ingestion does not need it."),
  OPENAI_BASE_URL: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  AGENT_MODEL: z.string().default("gpt-5"),
});

export type BaseEnv = z.infer<typeof baseSchema>;
export type AiEnv = z.infer<typeof aiSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

let cachedBase: BaseEnv | null = null;

export function env(): BaseEnv {
  if (cachedBase) return cachedBase;
  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(parsed.error)}`);
  }
  cachedBase = parsed.data;
  return cachedBase;
}

let cachedAi: AiEnv | null = null;

/**
 * Validate and return AI configuration. Throws with an actionable message when
 * credentials are missing, rather than failing deep inside an HTTP client.
 */
export function requireAiEnv(): AiEnv {
  if (cachedAi) return cachedAi;
  const parsed = aiSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid AI configuration:\n${formatIssues(parsed.error)}`);
  }
  cachedAi = parsed.data;
  return cachedAi;
}

/** Whether AI features can run, without throwing. Used to degrade the UI gracefully. */
export function hasAiCredentials(): boolean {
  return aiSchema.safeParse(process.env).success;
}

/** Reset memoized config and re-normalise blanks. Test-only. */
export function resetEnvCache(): void {
  cachedBase = null;
  cachedAi = null;
  unsetBlanks();
  applyPlatformPort();
}
