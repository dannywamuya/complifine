/**
 * Operator CRM mail — wraps Resend and always records crm_messages.
 */

import { crmMessages, type Database } from "@complifine/db";
import { appBaseUrl } from "@complifine/core";
import { resolveEmailAddress, sendNotificationEmail } from "./resend.ts";

export type CrmMessageKind = "manual" | "approved" | "rejected" | "disabled";

export interface SendCrmEmailInput {
  readonly db: Database;
  readonly operatorId: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly kind: CrmMessageKind;
  readonly userId?: string | null;
  readonly demoRequestId?: string | null;
  readonly href?: string | null;
}

export interface SendCrmEmailResult {
  readonly sent: boolean;
  readonly messageId: string;
}

function loginHref(): string | null {
  const base = appBaseUrl();
  return base ? `${base}/login` : "/login";
}

/** Prefer notification endpoint, else account email. */
export async function resolveUserMail(db: Database, userId: string, fallbackEmail: string): Promise<string> {
  return (await resolveEmailAddress(db, userId)) ?? fallbackEmail;
}

export async function sendCrmEmail(input: SendCrmEmailInput): Promise<SendCrmEmailResult> {
  const to = input.to.trim();
  const subject = input.subject.trim();
  const text = input.text.trim();
  if (!to || !subject || !text) {
    throw new Error("Email needs a recipient, subject and body");
  }

  const sent = await sendNotificationEmail({
    to,
    subject,
    text,
    href: input.href,
  });

  const [row] = await input.db
    .insert(crmMessages)
    .values({
      operatorId: input.operatorId,
      userId: input.userId ?? null,
      demoRequestId: input.demoRequestId ?? null,
      toEmail: to,
      subject,
      body: text,
      kind: input.kind,
    })
    .returning({ id: crmMessages.id });

  return { sent, messageId: row!.id };
}

export function approvedEmailCopy(name: string): { subject: string; text: string; href: string | null } {
  return {
    subject: "Your CompliFine account is approved",
    text: `Hi ${name},\n\nYour CompliFine producer account is approved. You can sign in and set up your sites.`,
    href: loginHref(),
  };
}

export function rejectedEmailCopy(name: string, note?: string | null): { subject: string; text: string } {
  const reason = note?.trim() ? `\n\nNote from our team: ${note.trim()}` : "";
  return {
    subject: "CompliFine signup update",
    text: `Hi ${name},\n\nWe were not able to approve your CompliFine account at this time.${reason}\n\nContact us if you have questions.`,
  };
}

export function disabledEmailCopy(name: string, note?: string | null): { subject: string; text: string } {
  const reason = note?.trim() ? `\n\nNote: ${note.trim()}` : "";
  return {
    subject: "Your CompliFine account was disabled",
    text: `Hi ${name},\n\nYour CompliFine account has been disabled.${reason}\n\nContact us if you need help.`,
  };
}
