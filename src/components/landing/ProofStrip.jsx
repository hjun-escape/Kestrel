import React from "react";

export default function ProofStrip() {
  return (
    <section aria-labelledby="proof-heading" className="border-y border-ew-rule bg-white py-20 sm:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 sm:px-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-16">
        <h2 id="proof-heading" className="text-[15px] font-semibold text-ew-ink-soft lg:pt-3">
          What we heard
        </h2>
        <figure>
          <blockquote className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-1 -top-12 font-heading text-[96px] font-bold leading-none text-ew-rule lg:-left-12 lg:-top-6"
            >
              &ldquo;
            </span>
            <p className="relative max-w-[22ch] font-heading text-[clamp(1.9rem,1.2rem+2.8vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.015em] text-ew-ink [font-stretch:85%]">
              I wish I woulda asked the cash flow documents a lot earlier in the process.
            </p>
          </blockquote>
          <figcaption className="mt-6 text-[15px] text-ew-muted">Credit officer, user interview</figcaption>
          <p className="mt-8 max-w-xl border-t border-ew-rule-soft pt-5 text-[15px] leading-relaxed text-ew-ink-soft">
            So the cash-flow check is part of the first screening: other lenders and late payments show up next to the
            public signals, before the term sheet.
          </p>
        </figure>
      </div>
    </section>
  );
}
