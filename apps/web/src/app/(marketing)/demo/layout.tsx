import type { ReactNode } from "react";

export const metadata = {
  title: "Book a demo",
  description:
    "Book a CompliFine walkthrough if you are preparing for GLOBALG.A.P. and SMETA.",
};

export default function DemoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
