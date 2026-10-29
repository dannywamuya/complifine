/**
 * The production auditor: one structured judgement per requirement, then one closing note.
 */

import { requireAiEnv } from "@complifine/core";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { samplingFor } from "../agent/agent.ts";
import { AUDITOR_INSTRUCTIONS, judgeSchema, type AuditGenerator } from "./judge.ts";
import { rankItems } from "./summary.ts";

export function openaiAuditGenerator(): AuditGenerator {
  const env = requireAiEnv();
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL });
  const model = openai(env.AGENT_MODEL);
  const sampling = samplingFor(env.AGENT_MODEL, 0);

  return {
    async judge(dossier) {
      const result = await generateObject({
        model,
        schema: judgeSchema,
        system: AUDITOR_INSTRUCTIONS,
        prompt: JSON.stringify(dossier),
        ...sampling,
      });
      return {
        ...judgeSchema.parse(result.object),
        promptTokens: result.usage?.inputTokens,
        completionTokens: result.usage?.outputTokens,
      };
    },
    async summarize(input) {
      const result = await generateText({
        model,
        system:
          "You are writing the closing note of an internal audit simulation. " +
          "Write 3 to 6 short paragraphs. Never say the site is certified. Name the edition. " +
          "Major Must failures come first, then items at risk, then insufficient evidence. " +
          "Recommend what to fix, naming the criterion. This is a simulation, not a certification audit.",
        prompt: JSON.stringify({ edition: input.edition, items: rankItems(input.items) }),
        ...sampling,
      });
      return {
        summary: result.text.trim(),
        recommendations: [],
        promptTokens: result.usage?.inputTokens,
        completionTokens: result.usage?.outputTokens,
      };
    },
  };
}
