import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ConsoleChrome } from "@/components/console-chrome";
import { OnboardingProvider } from "@/components/onboarding-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

/** Must match `SIDEBAR_COOKIE_NAME` in `components/ui/sidebar.tsx`. */
const SIDEBAR_COOKIE_NAME = "sidebar_state";

export const metadata: Metadata = {
  title: {
    default: "CompliFine Console",
    template: "%s · Console",
  },
  description: "Ingest, review and publish the CompliFine knowledge base. Operator only.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111312",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const stored = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value;
  const defaultSidebarOpen = stored !== "false";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("overflow-x-hidden font-sans", geist.variable, geistMono.variable)}
    >
      <body className="flex min-h-svh flex-col overflow-x-hidden bg-background text-foreground antialiased">
        <ThemeProvider>
          <OnboardingProvider>
            <ConsoleChrome defaultSidebarOpen={defaultSidebarOpen}>{children}</ConsoleChrome>
          </OnboardingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
