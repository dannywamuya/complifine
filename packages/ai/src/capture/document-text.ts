/**
 * Text an auditor can read from a company file.
 *
 * PDFs, spreadsheets and CSV go through the same normaliser as capture.
 * Images get a short description from the vision model. Callers store the
 * result; a failure leaves the column null so a later audit can try again.
 */

import { z } from "zod";
import { eq, type Database } from "@complifine/db";
import { companyDocuments } from "@complifine/db";
import { normaliseCapture } from "./normalise.ts";
import { openaiCaptureGenerator } from "./openai.ts";

export const EXTRACT_CHAR_CAP = 20_000;

const imageSchema = z.object({
  description: z.string().describe("What the image shows, in plain sentences, including any readable words."),
});

export async function textFromBytes(mime: string, bytes: Uint8Array, filename: string): Promise<string> {
  if (mime.startsWith("image/")) {
    const object = imageSchema.parse(
      await openaiCaptureGenerator()({
        instructions:
          "Describe this compliance document so an auditor can tell what it is. " +
          "Transcribe visible headings, dates, names and numbers. Do not invent text that is not visible.",
        schema: imageSchema,
        images: [{ mime, bytes }],
      }),
    );
    return object.description.slice(0, EXTRACT_CHAR_CAP);
  }
  const normalised = await normaliseCapture(mime, bytes, filename);
  return (normalised.text ?? "").slice(0, EXTRACT_CHAR_CAP);
}

/** Read and store text when a document has never been extracted. Returns the text now on file. */
export async function ensureDocumentText(
  db: Database,
  document: {
    id: string;
    mimeType: string;
    filename: string;
    storageKey: string;
    extractedText: string | null;
  },
  readFile: (storageKey: string) => Promise<Uint8Array>,
): Promise<string | null> {
  if (document.extractedText?.trim()) return document.extractedText;
  try {
    const text = (await textFromBytes(document.mimeType, await readFile(document.storageKey), document.filename)).trim();
    if (!text) return null;
    await db
      .update(companyDocuments)
      .set({ extractedText: text, extractedAt: new Date(), updatedAt: new Date() })
      .where(eq(companyDocuments.id, document.id));
    return text;
  } catch {
    return null;
  }
}
