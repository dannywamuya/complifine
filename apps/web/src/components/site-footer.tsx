import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Container } from "@/components/marketing/section";

const LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-black">
      <Container className="flex flex-col gap-8 py-12 sm:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_auto]">
          <div className="max-w-xl space-y-4">
            <Link href="/" aria-label="CompliFine home">
              <BrandLogo className="h-6 max-w-40" />
            </Link>
            <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
              CompliFine is an intelligent compliance operating system that turns
              constantly changing standards into versioned, actionable company
              knowledge — with an agent that cites the published source.
            </p>
            <p className="text-sm text-white/45">
              Turn compliance from an annual audit-prep scramble into continuous
              operational compliance.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-col gap-2 sm:items-end">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="font-mono text-xs text-white/35">© CompliFine</p>
      </Container>
    </footer>
  );
}
