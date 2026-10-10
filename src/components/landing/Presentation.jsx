import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { Frame, MATTE, SURFACE_A, SectionHeader } from "./Frame";
import { CheckDemo, DecideDemo, LeadTimeline, RaceBars, ScreenDemo } from "./showScenes";
import { prefersReducedMotion } from "./motion";
import HowItWorks from "./HowItWorks";
import ProofStrip from "./ProofStrip";
import TrustPrinciples from "./TrustPrinciples";
import WhiteSheet from "./WhiteSheet";

// Below the hero, as a presentation. A white sheet rises out of the dark hero and widens to fill the screen,
// then stays pinned while scrolling steps through slides: each step moves the current slide's pieces out to the
// left and brings the next slide's pieces in from the right. After the last slide the sheet narrows back into a
// rounded card and reveals the dark footer.
// Phones, short screens and reduced motion get the same content as ordinary stacked sections instead.

const SlideState = createContext({ state: "active" });

const OFF = {
  before: "translate3d(80px, 0, 0)",
  after: "translate3d(-80px, 0, 0)",
};

/** One piece of a slide. Pieces of the active slide arrive in order (`i`), staggered. */
function Piece({ i = 0, className = "", children }) {
  const { state } = useContext(SlideState);
  const active = state === "active";
  return (
    <div
      className={className}
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "none" : OFF[state],
        transition: `opacity 450ms ease-out ${active ? i * 110 : 0}ms, transform 650ms cubic-bezier(.2,.8,.2,1) ${active ? i * 110 : 0}ms`,
        pointerEvents: active ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}

/** 0..1 over `ms` once `active` turns on; back to 0 when it turns off. */
function useActivation(active, ms) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!active) {
      setP(0);
      return undefined;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      setP(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, ms]);
  return p;
}

// ------------------------------------------------------------------ slides
function SlideIntro() {
  return (
    <div className="w-full">
      <Piece i={0}>
        <SectionHeader kicker="How a check runs" title="One applicant, end to end." id="how-heading" />
      </Piece>
      <Piece i={1} className="mt-10 rounded-sm border border-ew-rule bg-white px-6 py-8 shadow-[0_14px_40px_-30px_rgba(20,32,46,0.45)]">
        <RaceBars />
      </Piece>
    </div>
  );
}

function SlideSteps() {
  const { state } = useContext(SlideState);
  return (
    <Piece i={0} className="w-full">
      <Frame
        columns={[
          { title: "Screen", caption: "Name, website, city", accent: "#0284c7", body: <StepPiece i={1} state={state}><ScreenDemo /></StepPiece> },
          { title: "Check", caption: "Five sources, read in parallel", accent: "#9333ea", body: <StepPiece i={2} state={state}><CheckDemo /></StepPiece> },
          { title: "Decide", caption: "Fixed rules set the status. You make the call.", accent: "#0d9488", body: <StepPiece i={3} state={state}><DecideDemo /></StepPiece> },
        ]}
        footer="SAMPLE RUN · Northfield Battery Works · 63 items read · 3 verified · Red 95 · 1m 52s · AI never sets a status · every quote checked word for word"
      />
    </Piece>
  );
}

/** The three step demos drop in one after another once the frame is in place. */
function StepPiece({ i, state, children }) {
  const active = state === "active";
  return (
    <div
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "none" : "translate3d(0, 24px, 0)",
        transition: `opacity 450ms ease-out ${active ? 200 + i * 160 : 0}ms, transform 600ms cubic-bezier(.2,.8,.2,1) ${active ? 200 + i * 160 : 0}ms`,
      }}
    >
      {children}
    </div>
  );
}

function SlideQuote() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <Piece i={0}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ew-muted">What we heard</h2>
      </Piece>
      <figure className="mt-4 flex items-start gap-3">
        <Piece i={1} className="mt-1 shrink-0">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e0f2fe]">
            <UserRound className="h-[18px] w-[18px] text-[#0369a1]" />
          </span>
        </Piece>
        <div className="min-w-0">
          <Piece i={2}>
            <blockquote className="rounded-lg rounded-tl-sm border border-ew-rule bg-white px-4 py-3 text-[15.5px] leading-relaxed">
              &ldquo;I wish I woulda asked the cash flow documents a lot earlier in the process.&rdquo;
            </blockquote>
          </Piece>
          <Piece i={3}>
            <figcaption className="mt-2 text-[13px] text-ew-muted">
              Credit officer, user interview · <span className="text-ew-ink-soft">so cash flow is now part of the first screening.</span>
            </figcaption>
          </Piece>
        </div>
      </figure>
    </div>
  );
}

function SlideLead() {
  const { state } = useContext(SlideState);
  const progress = useActivation(state === "active", 3200);
  return (
    <div className="w-full">
      <Piece i={0}>
        <SectionHeader kicker="Lead time" title="Flags land before the quarterly financials." id="lead-heading" />
      </Piece>
      <Piece i={1} className="mt-8 rounded-sm border border-ew-rule bg-white shadow-[0_14px_40px_-30px_rgba(20,32,46,0.45)]">
        <div className="border-b border-ew-rule px-5 pb-3 pt-4">
          <h3 className="font-heading text-[17px] font-bold leading-tight">Northfield Battery Works</h3>
          <p className="text-[12.5px] text-ew-muted">Sample applicant, Jul to Nov 2026</p>
        </div>
        <div className="px-8 pb-6 pt-6">
          <LeadTimeline progress={progress} />
        </div>
        <p className="truncate border-t border-ew-rule bg-white px-5 py-2.5 font-mono text-[11.5px] text-ew-ink-soft">
          Private companies report 45 to 90 days after quarter end · public signals show up first
        </p>
      </Piece>
    </div>
  );
}

const SLIDES = [SlideIntro, SlideSteps, SlideQuote, SlideLead];
const MAX_INSET = 7; // % trimmed from each side while the sheet opens and closes
const MAX_RADIUS = 40;
const CLOSE = 0.12; // share of the pinned scroll spent closing the sheet at the end
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (t) => Math.min(1, Math.max(0, t));

function usePresentationMode() {
  const check = () =>
    typeof window !== "undefined" && !prefersReducedMotion() && window.innerWidth >= 1024 && window.innerHeight >= 640;
  const [on, setOn] = useState(check);
  useEffect(() => {
    const onResize = () => setOn(check());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return on;
}

export default function Presentation() {
  const on = usePresentationMode();
  const outerRef = useRef(null);
  const sheetRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!on) return undefined;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const outer = outerRef.current;
      const sheet = sheetRef.current;
      if (!outer || !sheet) return;
      const r = outer.getBoundingClientRect();
      const vh = window.innerHeight;
      const open = ease(clamp((vh - r.top) / vh)); // widens as it rises to the top of the screen
      const t = clamp(-r.top / (outer.offsetHeight - vh)); // 0..1 while pinned
      const close = ease(clamp((t - (1 - CLOSE)) / CLOSE));
      const k = Math.max(1 - open, close);
      sheet.style.clipPath = `inset(0 ${(MAX_INSET * k).toFixed(2)}% round ${(MAX_RADIUS * k).toFixed(1)}px)`;
      const slideT = clamp(t / (1 - CLOSE));
      setIndex(Math.min(SLIDES.length - 1, Math.floor(slideT * SLIDES.length)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [on]);

  if (!on) {
    return (
      <WhiteSheet>
        <HowItWorks />
        <ProofStrip />
        <TrustPrinciples />
      </WhiteSheet>
    );
  }

  return (
    // Tall scroll track; the sheet stays pinned to the screen while you scroll through it.
    <div ref={outerRef} className="relative" style={{ height: `${SLIDES.length * 85 + 60}vh`, background: SURFACE_A }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <section
          ref={sheetRef}
          aria-label="How Kestrel works"
          data-ascii-surface
          className="absolute inset-0 text-ew-ink"
          style={{ background: MATTE, clipPath: `inset(0 ${MAX_INSET}% round ${MAX_RADIUS}px)` }}
        >
          {SLIDES.map((Slide, i) => (
            <SlideState.Provider key={i} value={{ state: i === index ? "active" : i < index ? "after" : "before" }}>
              <div aria-hidden={i !== index} className="absolute inset-0 flex items-center">
                <div data-ascii-clear={i === index ? "" : undefined} className="mx-auto w-full max-w-[1200px] px-8">
                  <Slide />
                </div>
              </div>
            </SlideState.Provider>
          ))}
          {/* Progress dots. */}
          <ol aria-hidden="true" className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
            {SLIDES.map((_, i) => (
              <li key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-ew-ink" : "w-1.5 bg-[#14202e]/25"}`} />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
