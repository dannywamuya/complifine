import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark flex min-h-0 flex-1 flex-col bg-background text-foreground">
      {children}
      <SiteFooter />
    </div>
  );
}
