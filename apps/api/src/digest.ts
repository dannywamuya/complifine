/**
 * Daily pending digest.
 *
 * A tick every 15 minutes inserts at most one row per item per local day per
 * channel. The unique `(user, dedupe key)` index makes a second tick a no-op.
 * `in_app` and `email` have senders; SMS and push stay absent until wired.
 */

import { eq, type Database, type NotificationCounts } from "@complifine/db";
import { memberships, notifications, sites, users } from "@complifine/db";
import { digestEnabled, type NotificationChannel, type NotificationEventType } from "@complifine/core";
import { countPending, pendingWork, type PendingItem } from "./pending.ts";
import {
  loadNotificationState,
  type PreferenceChoice,
  type SettingsChoice,
} from "./notification-prefs.ts";
import { resolveEmailAddress, sendNotificationEmail } from "./email/resend.ts";

export interface DigestNotice {
  readonly userId: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly siteName?: string;
  readonly eventType: NotificationEventType;
  readonly channel: NotificationChannel;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly subjectKey: string;
  readonly dedupeKey: string;
  readonly counts: NotificationCounts | null;
  readonly itemTitles?: readonly string[];
}

type ChannelSender = (db: Database, notice: DigestNotice) => Promise<void>;

/**
 * In-app delivery is the inserted row. Email goes through Resend when configured.
 */
export const channelSenders: Partial<Record<NotificationChannel, ChannelSender>> = {
  in_app: async () => {},
  email: async (db, notice) => {
    const to = await resolveEmailAddress(db, notice.userId);
    if (!to) return;
    await sendNotificationEmail({
      to,
      subject: notice.title,
      text: notice.body,
      href: notice.href,
      siteName: notice.siteName,
      counts: notice.counts,
      items: notice.itemTitles,
    });
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const ITEM_BODY: Record<Exclude<NotificationEventType, "daily_digest">, string> = {
  record_overdue: "This record is overdue.",
  record_due: "This record is coming due.",
  record_sent_back: "This record was sent back.",
  record_draft: "This draft is waiting to be filed.",
  evidence_missing: "This evidence is not on file.",
  evidence_expired: "This evidence is out of date.",
  audit_complete: "The audit simulation finished.",
};

export function localClock(now: Date, timeZone: string): { hour: number; day: string } {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatted.formatToParts(now).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return { hour, day: `${parts.year}-${parts.month}-${parts.day}` };
}

/** Quiet window may cross midnight, for example 22:00 to 06:00. */
export function inQuietHours(hour: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** Due items notify only inside the person's lead window. Other events always pass. */
export function withinLeadDays(item: PendingItem, leadDays: number, now: Date): boolean {
  if (item.eventType !== "record_due") return true;
  if (!item.expiresAt) return false;
  const remaining = new Date(item.expiresAt).getTime() - now.getTime();
  return remaining <= leadDays * DAY_MS;
}

export function shouldSend(
  preference: PreferenceChoice,
  options: { readonly manual: boolean; readonly hour: number; readonly deliveryHour: number; readonly quiet: boolean },
): boolean {
  if (!preference.enabled || preference.digest === "off") return false;
  if (!(preference.channel in channelSenders)) return false;
  if (options.manual) return true;
  if (options.quiet) return false;
  if (preference.digest === "immediate") return true;
  return options.hour === options.deliveryHour;
}

/** Keep legacy in-app keys; prefix other channels so both can land the same day. */
export function noticeDedupeKey(channel: NotificationChannel, key: string): string {
  return channel === "in_app" ? key : `${channel}:${key}`;
}

export async function runDigestForUser(
  db: Database,
  input: { readonly userId: string; readonly orgId: string; readonly now?: Date; readonly manual?: boolean },
): Promise<{ inserted: number }> {
  const now = input.now ?? new Date();
  const manual = input.manual ?? false;
  const { settings, preferences } = await loadNotificationState(db, input.userId, input.orgId);
  const clock = localClock(now, settings.timezone);
  const quiet = inQuietHours(clock.hour, settings.quietStart, settings.quietEnd);
  const due = preferences.some((preference) =>
    shouldSend(preference, {
      manual,
      hour: clock.hour,
      deliveryHour: settings.deliveryHourLocal,
      quiet,
    }),
  );
  if (!due) return { inserted: 0 };

  const orgSites = await db.select().from(sites).where(eq(sites.organizationId, input.orgId));
  const followed = followedSites(orgSites, settings);
  let inserted = 0;
  for (const site of followed) {
    const pending = await pendingWork(db, { orgId: input.orgId, siteId: site.id });
    inserted += await insertSiteDigest(db, {
      userId: input.userId,
      orgId: input.orgId,
      siteId: site.id,
      siteName: site.name,
      items: pending.items,
      preferences,
      day: clock.day,
      now,
      manual,
      hour: clock.hour,
      deliveryHour: settings.deliveryHourLocal,
      quiet,
    });
  }
  return { inserted };
}

export async function runDigestTick(db: Database, now = new Date()): Promise<{ inserted: number }> {
  const members = await db
    .select({ userId: memberships.userId, organizationId: memberships.organizationId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(users.kind, "member"));
  let inserted = 0;
  for (const member of members) {
    try {
      const result = await runDigestForUser(db, {
        userId: member.userId,
        orgId: member.organizationId,
        now,
      });
      inserted += result.inserted;
    } catch (error) {
      const message = error instanceof Error ? error.message : "digest failed";
      console.error(`Digest skipped for organisation ${member.organizationId}: ${message}`);
    }
  }
  return { inserted };
}

export function startDigestScheduler(db: Database): () => void {
  if (!digestEnabled()) return () => {};
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    void runDigestTick(db)
      .catch((error) => {
        const message = error instanceof Error ? error.message : "digest failed";
        console.error(`Digest tick failed: ${message}`);
      })
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(tick, 15 * 60 * 1000);
  tick();
  return () => clearInterval(timer);
}

function followedSites<T extends { id: string }>(orgSites: T[], settings: SettingsChoice): T[] {
  if (settings.siteIds === null) return orgSites;
  const wanted = new Set(settings.siteIds);
  return orgSites.filter((site) => wanted.has(site.id));
}

async function insertSiteDigest(
  db: Database,
  input: {
    readonly userId: string;
    readonly orgId: string;
    readonly siteId: string;
    readonly siteName: string;
    readonly items: PendingItem[];
    readonly preferences: PreferenceChoice[];
    readonly day: string;
    readonly now: Date;
    readonly manual: boolean;
    readonly hour: number;
    readonly deliveryHour: number;
    readonly quiet: boolean;
  },
): Promise<number> {
  const sendOptions = {
    manual: input.manual,
    hour: input.hour,
    deliveryHour: input.deliveryHour,
    quiet: input.quiet,
  };

  const activeChannels = (["in_app", "email"] as const).filter((channel) => channel in channelSenders);

  let inserted = 0;
  for (const channel of activeChannels) {
    const chosen = input.items.filter((item) => {
      const preference = input.preferences.find(
        (row) => row.eventType === item.eventType && row.channel === channel,
      );
      if (!preference) return false;
      if (!shouldSend(preference, sendOptions)) return false;
      return withinLeadDays(item, preference.leadDays, input.now);
    });
    const counts = countPending(chosen);

    const summary = input.preferences.find(
      (row) => row.eventType === "daily_digest" && row.channel === channel,
    );
    if (summary && shouldSend(summary, sendOptions) && hasPending(counts)) {
      const notice = digestNotice({ ...input, items: chosen, channel }, counts);
      if (await insertNotice(db, notice)) inserted += 1;
    }

    // Email is one summary per site — never a message per overdue row (spam).
    if (channel === "email") continue;

    for (const item of chosen) {
      const baseKey = `${item.eventType}:${item.subjectKey}:${input.day}`;
      const notice: DigestNotice = {
        userId: input.userId,
        organizationId: input.orgId,
        siteId: input.siteId,
        eventType: item.eventType,
        channel,
        title: item.title,
        body: ITEM_BODY[item.eventType as Exclude<NotificationEventType, "daily_digest">],
        href: item.href,
        subjectKey: item.subjectKey,
        dedupeKey: noticeDedupeKey(channel, baseKey),
        counts: null,
      };
      if (await insertNotice(db, notice)) inserted += 1;
    }
  }
  return inserted;
}

function hasPending(counts: NotificationCounts): boolean {
  return counts.overdue + counts.due + counts.pending + counts.missing > 0;
}

function digestNotice(
  input: {
    readonly userId: string;
    readonly orgId: string;
    readonly siteId: string;
    readonly siteName: string;
    readonly day: string;
    readonly items: PendingItem[];
    readonly channel: NotificationChannel;
  },
  counts: NotificationCounts,
): DigestNotice {
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.due) parts.push(`${counts.due} due`);
  if (counts.pending) parts.push(`${counts.pending} pending`);
  if (counts.missing) parts.push(`${counts.missing} missing`);
  const itemTitles = input.items.map((item) => item.title);
  const preview = itemTitles.slice(0, 8);
  const extra = itemTitles.length - preview.length;
  const body = extra > 0 ? `${preview.join(", ")} and ${extra} more` : preview.join(", ");
  const baseKey = `digest:${input.orgId}:${input.siteId}:${input.day}`;
  return {
    userId: input.userId,
    organizationId: input.orgId,
    siteId: input.siteId,
    siteName: input.siteName,
    eventType: "daily_digest",
    channel: input.channel,
    title: `${input.siteName}: ${parts.join(", ")}`,
    body,
    href: "/app/records",
    subjectKey: input.siteId,
    dedupeKey: noticeDedupeKey(input.channel, baseKey),
    counts,
    itemTitles,
  };
}

/** Insert a notice and run its channel sender only when the insert wins. */
export async function insertNotice(db: Database, notice: DigestNotice): Promise<boolean> {
  const sender = channelSenders[notice.channel];
  if (!sender) return false;
  const now = new Date();
  const inserted = await db
    .insert(notifications)
    .values({
      userId: notice.userId,
      organizationId: notice.organizationId,
      siteId: notice.siteId,
      eventType: notice.eventType,
      channel: notice.channel,
      title: notice.title,
      body: notice.body,
      href: notice.href,
      subjectKey: notice.subjectKey,
      dedupeKey: notice.dedupeKey,
      counts: notice.counts,
      deliveredAt: now,
    })
    .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
    .returning({ id: notifications.id });
  if (inserted.length === 0) return false;
  await sender(db, notice);
  return true;
}
