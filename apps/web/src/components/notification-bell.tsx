"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { api } from "@/lib/api";
import { rememberSite } from "@/lib/use-site";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const NOTIFICATIONS_CHANGED = "cf-notifications";

interface NotificationRow {
  id: string;
  eventType: string;
  title: string;
  body: string;
  href: string | null;
  siteId: string;
  siteName: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationList {
  notifications: NotificationRow[];
  unreadCount: number;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationList>({ notifications: [], unreadCount: 0 });

  const load = useCallback(() => {
    api<NotificationList>("/notifications?limit=20")
      .then(setData)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    const onChanged = () => load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [load]);

  const unread = data.unreadCount > 9 ? "9+" : String(data.unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={data.unreadCount > 0 ? `Notifications, ${data.unreadCount} unread` : "Notifications"}
        >
          <Bell />
          {data.unreadCount > 0 ? (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {data.unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                void api("/notifications/read-all", { method: "POST" }).then(load);
              }}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        {data.notifications.length === 0 ? (
          <p className="px-3 py-6 text-sm text-muted-foreground">Nothing pending to report.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {data.notifications.map((row) => (
              <li key={row.id} className="flex items-start gap-1 border-b last:border-b-0">
                <Link
                  href={row.href || "/app/records"}
                  className="min-w-0 flex-1 px-3 py-2 hover:bg-muted"
                  onClick={() => {
                    rememberSite(row.siteId);
                    setOpen(false);
                    if (!row.readAt) {
                      void api(`/notifications/${row.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ read: true }),
                      }).then(load);
                    }
                  }}
                >
                  <p className={row.readAt ? "text-sm" : "text-sm font-medium"}>{row.title}</p>
                  {row.body ? <p className="truncate text-xs text-muted-foreground">{row.body}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    {[row.siteName, relativeTime(row.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-1 mr-1 size-7"
                  aria-label="Dismiss"
                  onClick={() => {
                    void api(`/notifications/${row.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ dismissed: true }),
                    }).then(load);
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t px-3 py-2">
          <Link
            href="/app/settings"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function relativeTime(value: string): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
