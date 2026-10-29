import { describe, expect, test } from "bun:test";
import { FORM_LIBRARY } from "@complifine/db/form-library";
import { pdfFilename, renderRecordPdf } from "../src/record-pdf.ts";

const packline = FORM_LIBRARY.find((template) => template.slug === "packline-monthly-checklist");
const training = FORM_LIBRARY.find((template) => template.slug === "training-record");
const safety = FORM_LIBRARY.find((template) => template.slug === "safety-instructions");

async function textOf(bytes: Uint8Array): Promise<string> {
  const path = `/tmp/complifine-record-${crypto.randomUUID()}.pdf`;
  await Bun.write(path, bytes);
  const proc = Bun.spawn(["pdftotext", "-layout", path, "-"], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr || `pdftotext exited ${code}`);
  }
  return stdout;
}

describe("record pdf", () => {
  test("names the file from the form title", () => {
    expect(pdfFilename("Packline monthly checklist")).toBe("Packline-monthly-checklist.pdf");
  });

  test("packline checklist matches the paper columns", async () => {
    expect(packline).toBeTruthy();
    const bytes = await renderRecordPdf({
      company: "AFREX Gold",
      site: "Karagita Packhouse",
      location: "Naivasha",
      docRef: "AFREX AFG-PH 26",
      title: packline!.title,
      definition: packline!.definition,
      header: { date: "2026-10-01", checked_by: "Mary Wanjiku", confirmed_by: "Peter Kamau" },
      entries: [
        { data: { item: "water-flume", fault: "Leaking seal", action: "Seal replaced", remarks: "Done" } },
      ],
    });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const text = await textOf(bytes);
    expect(text).toContain("AFREX Gold");
    expect(text).toContain("AFREX AFG-PH 26");
    expect(text).toContain("PACKLINE MONTHLY CHECKLIST");
    expect(text).toContain("Karagita Packhouse, Naivasha");
    expect(text).toContain("1 Oct 2026");
    expect(text).toContain("MACHINE PART / TYPE");
    expect(text).toContain("FAULT REPORT");
    expect(text).toContain("ACTION TAKEN OR REPAIR");
    expect(text).toContain("Water flume");
    expect(text).toContain("Leaking seal");
    expect(text).toContain("Checked by: Mary Wanjiku");
    expect(text).toContain("Confirmed by: Peter Kamau");
    expect(text).toContain("Sign:");
    expect(text).toContain("Comments:");
  });

  test("training record has the company blank and a trainee table", async () => {
    expect(training).toBeTruthy();
    const bytes = await renderRecordPdf({
      company: "AFREX Gold",
      site: "Karagita Farm",
      location: null,
      docRef: "AFREX GG/FARM/REC08, AFG-PH 50",
      title: training!.title,
      definition: training!.definition,
      header: {
        course: "Hygiene",
        date: "2026-09-12",
        provider: "AFREX",
        venue: "Packhouse hall",
        trainers: "Jane Akinyi",
      },
      entries: [{ data: { trainee: "John Otieno", signed: true } }],
    });
    const text = await textOf(bytes);
    expect(text).toContain("TRAINING RECORD");
    expect(text).toContain("Course title: Hygiene");
    expect(text).toContain("Training date: 12 Sep 2026");
    expect(text).toContain("John Otieno");
    expect(text).toContain("SIGNATURE");
    expect(text).toContain("Yes");
    expect(text).toContain("Trainer(s): Jane Akinyi");
  });

  test("safety instructions keep the Swahili text", async () => {
    expect(safety).toBeTruthy();
    const bytes = await renderRecordPdf({
      company: "AFREX Gold",
      site: "Karagita Farm",
      location: null,
      docRef: safety!.sourceRef,
      title: safety!.title,
      definition: safety!.definition,
      header: {},
      entries: [{ data: { worker: "Asha Njeri", language: "Swahili", date: "2026-08-01", acknowledged: true } }],
    });
    const text = await textOf(bytes);
    expect(text).toContain("Kiswahili");
    expect(text).toContain("Ni jukumu la kila mfanyikazi");
    expect(text).toContain("Asha Njeri");
  });
});
