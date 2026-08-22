import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteHeader } from "@/components/site-header";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "CompliFine",
    template: "%s · CompliFine",
  },
  description:
    "Know what GLOBALG.A.P. IFA v6 and SMETA 7 require on your farm. Answers cite the published standard.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("overflow-x-hidden font-sans", geist.variable, geistMono.variable)}>
      <body className="flex min-h-svh flex-col overflow-x-hidden antialiased">
        <TooltipProvider>
          <SiteHeader />
          <main className="min-w-0 w-full flex-1 overflow-x-hidden">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
