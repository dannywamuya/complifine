import type { ReactNode } from "react";
import { AppChrome } from "@/components/app-chrome";

export const metadata = { title: "App" };

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
