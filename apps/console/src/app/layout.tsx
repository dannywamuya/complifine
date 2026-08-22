import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConsoleChrome } from "@/components/console-chrome";
import { OnboardingProvider } from "@/components/onboarding-provider";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    default: "CompliFine Console",
    template: "%s · Console",
  },
  description: "Ingest, review and publish the CompliFine knowledge base. Operator only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("dark overflow-x-hidden font-sans", geist.variable, geistMono.variable)}>
      <body className="min-h-svh overflow-x-hidden antialiased">
        <OnboardingProvider>
          <ConsoleChrome>{children}</ConsoleChrome>
        </OnboardingProvider>
      </body>
    </html>
  );
}
