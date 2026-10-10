import React, { useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import HowItWorks from "@/components/landing/HowItWorks";
import ProofStrip from "@/components/landing/ProofStrip";
import TrustPrinciples from "@/components/landing/TrustPrinciples";
import LandingFooter from "@/components/landing/LandingFooter";

// General About page (header "About"): how Kestrel works and why to trust it, reusing the welcome page's
// sections under the app header. The welcome page itself is the logo's destination.
export default function About() {
  useEffect(() => {
    const previous = document.title;
    document.title = "About | Kestrel";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-ew-paper font-body text-ew-ink">
      <AppHeader />
      <main id="main">
        <HowItWorks />
        <ProofStrip />
        <TrustPrinciples />
      </main>
      <LandingFooter />
    </div>
  );
}
