/**
 * Branded HTML + plain-text bodies for notification mail.
 * Colours match apps/web brand tokens (fern / celadon / graphite).
 */

export interface DigestEmailCounts {
  readonly overdue: number;
  readonly due: number;
  readonly pending: number;
  readonly missing: number;
}

export interface NotificationEmailContent {
  readonly subject: string;
  /** Plain fallback / preview line when there is no digest layout. */
  readonly text: string;
  readonly href?: string | null;
  readonly siteName?: string;
  readonly counts?: DigestEmailCounts | null;
  readonly items?: readonly string[];
}

const BRAND = {
  green: "#9ae19d",
  greenDeep: "#3d7a4a",
  ink: "#1a1f1c",
  muted: "#5c635c",
  soft: "#f3f4f0",
  card: "#ffffff",
  line: "#d8dcd4",
  overdue: "#a85c3a",
  due: "#8a6d2f",
  pending: "#3d5a6c",
  missing: "#6b4f7a",
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function logoUrl(base: string): string | null {
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/brand/complifine-on-light.png`;
}

function countChips(counts: DigestEmailCounts): { label: string; value: number; color: string }[] {
  return [
    { label: "Overdue", value: counts.overdue, color: BRAND.overdue },
    { label: "Due soon", value: counts.due, color: BRAND.due },
    { label: "Pending", value: counts.pending, color: BRAND.pending },
    { label: "Missing", value: counts.missing, color: BRAND.missing },
  ].filter((chip) => chip.value > 0);
}

export function renderNotificationEmail(
  input: NotificationEmailContent,
  options: { readonly baseUrl: string },
): { readonly html: string; readonly text: string } {
  const link = absoluteLink(input.href, options.baseUrl);
  const isDigest = Boolean(input.counts && input.siteName);
  const text = buildText(input, link, isDigest);
  const html = isDigest
    ? buildDigestHtml(input, link, options.baseUrl)
    : buildSimpleHtml(input, link, options.baseUrl);
  return { html, text };
}

function absoluteLink(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (!base) return href;
  return `${base.replace(/\/$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

function buildText(input: NotificationEmailContent, link: string | null, isDigest: boolean): string {
  const lines: string[] = [];
  lines.push(input.subject);
  lines.push("");
  if (isDigest && input.counts) {
    const chips = countChips(input.counts).map((c) => `${c.value} ${c.label.toLowerCase()}`);
    lines.push(`At ${input.siteName}: ${chips.join(", ")}.`);
    lines.push("");
    if (input.items && input.items.length > 0) {
      lines.push("Needs attention:");
      for (const item of input.items) lines.push(`- ${item}`);
      lines.push("");
    }
  } else {
    lines.push(input.text);
    lines.push("");
  }
  if (link) lines.push(`Open in CompliFine: ${link}`);
  lines.push("");
  lines.push("— CompliFine");
  return lines.join("\n");
}

function headerBlock(baseUrl: string): string {
  const logo = logoUrl(baseUrl);
  const mark = logo
    ? `<img src="${escapeHtml(logo)}" width="140" height="35" alt="CompliFine" style="display:block;height:35px;width:auto;border:0;" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">CompliFine</span>`;
  return `
    <tr>
      <td style="padding:28px 32px 16px 32px;">
        ${mark}
      </td>
    </tr>`;
}

function footerBlock(): string {
  return `
    <tr>
      <td style="padding:8px 32px 28px 32px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
          CompliFine helps you get audit-ready. It is not a certification body and does not certify you.
        </p>
      </td>
    </tr>`;
}

function ctaButton(link: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0 0;">
      <tr>
        <td style="border-radius:10px;background:${BRAND.green};">
          <a href="${escapeHtml(link)}"
             style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:${BRAND.ink};text-decoration:none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function shell(bodyRows: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CompliFine</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.soft};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;color:${BRAND.ink};">
          <tr>
            <td style="height:6px;background:${BRAND.green};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          ${bodyRows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildDigestHtml(
  input: NotificationEmailContent,
  link: string | null,
  baseUrl: string,
): string {
  const counts = input.counts!;
  const chips = countChips(counts);
  const chipHtml = chips
    .map(
      (chip) => `
      <td style="padding:0 8px 8px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:10px 14px;border-radius:10px;background:${BRAND.soft};border:1px solid ${BRAND.line};">
              <div style="font-size:20px;font-weight:700;color:${chip.color};line-height:1;">${chip.value}</div>
              <div style="font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};margin-top:4px;">${escapeHtml(chip.label)}</div>
            </td>
          </tr>
        </table>
      </td>`,
    )
    .join("");

  const items = (input.items ?? []).slice(0, 10);
  const extra = (input.items?.length ?? 0) - items.length;
  const listHtml =
    items.length === 0
      ? ""
      : `
      <p style="margin:24px 0 10px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">
        Needs attention
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">
        ${items
          .map(
            (item, index) => `
          <tr>
            <td style="padding:12px 14px;font-size:14px;line-height:1.4;color:${BRAND.ink};border-top:${index === 0 ? "0" : `1px solid ${BRAND.line}`};background:${BRAND.card};">
              ${escapeHtml(item)}
            </td>
          </tr>`,
          )
          .join("")}
        ${
          extra > 0
            ? `<tr><td style="padding:12px 14px;font-size:13px;color:${BRAND.muted};border-top:1px solid ${BRAND.line};">and ${extra} more</td></tr>`
            : ""
        }
      </table>`;

  const rows = `
    ${headerBlock(baseUrl)}
    <tr>
      <td style="padding:8px 32px 0 32px;">
        <p style="margin:0 0 6px 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.greenDeep};">
          Today&rsquo;s summary
        </p>
        <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">
          ${escapeHtml(input.siteName ?? "Your site")}
        </h1>
        <p style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:${BRAND.muted};">
          Here is what still needs a person on the record for this site.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 0 0;">
          <tr>${chipHtml}</tr>
        </table>
        ${listHtml}
        ${link ? ctaButton(link, "Open Records") : ""}
      </td>
    </tr>
    ${footerBlock()}
  `;
  return shell(rows);
}

function buildSimpleHtml(
  input: NotificationEmailContent,
  link: string | null,
  baseUrl: string,
): string {
  const rows = `
    ${headerBlock(baseUrl)}
    <tr>
      <td style="padding:8px 32px 0 32px;">
        <h1 style="margin:0;font-size:20px;line-height:1.35;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">
          ${escapeHtml(input.subject)}
        </h1>
        <p style="margin:14px 0 0 0;font-size:15px;line-height:1.55;color:${BRAND.muted};">
          ${escapeHtml(input.text)}
        </p>
        ${link ? ctaButton(link, "Open in CompliFine") : ""}
      </td>
    </tr>
    ${footerBlock()}
  `;
  return shell(rows);
}
