import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLocalDocument, parseOpenCmsRedirect, validateMagicBytes } from "../src/fetch.ts";
import { sha256 } from "../src/storage.ts";

const encode = (text: string) => new TextEncoder().encode(text);

/**
 * The body documents.globalgap.org actually returns, under HTTP 200, for some
 * documents. `fetch` cannot follow it because it is not a 3xx, so a client that
 * does not recognise it stores 400 bytes of XML where it expected a PDF - and
 * the failure only surfaces later, as an inexplicable parse error.
 */
const OPENCMS_REDIRECT = `<?xml version="1.0" encoding="UTF-8"?>
<RedirectPages xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <RedirectPage language="en">
    <Title><![CDATA[Summary of Changes]]></Title>
    <target><![CDATA[/sites/default/files/documents/220623_Summary_of_Changes.pdf]]></target>
  </RedirectPage>
</RedirectPages>`;

describe("parseOpenCmsRedirect", () => {
  test("recovers the target filename from the descriptor", () => {
    expect(parseOpenCmsRedirect(encode(OPENCMS_REDIRECT))).toBe(
      "220623_Summary_of_Changes.pdf",
    );
  });

  test("returns null for a real document", () => {
    expect(parseOpenCmsRedirect(encode("%PDF-1.7\nreal content"))).toBeNull();
    expect(parseOpenCmsRedirect(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });

  test("returns null for XML that is not a redirect descriptor", () => {
    expect(parseOpenCmsRedirect(encode('<?xml version="1.0"?><other><target>x</target></other>'))).toBeNull();
  });

  // Guard on size, so a multi-megabyte PDF is never decoded as text just to
  // discover it is not a 400-byte redirect.
  test("does not inspect bodies too large to be a descriptor", () => {
    const large = new Uint8Array(9000);
    large.set(encode(OPENCMS_REDIRECT), 0);
    expect(parseOpenCmsRedirect(large)).toBeNull();
  });

  test("returns null when the descriptor carries no target", () => {
    expect(parseOpenCmsRedirect(encode("<RedirectPages><RedirectPage/></RedirectPages>"))).toBeNull();
  });
});

describe("validateMagicBytes", () => {
  test("accepts a real PDF and a real xlsx", () => {
    expect(() => validateMagicBytes(encode("%PDF-1.7"), "pdf")).not.toThrow();
    expect(() => validateMagicBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "xlsx")).not.toThrow();
    expect(() => validateMagicBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "docx")).not.toThrow();
  });

  // The classic silent ingestion failure: an HTML error page saved as .pdf,
  // discovered weeks later as a parse error with no obvious cause.
  test("rejects an HTML error page served as a PDF, and quotes it", () => {
    expect(() => validateMagicBytes(encode("<!DOCTYPE html><html><body>404"), "pdf")).toThrow(
      /not a valid \.pdf file.*DOCTYPE html/s,
    );
  });

  test("rejects a PDF served where a workbook was expected", () => {
    expect(() => validateMagicBytes(encode("%PDF-1.7"), "xlsx")).toThrow(/not a valid \.xlsx/);
  });

  test("passes through extensions it has no signature for", () => {
    expect(() => validateMagicBytes(encode("id,name\n1,x"), "csv")).not.toThrow();
  });

  test("rejects an empty body", () => {
    expect(() => validateMagicBytes(new Uint8Array(), "pdf")).toThrow();
  });
});

describe("loadLocalDocument", () => {
  test("hashes and types a file supplied on disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "complifine-local-"));
    try {
      await writeFile(join(dir, "checklist.xlsx"), "PK\u0003\u0004payload");

      const result = await loadLocalDocument("checklist.xlsx", dir);

      expect(result.hash).toBe(sha256(result.bytes));
      expect(result.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(result.resolvedFrom).toStartWith("file://");
      // Local files carry no HTTP metadata, and pretending otherwise would put
      // a fabricated date into the provenance record.
      expect(result.lastModified).toBeNull();
      expect(result.etag).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("resolves a relative path against the base directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "complifine-local-"));
    try {
      await writeFile(join(dir, "doc.pdf"), "%PDF-1.7");
      const result = await loadLocalDocument("./doc.pdf", dir);
      expect(result.mimeType).toBe("application/pdf");
      expect(result.byteSize).toBe(8);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fails loudly when the declared file is not there", async () => {
    await expect(loadLocalDocument("absent.pdf", tmpdir())).rejects.toThrow();
  });
});
