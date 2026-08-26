import { Hero } from "@/components/marketing/hero";
import { LandingPage } from "@/components/marketing/landing";

export const metadata = {
  title: "Save time and cost on horticulture compliance",
  description:
    "The first Intelligent Compliance OS for horticulture in Kenya. AI cites GLOBALG.A.P. IFA v6 and SMETA 7.0 — so you spend less time re-reading the PDF.",
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <LandingPage />
    </>
  );
}
