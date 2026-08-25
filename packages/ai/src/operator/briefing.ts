/**
 * Operator briefing over knowledge-base health.
 *
 * Deterministic copy lives in the API. This is the optional LLM pass: a
 * paragraph the operator can ask for, never a publish decision.
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { requireAiEnv } from "@complifine/core";

export async function briefKnowledgeHealth(payload: unknown): Promise<string> {
  const env = requireAiEnv();
  const openai = createOpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });

  const result = await generateText({
    model: openai(env.AGENT_MODEL),
    temperature: 0.2,
    system:
      "You brief a CompliFine operator on knowledge-base health. " +
      "Be specific and operational: name edition codes, gate failures, and the next human action. " +
      "Never tell them to skip review, force-publish, or hide a blocking gate. " +
      "Producers only see published editions; say that when it matters. " +
      "Write 3–6 short paragraphs. No title.",
    prompt: JSON.stringify(payload),
  });

  return result.text.trim();
}
