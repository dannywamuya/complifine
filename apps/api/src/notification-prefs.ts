/**
 * What a person asked to be told, with conservative defaults when they have
 * not saved anything yet.
 */

import { status } from "elysia";
import { and, eq, type Database } from "@complifine/db";
import { notificationPreferences, notificationSettings, sites } from "@complifine/db";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DIGESTS,
  NOTIFICATION_EVENT_TYPES,
  type NotificationChannel,
  type NotificationDigest,
  type NotificationEventType,
} from "@complifine/core";

export const DEFAULT_LEAD_DAYS = 7;
export const DEFAULT_DELIVERY_HOUR = 7;
export const DEFAULT_TIMEZONE = "Africa/Nairobi";

export interface PreferenceChoice {
  readonly eventType: NotificationEventType;
  readonly channel: NotificationChannel;
  readonly enabled: boolean;
  readonly digest: NotificationDigest;
  readonly leadDays: number;
}

export interface SettingsChoice {
  readonly deliveryHourLocal: number;
  readonly timezone: string;
  readonly quietStart: number | null;
  readonly quietEnd: number | null;
  /** Null follows every site. An empty list follows none. */
  readonly siteIds: string[] | null;
}

const EVENT_TYPES = new Set<string>(NOTIFICATION_EVENT_TYPES);
const CHANNELS = new Set<string>(NOTIFICATION_CHANNELS);
const DIGESTS = new Set<string>(NOTIFICATION_DIGESTS);

export function defaultPreference(eventType: NotificationEventType, channel: NotificationChannel = "in_app"): PreferenceChoice {
  const inAppOn = eventType !== "record_draft";
  return {
    eventType,
    channel,
    // Email is opt-in until the person enables it in Settings.
    enabled: channel === "email" ? false : inAppOn,
    digest: eventType === "audit_complete" ? "immediate" : "daily",
    leadDays: DEFAULT_LEAD_DAYS,
  };
}

export function defaultSettings(): SettingsChoice {
  return {
    deliveryHourLocal: DEFAULT_DELIVERY_HOUR,
    timezone: DEFAULT_TIMEZONE,
    quietStart: null,
    quietEnd: null,
    siteIds: null,
  };
}

export function isTimeZone(value: string): boolean {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
  if (supported) return supported.includes(value);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function loadNotificationState(
  db: Database,
  userId: string,
  orgId: string,
): Promise<{ settings: SettingsChoice; preferences: PreferenceChoice[] }> {
  const [storedSettings] = await db
    .select()
    .from(notificationSettings)
    .where(and(eq(notificationSettings.userId, userId), eq(notificationSettings.organizationId, orgId)));
  const storedPreferences = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.organizationId, orgId)));

  const settings: SettingsChoice = storedSettings
    ? {
        deliveryHourLocal: storedSettings.deliveryHourLocal,
        timezone: storedSettings.timezone,
        quietStart: storedSettings.quietStart,
        quietEnd: storedSettings.quietEnd,
        siteIds: storedSettings.siteIds,
      }
    : defaultSettings();

  const preferences: PreferenceChoice[] = [];
  for (const channel of ["in_app", "email"] as const) {
    for (const eventType of NOTIFICATION_EVENT_TYPES) {
      const saved = storedPreferences.find((row) => row.eventType === eventType && row.channel === channel);
      preferences.push(
        saved
          ? {
              eventType,
              channel,
              enabled: saved.enabled,
              digest: saved.digest,
              leadDays: saved.leadDays,
            }
          : defaultPreference(eventType, channel),
      );
    }
  }
  for (const row of storedPreferences) {
    if (row.channel === "in_app" || row.channel === "email") continue;
    preferences.push({
      eventType: row.eventType,
      channel: row.channel,
      enabled: row.enabled,
      digest: row.digest,
      leadDays: row.leadDays,
    });
  }
  return { settings, preferences };
}

export interface PreferenceInput {
  readonly eventType: string;
  readonly channel: string;
  readonly enabled: boolean;
  readonly digest: string;
  readonly leadDays: number;
}

export interface SettingsInput {
  readonly deliveryHourLocal: number;
  readonly timezone: string;
  readonly quietStart: number | null;
  readonly quietEnd: number | null;
  readonly siteIds: string[] | null;
}

export async function saveNotificationState(
  db: Database,
  userId: string,
  orgId: string,
  input: { readonly settings: SettingsInput; readonly preferences: readonly PreferenceInput[] },
): Promise<{ settings: SettingsChoice; preferences: PreferenceChoice[] }> {
  const settings = validateSettings(input.settings);
  const preferences = input.preferences.map(validatePreference);
  if (settings.siteIds && settings.siteIds.length > 0) {
    const owned = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.organizationId, orgId));
    const ids = new Set(owned.map((row) => row.id));
    if (settings.siteIds.some((id) => !ids.has(id))) {
      throw status(422, { error: "Choose sites from this company" });
    }
  }

  const now = new Date();
  await db
    .insert(notificationSettings)
    .values({
      userId,
      organizationId: orgId,
      deliveryHourLocal: settings.deliveryHourLocal,
      timezone: settings.timezone,
      quietStart: settings.quietStart,
      quietEnd: settings.quietEnd,
      siteIds: settings.siteIds,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [notificationSettings.userId, notificationSettings.organizationId],
      set: {
        deliveryHourLocal: settings.deliveryHourLocal,
        timezone: settings.timezone,
        quietStart: settings.quietStart,
        quietEnd: settings.quietEnd,
        siteIds: settings.siteIds,
        updatedAt: now,
      },
    });

  for (const preference of preferences) {
    await db
      .insert(notificationPreferences)
      .values({
        userId,
        organizationId: orgId,
        eventType: preference.eventType,
        channel: preference.channel,
        enabled: preference.enabled,
        digest: preference.digest,
        leadDays: preference.leadDays,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.organizationId,
          notificationPreferences.eventType,
          notificationPreferences.channel,
        ],
        set: {
          enabled: preference.enabled,
          digest: preference.digest,
          leadDays: preference.leadDays,
          updatedAt: now,
        },
      });
  }

  return loadNotificationState(db, userId, orgId);
}

function validateSettings(input: SettingsInput): SettingsChoice {
  if (!Number.isInteger(input.deliveryHourLocal) || input.deliveryHourLocal < 0 || input.deliveryHourLocal > 23) {
    throw status(422, { error: "Delivery hour must be from 0 to 23" });
  }
  const timezone = input.timezone.trim();
  if (!isTimeZone(timezone)) throw status(422, { error: "Choose a known timezone" });
  const quietStart = hourOrNull(input.quietStart, "Quiet hours must be from 0 to 23");
  const quietEnd = hourOrNull(input.quietEnd, "Quiet hours must be from 0 to 23");
  if ((quietStart === null) !== (quietEnd === null)) {
    throw status(422, { error: "Set both quiet hours, or neither" });
  }
  const siteIds = input.siteIds;
  if (siteIds !== null && !Array.isArray(siteIds)) {
    throw status(422, { error: "Choose sites from this company" });
  }
  return {
    deliveryHourLocal: input.deliveryHourLocal,
    timezone,
    quietStart,
    quietEnd,
    siteIds,
  };
}

function validatePreference(input: PreferenceInput): PreferenceChoice {
  if (!EVENT_TYPES.has(input.eventType)) throw status(422, { error: "Unknown notification" });
  if (!CHANNELS.has(input.channel)) throw status(422, { error: "Unknown channel" });
  if (!DIGESTS.has(input.digest)) throw status(422, { error: "Unknown digest" });
  if (!Number.isInteger(input.leadDays) || input.leadDays < 0 || input.leadDays > 90) {
    throw status(422, { error: "Lead days must be from 0 to 90" });
  }
  return {
    eventType: input.eventType as NotificationEventType,
    channel: input.channel as NotificationChannel,
    enabled: input.enabled,
    digest: input.digest as NotificationDigest,
    leadDays: input.leadDays,
  };
}

function hourOrNull(value: number | null, message: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 23) throw status(422, { error: message });
  return value;
}
