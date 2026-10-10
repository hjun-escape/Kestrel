import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import BrandMark from "@/components/auth/BrandMark";
import LandingCtas, { SIGN_IN_PATH } from "./LandingCtas";
import SignalFile from "./SignalFile";
import HeroBackdrop, { BACKDROP_OPTIONS } from "./HeroBackdrop";
import SourceTicker from "./SourceTicker";

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

// Background direction for the hero. ?hero=swarm|radar|streams|constellation picks one; while
// developing locally a small switcher shows all four (never on the published site).
const DEFAULT_BACKDROP = "swarm";

function BackdropSwitcher({ value, onChange }) {
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-sm border border-white/20 bg-ew-ink/90 p-1 text-[12px] text-white shadow-lg">
      <span className="px-2 text-white/60">Hero option (dev only)</span>
      {BACKDROP_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-sm px-2 py-1 font-semibold ${value === o.id ? "bg-white text-ew-ink" : "text-white/80 hover:bg-white/10"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function HeroSection() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("hero");
  const backdrop = BACKDROP_OPTIONS.some((o) => o.id === asked) ? asked : DEFAULT_BACKDROP;
  return (
    <div className={`relative overflow-hidden bg-ew-ink text-white ${LEDGER}`}>
      {/* Checks running in parallel behind the hero (decorative). */}
      <HeroBackdrop key={backdrop} variant={backdrop} className="absolute inset-0 h-full w-full" />
      {import.meta.env.DEV && (
        <BackdropSwitcher
          value={backdrop}
          onChange={(id) => {
            const next = new URLSearchParams(params);
            next.set("hero", id);
            setParams(next, { replace: true });
          }}
        />
      )}
      <section
        aria-labelledby="hero-heading"
        className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-4 pb-20 pt-10 sm:px-8 sm:pb-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pb-28 lg:pt-16"
      >
        <div data-swarm-clear>
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
          <SourceTicker className="mt-6" />
          <p className="mt-4 text-[13px] text-white/65">
            Built for bank credit officers. Sign-in is optional; the demo opens a sample loan book.
          </p>
        </div>
        <div data-swarm-clear>
          <SignalFile />
        </div>
      </section>
    </div>
  );
}
