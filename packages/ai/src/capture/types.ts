import type { ZodType } from "zod";

/** What the capture pipeline hands the model: text, a picture, or both. */
export interface NormalisedInput {
  readonly text?: string;
  readonly images?: readonly { readonly mime: string; readonly bytes: Uint8Array }[];
}

/**
 * The one function the pipeline needs from a model. Tests pass a fake; the API
 * passes `generateObject` against the configured chat model.
 */
export interface CaptureGenerator {
  (input: {
    readonly instructions: string;
    readonly schema: ZodType;
    readonly text?: string;
    readonly images?: readonly { readonly mime: string; readonly bytes: Uint8Array }[];
  }): Promise<unknown>;
}
