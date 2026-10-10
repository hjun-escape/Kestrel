import React from "react";
import { Link } from "react-router-dom";
import BrandMark from "@/components/auth/BrandMark";
import LandingCtas, { SIGN_IN_PATH } from "./LandingCtas";
import SignalFile from "./SignalFile";

// Faint ledger ruling behind the hero: the paper a credit file is kept on.
const LEDGER =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(255,255,255,0.045)_31px,rgba(255,255,255,0.045)_32px)]";

export function LandingNav() {
  return (
    <div className={`bg-ew-ink text-white ${LEDGER}`}>
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-8">
        <Link to="/welcome" className="flex items-center gap-2.5 rounded-sm focus-visible:outline-white">
          <BrandMark className="h-6 w-6 text-white" />
          <span className="font-heading text-[16px] font-bold tracking-tight">Early Warning</span>
        </Link>
        <Link
          to={SIGN_IN_PATH}
          className="rounded-sm px-1 text-[14px] font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline focus-visible:outline-white"
        >
          Sign in
        </Link>
      </header>
    </div>
  );
}

export default function HeroSection() {
  return (
    <div className={`relative overflow-hidden bg-ew-ink text-white ${LEDGER}`}>
      <section
        aria-labelledby="hero-heading"
        className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 pb-20 pt-10 sm:px-8 sm:pb-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pb-28 lg:pt-16"
      >
        <div>
          <h1
            id="hero-heading"
            className="font-heading text-[clamp(2.9rem,1.7rem+5vw,5.4rem)] font-bold leading-[0.93] tracking-[-0.025em] [font-stretch:72%] [text-wrap:balance]"
          >
            See the trouble before you lend.
          </h1>
          <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-white/80 sm:text-[19px]">
            Early Warning screens private companies in minutes: public warning signs, other lenders, late payments,
            every flag with a source.
          </p>
          <LandingCtas tone="dark" className="mt-9" />
          <p className="mt-4 text-[13px] text-white/65">
            Built for bank credit officers. Sign-in is optional; the demo opens a sample loan book.
          </p>
        </div>
        <SignalFile />
      </section>
    </div>
  );
}
