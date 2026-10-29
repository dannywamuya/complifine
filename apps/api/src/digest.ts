/**
 * Daily pending digest.
 *
 * A tick every 15 minutes inserts at most one row per item per local day.
 * The unique `(user, dedupe key)` index makes a second tick a no-op. Only
 * `in_app` has a sender; adding email, SMS or push is a new function in
 * `channelSenders` plus an address in `notification_channel_endpoints`.
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

export interface DigestNotice {
  readonly userId: string;
  readonly organizationId: string;
  readonly siteId: string;
  readonly eventType: NotificationEventType;
  readonly channel: NotificationChannel;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly subjectKey: string;
  readonly dedupeKey: string;
  readonly counts: NotificationCounts | null;
}

/**
 * In-app delivery is the inserted row. Other channels stay absent until a
 * provider exists, so a saved email preference does not send anything.
 */
export const channelSenders: Partial<Record<NotificationChannel, (notice: DigestNotice) => Promise<void>>> = {
  in_app: async () => {},
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
  const chosen = input.items.filter((item) => {
    const preference = input.preferences.find(
      (row) => row.eventType === item.eventType && row.channel in channelSenders,
    );
    if (!preference) return false;
    if (!shouldSend(preference, input)) return false;
    return withinLeadDays(item, preference.leadDays, input.now);
  });
  const counts = countPending(chosen);
  let inserted = 0;

  const summary = input.preferences.find((row) => row.eventType === "daily_digest");
  if (summary && shouldSend(summary, input) && hasPending(counts)) {
    const notice = digestNotice({ ...input, items: chosen }, counts);
    if (await insertNotice(db, notice)) inserted += 1;
  }

  for (const item of chosen) {
    const notice: DigestNotice = {
      userId: input.userId,
      organizationId: input.orgId,
      siteId: input.siteId,
      eventType: item.eventType,
      channel: "in_app",
      title: item.title,
      body: ITEM_BODY[item.eventType as Exclude<NotificationEventType, "daily_digest">],
      href: item.href,
      subjectKey: item.subjectKey,
      dedupeKey: `${item.eventType}:${item.subjectKey}:${input.day}`,
      counts: null,
    };
    if (await insertNotice(db, notice)) inserted += 1;
  }
  return inserted;
}

function hasPending(counts: NotificationCounts): boolean {
  return counts.overdue + counts.due + counts.pending + counts.missing > 0;
}

function digestNotice(
  input: { readonly userId: string; readonly orgId: string; readonly siteId: string; readonly siteName: string; readonly day: string; readonly items: PendingItem[] },
  counts: NotificationCounts,
): DigestNotice {
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.due) parts.push(`${counts.due} due`);
  if (counts.pending) parts.push(`${counts.pending} pending`);
  if (counts.missing) parts.push(`${counts.missing} missing`);
  const titles = input.items.slice(0, 8).map((item) => item.title);
  const extra = input.items.length - titles.length;
  const body = extra > 0 ? `${titles.join(", ")} and ${extra} more` : titles.join(", ");
  return {
    userId: input.userId,
    organizationId: input.orgId,
    siteId: input.siteId,
    eventType: "daily_digest",
    channel: "in_app",
    title: `${input.siteName}: ${parts.join(", ")}`,
    body,
    href: "/app/records",
    subjectKey: input.siteId,
    dedupeKey: `digest:${input.orgId}:${input.siteId}:${input.day}`,
    counts,
  };
}

async function insertNotice(db: Database, notice: DigestNotice): Promise<boolean> {
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
  await sender(notice);
  return true;
}
