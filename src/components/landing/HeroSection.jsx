import React from "react";
import { Link } from "react-router-dom";
import BrandMark from "@/components/auth/BrandMark";
import UserMenu from "@/components/auth/UserMenu";
import { useAuth } from "@/lib/AuthContext";
import { ExploreDemoLink, SIGN_IN_PATH } from "./LandingCtas";
import { PipelineHero } from "./PipelineHero";

export function LandingNav() {
  const { isAuthenticated } = useAuth();
  return (
    // Transparent and aligned with the hero (same width and padding): the hero's dark background and
    // character field run up behind it, so nav and hero read as one surface.
    <div className="relative z-10 text-white">
      <header className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
        <Link to="/welcome" className="flex items-center gap-2.5 rounded-sm focus-visible:outline-white">
          <BrandMark className="h-6 w-6 text-white" />
          <span className="font-heading text-[16px] font-bold tracking-tight">Kestrel</span>
        </Link>
        <nav aria-label="Get started" className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Link
                to="/"
                className="inline-flex h-9 items-center rounded-[3px] border border-white/45 px-3.5 text-[14px] font-semibold text-white hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white"
              >
                Open loan book
              </Link>
              <UserMenu tone="dark" />
            </>
          ) : (
            <>
              <ExploreDemoLink className="inline-flex h-9 items-center rounded-[3px] border border-white/45 px-3.5 text-[14px] font-semibold text-white hover:border-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white" />
              <Link
                to={SIGN_IN_PATH}
                className="rounded-sm px-1 text-[14px] font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline focus-visible:outline-white"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>
      </header>
    </div>
  );
}

// The hero: the Pipeline cellular automaton (PipelineHero.jsx). The previous hero (SignalFile) is no longer used.
export default function HeroSection() {
  return <PipelineHero />;
}
