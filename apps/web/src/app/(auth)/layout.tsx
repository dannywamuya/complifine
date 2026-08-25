import type { ReactNode } from "react";
import { AuthLightMode } from "@/components/marketing/auth-light-mode";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <AuthLightMode />
      {children}
    </div>
  );
}
