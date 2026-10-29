/**
 * Notification mail via Resend.
 *
 * No-op when RESEND_API_KEY / RESEND_FROM_EMAIL are unset so local and CI stay quiet.
 */

import { and, eq, type Database, type NotificationCounts } from "@complifine/db";
import { notificationChannelEndpoints, users } from "@complifine/db";
import { appBaseUrl, env, resendConfigured } from "@complifine/core";
import { Resend } from "resend";
import { renderNotificationEmail } from "./template.ts";

export interface NotificationEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly href?: string | null;
  readonly siteName?: string;
  readonly counts?: NotificationCounts | null;
  readonly items?: readonly string[];
}

export interface ResendClient {
  emails: {
    send: (payload: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html?: string;
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
}

let client: ResendClient | null = null;

/** Test hook — inject a fake Resend client. */
export function setResendClient(next: ResendClient | null): void {
  client = next;
}

function getClient(): ResendClient | null {
  if (client) return client;
  if (!resendConfigured()) return null;
  return new Resend(env().RESEND_API_KEY!.trim()) as unknown as ResendClient;
}

export async function resolveEmailAddress(db: Database, userId: string): Promise<string | null> {
  const [endpoint] = await db
    .select({ address: notificationChannelEndpoints.address })
    .from(notificationChannelEndpoints)
    .where(
      and(eq(notificationChannelEndpoints.userId, userId), eq(notificationChannelEndpoints.channel, "email")),
    )
    .limit(1);
  if (endpoint?.address) return endpoint.address;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return user?.email ?? null;
}

export async function upsertEmailEndpoint(db: Database, userId: string, address: string): Promise<void> {
  const now = new Date();
  await db
    .delete(notificationChannelEndpoints)
    .where(
      and(eq(notificationChannelEndpoints.userId, userId), eq(notificationChannelEndpoints.channel, "email")),
    );
  await db.insert(notificationChannelEndpoints).values({
    userId,
    channel: "email",
    address,
    verifiedAt: now,
    updatedAt: now,
  });
}

/**
 * Send a notification email. Returns false when Resend is not configured or
 * the address is empty; throws when Resend returns an error.
 */
export async function sendNotificationEmail(input: NotificationEmail): Promise<boolean> {
  const to = input.to.trim();
  if (!to) return false;
  const api = getClient();
  if (!api) return false;
  const from = env().RESEND_FROM_EMAIL!.trim();
  const baseUrl = appBaseUrl();
  const rendered = renderNotificationEmail(
    {
      subject: input.subject,
      text: input.text,
      href: input.href,
      siteName: input.siteName,
      counts: input.counts,
      items: input.items,
    },
    { baseUrl },
  );
  const result = await api.emails.send({
    from,
    to: [to],
    subject: input.subject,
    text: rendered.text,
    html: rendered.html,
  });
  if (result.error) throw new Error(`Resend: ${result.error.message}`);
  return true;
}
