import { Hero } from "@/components/marketing/hero";
import { LandingPage } from "@/components/marketing/landing";

export const metadata = {
  title: "Compliance for Kenyan horticultural exporters",
  description:
    "Know what GLOBALG.A.P. IFA v6 and SMETA 7 actually require at your sites — with citations, not guesses.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <LandingPage />
    </>
  );
}
