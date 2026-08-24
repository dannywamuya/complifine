"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Tractor } from "lucide-react";
import { api, startSessionKeepAlive } from "@/lib/api";
import type { Me, OrgPayload } from "@/lib/farm";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => {
        const next =
          path === "/app/ask" || path.startsWith("/app/search") ? "/app" : path || "/app";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      });
  }, [path, router]);

  useEffect(() => {
    if (!me) return;
    api<OrgPayload>("/org")
      .then((payload) => setOrgName(payload.organization?.name ?? null))
      .catch(() => setOrgName(null));
  }, [me]);

  useEffect(() => {
    if (!me) return;
    return startSessionKeepAlive();
  }, [me]);

  const chatHome = path === "/app";
  const onCriteria = path.startsWith("/app/criteria");
  const onFarm = path.startsWith("/app/farm");

  if (!me) {
    return (
      <div className="flex min-h-svh flex-col gap-3 bg-black p-8 text-white">
        <Skeleton className="h-8 w-48 bg-white/10" />
        <Skeleton className="h-24 w-full max-w-xl bg-white/10" />
        <p className="text-sm text-white/60">Checking your session…</p>
      </div>
    );
  }

  return (
    <SidebarProvider className="min-h-svh overflow-x-hidden">
      <AppSidebar />
      <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <nav className="flex min-w-0 items-center gap-1">
            <Button asChild variant={onCriteria ? "secondary" : "ghost"} size="sm">
              <Link href="/app/criteria">Criteria</Link>
            </Button>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-1.5">
                  <Avatar size="sm">
                    <AvatarFallback>{initials(me.name) || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-40 truncate sm:inline">{me.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{me.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{me.email}</p>
                  {orgName ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{orgName}</p>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/farm" className={onFarm ? "bg-accent" : undefined}>
                    <Tractor className="size-4" />
                    Farm profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await api("/auth/logout", { method: "POST" });
                    window.location.href = "/";
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div
          className={
            chatHome
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 min-w-0 flex-1 overflow-x-hidden p-6"
          }
        >
          {children}
        </div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
