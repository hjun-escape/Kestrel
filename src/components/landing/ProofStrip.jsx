import React from "react";

// The user quote that shaped the product, as a bold band between the dark sections.
export default function ProofStrip() {
  return (
    <section aria-labelledby="proof-heading" className="border-y border-white/10 bg-[#0f1a27] py-20 text-white sm:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 sm:px-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-16">
        <h2 id="proof-heading" className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#38bdf8] lg:pt-4">
          What we heard
        </h2>
        <figure className="border-l-4 border-[#38bdf8] pl-6 sm:pl-10">
          <blockquote className="relative">
            <span aria-hidden="true" className="block font-heading text-[88px] font-bold leading-[0.6] text-[#38bdf8]">
              &ldquo;
            </span>
            <p className="relative mt-2 max-w-[24ch] font-heading text-[clamp(2rem,1.3rem+3vw,3.75rem)] font-semibold leading-[1.06] tracking-[-0.015em] text-white [font-stretch:85%]">
              I wish I woulda asked the cash flow documents a lot earlier in the process.
            </p>
          </blockquote>
          <figcaption className="mt-6 text-[15px] font-medium text-white/70">Credit officer, user interview</figcaption>
          <p className="mt-8 max-w-xl border-t border-white/15 pt-5 text-[16px] leading-relaxed text-white/85">
            So the cash-flow check is part of the first screening: other lenders and late payments show up next to the
            public signals, before the term sheet.
          </p>
        </figure>
      </div>
    </section>
  );
}
