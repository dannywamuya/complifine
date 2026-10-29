import { describe, expect, test } from "bun:test";
import { renderNotificationEmail } from "../src/email/template.ts";

describe("renderNotificationEmail", () => {
  test("digest layout includes brand, counts, items, and CTA", () => {
    const { html, text } = renderNotificationEmail(
      {
        subject: "North field: 2 overdue, 1 missing",
        text: "Packline, Pest monitoring, and 1 more",
        href: "/app/records",
        siteName: "North field",
        counts: { overdue: 2, due: 0, pending: 0, missing: 1 },
        items: ["Packline monthly checklist", "Pest monitoring record", "Crate cleaning record"],
      },
      { baseUrl: "https://complifine.com" },
    );

    expect(html).toContain("CompliFine");
    expect(html).toContain("#9ae19d");
    expect(html).toContain("North field");
    expect(html).toContain("Overdue");
    expect(html).toContain("Missing");
    expect(html).toContain("Packline monthly checklist");
    expect(html).toContain("https://complifine.com/app/records");
    expect(html).toContain("Open Records");
    expect(html).toContain("https://complifine.com/brand/complifine-on-light.png");
    expect(text).toContain("At North field:");
    expect(text).toContain("- Packline monthly checklist");
    expect(text).toContain("Open in CompliFine: https://complifine.com/app/records");
  });

  test("simple notice escapes HTML and keeps a CTA", () => {
    const { html, text } = renderNotificationEmail(
      {
        subject: "Audit finished <script>",
        text: "Likely gaps on FV-Smart 01.02",
        href: "/app/readiness",
      },
      { baseUrl: "https://complifine.com" },
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("Audit finished &lt;script&gt;");
    expect(html).toContain("Open in CompliFine");
    expect(text).toContain("Likely gaps on FV-Smart 01.02");
  });
});
