import { afterEach, describe, expect, test } from "bun:test";
import { chatMaxSteps, requireAiEnv, resetEnvCache } from "../src/env.ts";

const KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "EMBEDDING_MODEL",
  "AGENT_MODEL",
  "CHAT_MODEL",
  "CHAT_MAX_STEPS",
] as const;

const saved = new Map<string, string | undefined>();

function stash(): void {
  for (const key of KEYS) {
    saved.set(key, process.env[key]);
  }
}

function restore(): void {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
}

afterEach(() => {
  restore();
});

describe("CHAT_MODEL and CHAT_MAX_STEPS", () => {
  test("defaults to gpt-4.1 and 8 steps", () => {
    stash();
    delete process.env.CHAT_MODEL;
    delete process.env.CHAT_MAX_STEPS;
    delete process.env.AGENT_MODEL;
    process.env.OPENAI_API_KEY = "test-key-for-env";
    resetEnvCache();

    const ai = requireAiEnv();
    expect(ai.CHAT_MODEL).toBe("gpt-4.1");
    expect(ai.CHAT_MAX_STEPS).toBe(8);
    expect(ai.AGENT_MODEL).toBe("gpt-5");
    expect(chatMaxSteps()).toBe(8);
  });

  test("CHAT_MAX_STEPS rejects values above 16", () => {
    stash();
    process.env.OPENAI_API_KEY = "test-key-for-env";
    process.env.CHAT_MAX_STEPS = "32";
    resetEnvCache();

    expect(() => requireAiEnv()).toThrow(/CHAT_MAX_STEPS/);
  });

  test("blank CHAT_MODEL falls back to the default", () => {
    stash();
    process.env.OPENAI_API_KEY = "test-key-for-env";
    process.env.CHAT_MODEL = "";
    process.env.CHAT_MAX_STEPS = "";
    resetEnvCache();

    const ai = requireAiEnv();
    expect(ai.CHAT_MODEL).toBe("gpt-4.1");
    expect(ai.CHAT_MAX_STEPS).toBe(8);
  });
});
