import React from "react";
import { CheckDemo, DecideDemo, RaceBars, ScreenDemo } from "./showScenes";

// How it works, shown rather than told: a race against manual review, then three live mini-demos.
const STEPS = [
  { title: "Screen", caption: "Name and website. That's it.", Demo: ScreenDemo, accent: "#38bdf8" },
  { title: "Check", caption: "Five sources, in parallel.", Demo: CheckDemo, accent: "#c084fc" },
  { title: "Decide", caption: "Every flag sourced. You call it.", Demo: DecideDemo, accent: "#2dd4bf" },
];

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="border-t border-white/10 bg-ew-ink py-20 text-white sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <h2
            id="how-heading"
            className="font-heading text-[clamp(2.4rem,1.6rem+3.2vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.02em] [font-stretch:76%]"
          >
            Minutes, not a week.
          </h2>
          <RaceBars />
        </div>

        <ol className="mt-16 grid gap-6 lg:grid-cols-3">
          {STEPS.map(({ title, caption, Demo, accent }, i) => (
            <li key={title} className="flex flex-col">
              <div className="mb-4 flex items-baseline gap-3">
                <span aria-hidden="true" className="font-heading text-[15px] font-bold tnum" style={{ color: accent }}>
                  0{i + 1}
                </span>
                <h3 className="font-heading text-[26px] font-bold leading-none">{title}</h3>
                <p className="text-[14px] text-white/60">{caption}</p>
              </div>
              <div className="flex-1" style={{ borderTop: `3px solid ${accent}` }}>
                <Demo />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
