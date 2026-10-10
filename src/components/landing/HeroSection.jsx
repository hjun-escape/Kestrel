import React from "react";
import { Link } from "react-router-dom";
import BrandMark from "@/components/auth/BrandMark";
import { ExploreDemoLink, SIGN_IN_PATH } from "./LandingCtas";
import { PipelineHero } from "./PipelineHero";

// Faint ledger ruling behind the nav: the paper a credit file is kept on.
const LEDGER =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(255,255,255,0.045)_31px,rgba(255,255,255,0.045)_32px)]";

export function LandingNav() {
  return (
    <div className={`bg-ew-ink text-white ${LEDGER}`}>
      <header className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-8">
        <Link to="/welcome" className="flex items-center gap-2.5 rounded-sm focus-visible:outline-white">
          <BrandMark className="h-6 w-6 text-white" />
          <span className="font-heading text-[16px] font-bold tracking-tight">Kestrel</span>
        </Link>
        <nav aria-label="Get started" className="flex items-center gap-4">
          <ExploreDemoLink className="inline-flex h-9 items-center rounded-[3px] border border-white/45 px-3.5 text-[14px] font-semibold text-white hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white" />
          <Link
            to={SIGN_IN_PATH}
            className="rounded-sm px-1 text-[14px] font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline focus-visible:outline-white"
          >
            Sign in
          </Link>
        </nav>
      </header>
    </div>
  );
}

// The hero: the Pipeline cellular automaton (PipelineHero.jsx). The previous hero (SignalFile) is no longer used.
export default function HeroSection() {
  return <PipelineHero />;
}
