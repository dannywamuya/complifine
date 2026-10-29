/**
 * Turns a voice note into text. Language is a hint (`en` or `sw`), not a guess
 * the model is free to change: Kenyan registers are often dictated in Swahili.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { transcribe } from "ai";
import { requireAiEnv } from "@complifine/core";

export async function transcribeAudio(bytes: Uint8Array, language: "en" | "sw"): Promise<string> {
  const env = requireAiEnv();
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL });
  const result = await transcribe({
    model: openai.transcription("whisper-1"),
    audio: bytes,
    providerOptions: { openai: { language } },
  });
  return result.text;
}
