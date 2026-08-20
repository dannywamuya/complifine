import { describe, expect, test } from "bun:test";
import { parseProseSections } from "../src/pdf/section-parser.ts";
import { makePdf, runningHeader, tocEntry } from "./fixtures/pdf.ts";

const byNumber = (sections: ReturnType<typeof parseProseSections>, number: string) =>
  sections.find((s) => s.number === number);

describe("parseProseSections", () => {
  test("recovers the author's outline with bodies attached", () => {
    const sections = parseProseSections(
      makePdf([
        `
        4 CB APPROVAL PROCESS
        The process has three stages.
        4.1 CB approval by GLOBALG.A.P.
        The CB shall submit an application.
        4.2 Termination of approval
        Approval may be terminated by either party.
        `,
      ]),
    );

    expect(sections.map((s) => s.number)).toEqual(["4", "4.1", "4.2"]);
    expect(byNumber(sections, "4")!.title).toBe("CB APPROVAL PROCESS");
    expect(byNumber(sections, "4.1")!.body).toBe("The CB shall submit an application.");
    expect(byNumber(sections, "4.2")!.depth).toBe(2);
    expect(byNumber(sections, "4.2")!.parentNumber).toBe("4");
  });

  // The bug this file was rewritten to fix. Contents entries are verbatim
  // copies of the headings, so a per-line heading detector imports the whole
  // table of contents as sections - complete with the trailing page number
  // glued onto the title.
  test("ignores the table of contents", () => {
    const sections = parseProseSections(
      makePdf([
        `
        ${runningHeader(2, 52)}
        TABLE OF CONTENTS
        ${tocEntry("4 CB APPROVAL PROCESS", 7)}
        ${tocEntry("4.1 CB approval by GLOBALG.A.P.", 7)}
        ${tocEntry("4.2 Termination of approval", 9)}
        ${tocEntry("5 OPERATIONAL REQUIREMENTS", 11)}
        `,
        `
        ${runningHeader(7, 52)}
        4 CB APPROVAL PROCESS
        The process has three stages.
        `,
      ]),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe("CB APPROVAL PROCESS");
    expect(sections[0]!.startPage).toBe(2);
  });

  // A long contents entry wraps, and its first line carries no dot leaders.
  // Judged line by line it is indistinguishable from a real heading, which is
  // why contents detection is per page.
  test("ignores a contents entry that wraps onto a second line", () => {
    const sections = parseProseSections(
      makePdf([
        `
        TABLE OF CONTENTS
        ${tocEntry("7.4 Unannounced CB audits", 23)}
        ${tocEntry("7.5 CB audits for benchmarked schemes", 24)}
        7.6 Using ICT for a CB audit's off-site stage (Option 1 or Option 2) (based on IAF
        ${tocEntry("MD4:2018)", 24)}
        `,
        `
        7.6 Using ICT for a CB audit's off-site stage
        ICT may be used for the off-site stage.
        `,
      ]),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe("Using ICT for a CB audit's off-site stage");
  });

  test("strips the running header and footer from every page", () => {
    const sections = parseProseSections(
      makePdf([
        `
        ${runningHeader(10, 52)}
        4.3 AB requirements
        The AB shall be a signatory of the IAF MLA.
        `,
        `
        ${runningHeader(11, 52)}
        The AB shall also have signed the memorandum of understanding.
        `,
      ]),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]!.body).toBe(
      "The AB shall be a signatory of the IAF MLA. " +
        "The AB shall also have signed the memorandum of understanding.",
    );
    expect(sections[0]!.startPage).toBe(1);
    expect(sections[0]!.endPage).toBe(2);
  });

  // Deriving depth from the clause number alone produces a tree with dangling
  // children whenever a parent heading is missing from the extracted text. The
  // node is genuinely a root of our tree, and is reported as one.
  test("promotes a clause whose parent heading never appears", () => {
    const sections = parseProseSections(
      makePdf([
        `
        7.1 Audit scope
        The audit covers all registered products.
        `,
      ]),
    );

    expect(sections[0]!.number).toBe("7.1");
    expect(sections[0]!.depth).toBe(1);
    expect(sections[0]!.parentNumber).toBeNull();
  });

  test("attaches a grandchild to the nearest ancestor that exists", () => {
    const sections = parseProseSections(
      makePdf([
        `
        7 AUDIT PROCESS
        Audits follow this process.
        7.3.1 Internal audits
        The QMS shall include internal audits.
        `,
      ]),
    );

    const grandchild = byNumber(sections, "7.3.1")!;
    expect(grandchild.parentNumber).toBe("7");
    expect(grandchild.depth).toBe(2);
    expect(grandchild.path).toEqual(["7 AUDIT PROCESS", "7.3.1 Internal audits"]);
  });

  test("builds a breadcrumb path through the whole chain", () => {
    const sections = parseProseSections(
      makePdf([
        `
        7 AUDIT PROCESS
        Overview.
        7.3 Option 2 producer groups
        Applies to groups.
        7.3.2 Sanctions
        A warning may be issued.
        `,
      ]),
    );

    expect(byNumber(sections, "7.3.2")!.path).toEqual([
      "7 AUDIT PROCESS",
      "7.3 Option 2 producer groups",
      "7.3.2 Sanctions",
    ]);
    expect(byNumber(sections, "7.3.2")!.depth).toBe(3);
  });

  test("recognises the unnumbered heading style used for annexes", () => {
    const sections = parseProseSections(
      makePdf([
        `
        VERSION/EDITION UPDATE REGISTER
        Version 6.0 was published in September 2022.
        `,
      ]),
    );

    expect(sections[0]!.number).toBeNull();
    expect(sections[0]!.title).toBe("VERSION/EDITION UPDATE REGISTER");
    expect(sections[0]!.depth).toBe(1);
  });

  // Body paragraphs and list markers must not be promoted to headings, or the
  // outline dissolves into one section per sentence.
  test("does not mistake body text for a heading", () => {
    const sections = parseProseSections(
      makePdf([
        `
        5.1 General requirements
        a) The CB shall maintain records.
        (i) The extent of the accreditation scope
        4.2 million kilograms were certified in the reporting period.
        b) The CB shall report annually.
        `,
      ]),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]!.number).toBe("5.1");
    expect(sections[0]!.body).toContain("4.2 million kilograms");
    expect(sections[0]!.body).toContain("a) The CB shall maintain records.");
  });

  // A chapter heading usually has no prose of its own - "8 CERTIFICATION
  // PROCESS" is followed straight away by "8.1". Dropping it would orphan
  // every clause in the chapter and lose the chapter title from their
  // breadcrumbs.
  test("keeps an empty heading that has subsections under it", () => {
    const sections = parseProseSections(
      makePdf([
        `
        8 CERTIFICATION PROCESS
        `,
        `
        8.1 Certificate issue
        A certificate is issued within 28 days.
        `,
      ]),
    );

    expect(sections.map((s) => s.number)).toEqual(["8", "8.1"]);
    expect(sections[1]!.parentNumber).toBe("8");
    expect(sections[1]!.path).toEqual(["8 CERTIFICATION PROCESS", "8.1 Certificate issue"]);
  });

  test("drops an empty heading with nothing under it, which is a page artefact", () => {
    const sections = parseProseSections(
      makePdf([
        `
        8 CERTIFICATION PROCESS
        `,
        `
        9 TRANSFER BETWEEN CBS
        A producer may transfer between certification bodies.
        `,
      ]),
    );

    expect(sections.map((s) => s.number)).toEqual(["9"]);
  });

  // The remainder of a wrapped heading is left on its own line and is all
  // capitals, so it looks like an unnumbered heading. Accepting it opens a
  // section that swallows the real one's body and orphans its subsections.
  test("does not mistake a wrapped heading's remainder for an unnumbered heading", () => {
    const sections = parseProseSections(
      makePdf([
        `
        7.6 Using ICT for a CB audit's off-site stage (Option 1 or Option 2) (based on IAF
        MD4:2018)
        ICT may be used for the off-site stage of an audit.
        7.6.1 Security and confidentiality
        Use of ICT shall be mutually agreed.
        `,
      ]),
    );

    expect(sections.map((s) => s.number)).toEqual(["7.6", "7.6.1"]);
    expect(sections[0]!.body).toContain("ICT may be used for the off-site stage");
    expect(sections[1]!.parentNumber).toBe("7.6");
  });

  test("orders sections numerically, so 4.10 follows 4.9", () => {
    const sections = parseProseSections(
      makePdf([
        `
        4.9 Ninth clause
        Text.
        4.10 Tenth clause
        Text.
        `,
      ]),
    );

    const ninth = byNumber(sections, "4.9")!;
    const tenth = byNumber(sections, "4.10")!;
    expect(ninth.order).toBeLessThan(tenth.order);
  });

  test("discards cover matter that precedes the first heading", () => {
    const sections = parseProseSections(
      makePdf([
        `
        GLOBALG.A.P. GENERAL REGULATIONS
        Valid from 1 April 2025.
        1 INTRODUCTION
        These regulations govern certification.
        `,
      ]),
    );

    // The cover title is itself a caps heading and keeps its own line; what
    // matters is that its text does not leak into the introduction.
    expect(byNumber(sections, "1")!.body).toBe("These regulations govern certification.");
  });

  test("returns nothing for a document with no detectable structure", () => {
    expect(parseProseSections(makePdf(["", "   "]))).toEqual([]);
  });
});
