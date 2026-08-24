import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { MarketingDarkMode } from "@/components/marketing/dark-mode";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <MarketingDarkMode />
      {children}
      <SiteFooter />
    </div>
  );
}
