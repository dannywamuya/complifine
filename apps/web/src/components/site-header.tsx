"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Me {
  id: string;
  name: string;
  kind: string;
}

export function SiteHeader() {
  const path = usePathname();
  const inApp = path.startsWith("/app");
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, [path]);

  const links = inApp
    ? [
        { href: "/app/search", label: "Ask" },
        { href: "/app/farm", label: "Farm" },
        { href: "/criteria", label: "Criteria" },
      ]
    : [
        { href: "/demo", label: "Book a demo" },
        { href: "/criteria", label: "Criteria" },
        { href: "/app/search", label: "Product" },
      ];

  return (
    <header className="sticky top-0 z-20 min-w-0 overflow-x-hidden border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 min-w-0 max-w-5xl items-center gap-3 px-4 sm:gap-6">
        <Link href="/" className="shrink-0 font-heading text-base font-medium tracking-tight">
          CompliFine
        </Link>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {links.map((link) => {
            const active = path === link.href || path.startsWith(`${link.href}/`);
            return (
              <Button
                key={link.href}
                asChild
                variant="ghost"
                size="sm"
                className={cn(active && "bg-muted text-foreground")}
              >
                <Link href={link.href}>{link.label}</Link>
              </Button>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {me ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">{me.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await api("/auth/logout", { method: "POST" });
                  window.location.href = "/";
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
