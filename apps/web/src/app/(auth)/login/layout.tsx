import type { ReactNode } from "react";

export const metadata = {
  title: "Sign in",
  description: "Producer accounts use this app.",
};

export default function LoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
