import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { requireAiEnv } from "@complifine/core";
import type { CaptureGenerator } from "./types.ts";

/** The production generator: structured output from the configured chat model. */
export function openaiCaptureGenerator(): CaptureGenerator {
  const env = requireAiEnv();
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL });
  const model = openai(env.AGENT_MODEL);
  return async (input) => {
    const content: Array<
      { type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: string }
    > = [];
    if (input.text) content.push({ type: "text", text: input.text });
    for (const image of input.images ?? []) {
      content.push({ type: "image", image: image.bytes, mediaType: image.mime });
    }
    if (content.length === 0) content.push({ type: "text", text: "(empty source)" });
    const result = await generateObject({
      model,
      schema: input.schema,
      system: input.instructions,
      messages: [{ role: "user", content }],
    });
    return result.object;
  };
}
