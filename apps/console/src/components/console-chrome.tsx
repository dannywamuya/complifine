"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

interface Me {
  id: string;
  name: string;
  kind: string;
}

export function ConsoleChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    if (path === "/login") {
      setMe(null);
      return;
    }
    api<Me>("/auth/me")
      .then((user) => {
        if (user.kind !== "operator") {
          router.replace("/login");
          return;
        }
        setMe(user);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [path, router]);

  if (path === "/login") {
    return <>{children}</>;
  }

  if (!me) {
    return <p className="p-6 text-sm text-muted-foreground">Checking operator session…</p>;
  }

  return (
    <TooltipProvider>
      <SidebarProvider className="min-h-svh overflow-x-hidden">
        <AppSidebar />
        <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <span className="truncate text-sm text-muted-foreground md:hidden">CompliFine</span>
            <span className="ml-auto truncate text-sm text-muted-foreground">{me.name}</span>
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
