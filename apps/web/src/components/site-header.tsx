"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, startSessionKeepAlive } from "@/lib/api";
import type { Me } from "@/lib/farm";

export function SiteHeader() {
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (path.startsWith("/app")) return;
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => setMe(null));
  }, [path]);

  useEffect(() => {
    if (!me || path.startsWith("/app")) return;
    return startSessionKeepAlive();
  }, [me, path]);

  if (path.startsWith("/app")) return null;

  return (
    <header className="sticky top-0 z-20 min-w-0 overflow-x-hidden border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 min-w-0 max-w-5xl items-center gap-3 px-4 sm:gap-6">
        <Link href="/" className="shrink-0 font-heading text-base font-medium tracking-tight">
          CompliFine
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/demo">Book a demo</Link>
          </Button>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {me ? (
            <Button asChild size="sm">
              <Link href="/app">Open dashboard</Link>
            </Button>
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
