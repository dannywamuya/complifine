import { afterEach, describe, expect, test } from "bun:test";
import { appBaseUrl, resetEnvCache, resendConfigured } from "@complifine/core";
import { noticeDedupeKey } from "../src/digest.ts";
import {
  sendNotificationEmail,
  setResendClient,
  type ResendClient,
} from "../src/email/resend.ts";

const KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "APP_BASE_URL"] as const;
const saved = new Map<string, string | undefined>();

function stash(): void {
  for (const key of KEYS) saved.set(key, process.env[key]);
}

function restore(): void {
  for (const key of KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setResendClient(null);
  resetEnvCache();
}

afterEach(() => {
  restore();
});

describe("resendConfigured", () => {
  test("needs both key and from address", () => {
    stash();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    resetEnvCache();
    expect(resendConfigured()).toBe(false);

    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "CompliFine <notify@example.com>";
    resetEnvCache();
    expect(resendConfigured()).toBe(true);
  });
});

describe("sendNotificationEmail", () => {
  test("no-ops when Resend is not configured", async () => {
    stash();
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    resetEnvCache();
    setResendClient(null);
    expect(await sendNotificationEmail({ to: "a@b.test", subject: "Hi", text: "Body" })).toBe(false);
  });

  test("sends once through the injected client with an absolute link", async () => {
    stash();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "CompliFine <notify@example.com>";
    process.env.APP_BASE_URL = "https://complifine.com/";
    resetEnvCache();
    expect(appBaseUrl()).toBe("https://complifine.com");

    const sent: Array<{ from: string; to: string[]; subject: string; text: string; html?: string }> = [];
    const fake: ResendClient = {
      emails: {
        send: async (payload) => {
          sent.push(payload);
          return { data: { id: "msg_1" }, error: null };
        },
      },
    };
    setResendClient(fake);

    const ok = await sendNotificationEmail({
      to: "farmer@example.com",
      subject: "North field: 2 overdue",
      text: "Packline monthly checklist",
      href: "/app/records",
      siteName: "North field",
      counts: { overdue: 2, due: 0, pending: 0, missing: 0 },
      items: ["Packline monthly checklist"],
    });
    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.from).toBe("CompliFine <notify@example.com>");
    expect(sent[0]?.to).toEqual(["farmer@example.com"]);
    expect(sent[0]?.subject).toBe("North field: 2 overdue");
    expect(sent[0]?.text).toContain("Packline monthly checklist");
    expect(sent[0]?.text).toContain("Open in CompliFine: https://complifine.com/app/records");
    expect(sent[0]?.html).toContain("#9ae19d");
    expect(sent[0]?.html).toContain("Open Records");
  });
});

describe("noticeDedupeKey", () => {
  test("keeps in-app keys and prefixes email", () => {
    expect(noticeDedupeKey("in_app", "digest:org:site:2026-10-29")).toBe("digest:org:site:2026-10-29");
    expect(noticeDedupeKey("email", "digest:org:site:2026-10-29")).toBe("email:digest:org:site:2026-10-29");
  });
});
