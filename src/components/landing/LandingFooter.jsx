import React from "react";
import BrandMark from "@/components/auth/BrandMark";
import LandingCtas from "./LandingCtas";

export default function LandingFooter() {
  return (
    <footer className="bg-ew-ink text-white">
      <section
        aria-labelledby="footer-cta-heading"
        className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 sm:py-24 lg:flex lg:items-end lg:justify-between lg:gap-12"
      >
        <h2
          id="footer-cta-heading"
          className="max-w-[18ch] font-heading text-[clamp(2.2rem,1.4rem+3.2vw,3.9rem)] font-bold leading-[0.98] tracking-[-0.02em] [font-stretch:74%]"
        >
          Screen your next applicant before the term sheet.
        </h2>
        <LandingCtas tone="dark" className="mt-9 lg:mt-0 lg:shrink-0" />
      </section>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-6 text-[13px] text-white/65 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="flex items-center gap-2">
            <BrandMark className="h-4 w-4 text-white/80" />
            Kestrel, for bank credit and risk teams
          </span>
          <span>Hackathon prototype. The demo uses sample companies.</span>
        </div>
      </div>
    </footer>
  );
}
