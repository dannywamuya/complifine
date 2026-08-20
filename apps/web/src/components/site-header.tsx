"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/search", label: "Ask" },
  { href: "/criteria", label: "Criteria" },
  { href: "/scope", label: "My farm" },
];

export function SiteHeader() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-20 min-w-0 overflow-x-hidden border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 min-w-0 max-w-5xl items-center gap-3 px-4 sm:gap-6">
        <Link href="/" className="shrink-0 font-heading text-base font-medium tracking-tight">
          CompliFine
        </Link>
        <nav className="flex min-w-0 flex-wrap items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/search"
                ? path === "/search" || path === "/ask" || path.startsWith("/search/")
                : path === link.href || path.startsWith(`${link.href}/`);
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
      </div>
    </header>
  );
}
