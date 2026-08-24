import type { ReactNode } from "react";

export const metadata = {
  title: "Book a demo",
  description:
    "Book a CompliFine walkthrough for Kenyan horticultural exporters preparing for GLOBALG.A.P. and SMETA.",
};

export default function DemoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
