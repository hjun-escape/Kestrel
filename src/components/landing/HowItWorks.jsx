import React, { useLayoutEffect, useRef } from "react";
import { createScope, createTimeline, stagger, utils } from "animejs";
import { ChecksIllustration, DecideIllustration, ScreenIllustration } from "./StepIllustrations";
import { DISTANCE, DURATION, EASE, REVEAL_ROOT_MARGIN, prefersReducedMotion } from "./motion";

const STEPS = [
  {
    title: "Screen an applicant",
    body: "Enter the company name and website. It works for private companies with no analyst coverage and no public filings.",
    Illustration: ScreenIllustration,
  },
  {
    title: "We check the public record and their cash flow",
    body: "News, legal records and WARN notices, hiring, and employee reviews, plus the applicant's own cash-flow statement for other lenders and late payments.",
    Illustration: ChecksIllustration,
  },
  {
    title: "You decide, with every flag sourced",
    body: "Each flag shows the source, the date and the exact quote. Fixed rules set the status. The credit decision stays with you.",
    Illustration: DecideIllustration,
  },
];

// From-state and entrance for each kind of illustration part.
const PARTS = {
  slide: { from: { opacity: 0, x: -DISTANCE.sm }, to: { opacity: [0, 1], x: [-DISTANCE.sm, 0], delay: stagger(140) } },
  caret: { from: { opacity: 0 }, to: { opacity: [0, 1], duration: DURATION.fast } },
  press: { from: { opacity: 0, scale: 0.92 }, to: { opacity: [0, 1], scale: [0.92, 1], ease: "outBack" } },
  row: { from: { opacity: 0, x: -DISTANCE.sm }, to: { opacity: [0, 1], x: [-DISTANCE.sm, 0], delay: stagger(110) } },
  highlight: { from: { scaleX: 0 }, to: { scaleX: [0, 1], duration: DURATION.slow, ease: EASE.settle } },
  choice: { from: { opacity: 0, y: DISTANCE.sm }, to: { opacity: [0, 1], y: [DISTANCE.sm, 0], delay: stagger(80) } },
};

// Rewinds one step's illustration and returns a paused timeline that plays it.
function buildStepReveal(stepEl) {
  const tl = createTimeline({ defaults: { duration: DURATION.normal, ease: EASE.enter }, autoplay: false });
  let at = 0;
  Object.entries(PARTS).forEach(([kind, { from, to }]) => {
    const els = stepEl.querySelectorAll(`[data-step-part="${kind}"]`);
    if (!els.length) return;
    utils.set(els, from);
    tl.add(els, to, at);
    at += 160;
  });
  return tl;
}

// Plays each step once, the first time it scrolls into view. An
// IntersectionObserver (not a scroll-synced observer) so a fast scroll past
// never leaves a reveal paused halfway.
function useStepReveals(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (prefersReducedMotion() || !root || typeof IntersectionObserver === "undefined") return undefined;
    const reveals = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          reveals.get(entry.target)?.play();
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: REVEAL_ROOT_MARGIN },
    );
    const scope = createScope({ root }).add(() => {
      root.querySelectorAll("[data-step]").forEach((stepEl) => {
        reveals.set(stepEl, buildStepReveal(stepEl));
        observer.observe(stepEl);
      });
    });
    return () => {
      observer.disconnect();
      scope.revert();
    };
  }, [rootRef]);
}

export default function HowItWorks() {
  const rootRef = useRef(null);
  useStepReveals(rootRef);

  return (
    <section aria-labelledby="how-heading" className="bg-ew-paper py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <div className="max-w-2xl">
          <h2
            id="how-heading"
            className="font-heading text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] font-bold leading-[1.02] tracking-[-0.02em] text-ew-ink [font-stretch:78%]"
          >
            A screening takes minutes, not a week of reading.
          </h2>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ew-ink-soft">
            The same checks run before the bank lends and keep running after the loan closes.
          </p>
        </div>

        <ol ref={rootRef} className="mt-14 grid gap-14 lg:grid-cols-3 lg:gap-10">
          {STEPS.map(({ title, body, Illustration }, i) => (
            <li key={title} data-step className="md:grid md:grid-cols-2 md:gap-x-10 lg:flex lg:flex-col">
              <div className="md:col-start-1">
                <div className="flex items-center gap-3 border-t-2 border-ew-ink pt-3">
                  <span
                    aria-hidden="true"
                    className="font-heading text-[28px] font-bold leading-none text-ew-ink tnum [font-stretch:75%]"
                  >
                    {i + 1}
                  </span>
                  <h3 className="text-[17px] font-semibold leading-snug text-ew-ink">
                    <span className="sr-only">Step {i + 1}: </span>
                    {title}
                  </h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-ew-ink-soft">{body}</p>
              </div>
              <div className="mt-6 min-h-[188px] md:col-start-2 md:row-start-1 md:mt-0 lg:mt-6" aria-hidden="true">
                <Illustration />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
