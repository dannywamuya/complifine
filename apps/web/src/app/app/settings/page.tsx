"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useSite } from "@/lib/use-site";
import { NOTIFICATIONS_CHANGED } from "@/components/notification-bell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const EVENT_LABELS: Record<string, string> = {
  record_overdue: "Overdue records",
  record_due: "Records coming due",
  record_sent_back: "Records sent back",
  record_draft: "Drafts waiting to be filed",
  evidence_missing: "Missing evidence",
  evidence_expired: "Evidence out of date",
  daily_digest: "Daily summary",
  audit_complete: "Audit finished",
};

const TIMEZONES = [
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Dar_es_Salaam",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "UTC",
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface Preference {
  eventType: string;
  channel: string;
  enabled: boolean;
  digest: string;
  leadDays: number;
}

interface Settings {
  deliveryHourLocal: number;
  timezone: string;
  quietStart: number | null;
  quietEnd: number | null;
  siteIds: string[] | null;
}

interface PreferencesPayload {
  settings: Settings;
  preferences: Preference[];
}

export default function SettingsPage() {
  const { sites, org } = useSite();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<PreferencesPayload>("/notification-preferences")
      .then((payload) => {
        setSettings(payload.settings);
        setPreferences(payload.preferences.filter((row) => row.channel === "in_app"));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const canSend = org?.role === "owner" || org?.role === "compliance_manager";
  const zones = settings && !TIMEZONES.includes(settings.timezone) ? [settings.timezone, ...TIMEZONES] : TIMEZONES;

  function patchPreference(eventType: string, patch: Partial<Preference>) {
    setPreferences((current) => current.map((row) => (row.eventType === eventType ? { ...row, ...patch } : row)));
  }

  function followed(siteId: string): boolean {
    if (!settings) return false;
    if (settings.siteIds === null) return true;
    return settings.siteIds.includes(siteId);
  }

  function toggleSite(siteId: string, on: boolean) {
    setSettings((current) => {
      if (!current) return current;
      const all = sites.map((site) => site.id);
      const selected = new Set(current.siteIds === null ? all : current.siteIds);
      if (on) selected.add(siteId);
      else selected.delete(siteId);
      const next = [...selected];
      return { ...current, siteIds: next.length === all.length ? null : next };
    });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await api<PreferencesPayload>("/notification-preferences", {
        method: "PUT",
        body: JSON.stringify({ settings, preferences }),
      });
      setSettings(saved.settings);
      setPreferences(saved.preferences.filter((row) => row.channel === "in_app"));
      toast.success("Notification settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const result = await api<{ inserted: number }>("/notifications/run-digest", { method: "POST" });
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      toast.success(result.inserted > 0 ? "Today's summary is in your notifications" : "Nothing new to report");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the summary");
    } finally {
      setSending(false);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!settings) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-medium">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          A daily note of what is overdue, due, pending or missing. In the app for now.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily summary</CardTitle>
          <CardDescription>When the summary arrives, and which sites it covers.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>Delivery time</Label>
              <Select
                value={String(settings.deliveryHourLocal)}
                onValueChange={(value) => setSettings({ ...settings, deliveryHourLocal: Number(value) })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {String(hour).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Timezone</Label>
              <Select value={settings.timezone} onValueChange={(value) => setSettings({ ...settings, timezone: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Quiet from</Label>
              <HourSelect
                value={settings.quietStart}
                onChange={(quietStart) => setSettings({ ...settings, quietStart })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Quiet until</Label>
              <HourSelect value={settings.quietEnd} onChange={(quietEnd) => setSettings({ ...settings, quietEnd })} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sites</Label>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a site on the Company page.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sites.map((site) => (
                  <li key={site.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={followed(site.id)}
                        onCheckedChange={(value) => toggleSite(site.id, value === true)}
                      />
                      {site.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What to notify</CardTitle>
          <CardDescription>Turn a line off and it stays out of the summary and the bell.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked disabled />
              In app
            </label>
            {["Email", "SMS", "Mobile push"].map((label) => (
              <label key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={false} disabled />
                {label}
                <Badge variant="outline">Coming soon</Badge>
              </label>
            ))}
          </div>
          <ul className="flex flex-col gap-3">
            {preferences.map((row) => (
              <li key={row.eventType} className="grid items-center gap-2 sm:grid-cols-[1fr_9rem_auto]">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={(value) => patchPreference(row.eventType, { enabled: value === true })}
                  />
                  {EVENT_LABELS[row.eventType] ?? row.eventType}
                </label>
                <Select value={row.digest} onValueChange={(digest) => patchPreference(row.eventType, { digest })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="immediate">As it happens</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
                {row.eventType === "record_due" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Within</span>
                    <Input
                      className="h-8 w-16"
                      type="number"
                      min={0}
                      max={90}
                      value={row.leadDays}
                      onChange={(event) => patchPreference(row.eventType, { leadDays: Number(event.target.value) })}
                    />
                    <span className="text-muted-foreground">days</span>
                  </label>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {canSend ? (
            <Button variant="outline" disabled={sending} onClick={() => void sendNow()}>
              {sending ? "Sending…" : "Send me today's summary now"}
            </Button>
          ) : null}
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function HourSelect({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Select value={value === null ? "none" : String(value)} onValueChange={(next) => onChange(next === "none" ? null : Number(next))}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {HOURS.map((hour) => (
          <SelectItem key={hour} value={String(hour)}>
            {String(hour).padStart(2, "0")}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
