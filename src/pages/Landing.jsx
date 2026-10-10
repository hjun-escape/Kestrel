import React, { useEffect } from "react";
import HeroSection, { LandingNav } from "@/components/landing/HeroSection";
import HowItWorks from "@/components/landing/HowItWorks";
import ProofStrip from "@/components/landing/ProofStrip";
import TrustPrinciples from "@/components/landing/TrustPrinciples";
import LandingFooter from "@/components/landing/LandingFooter";

// Public welcome page at /welcome. Lazy-loaded from App.jsx so animejs stays
// out of the main bundle.
export default function Landing() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Kestrel: screen private companies before you lend";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-ew-paper font-body text-ew-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ew-ink"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <HeroSection />
        <HowItWorks />
        <ProofStrip />
        <TrustPrinciples />
      </main>
      <LandingFooter />
    </div>
  );
}
