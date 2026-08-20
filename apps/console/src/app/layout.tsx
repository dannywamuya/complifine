import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "CompliFine Console",
    template: "%s · Console",
  },
  description: "Ingest, review and publish the GLOBALG.A.P. IFA v6 knowledge base.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark overflow-x-hidden font-sans", geist.variable, geistMono.variable)}>
      <body className="min-h-svh overflow-x-hidden antialiased">
        <TooltipProvider>
          <SidebarProvider className="min-h-svh overflow-x-hidden">
            <AppSidebar />
            <SidebarInset className="min-h-svh min-w-0 overflow-x-hidden">
              <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <SidebarTrigger />
                <span className="truncate text-sm text-muted-foreground md:hidden">CompliFine</span>
              </header>
              <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-6">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
