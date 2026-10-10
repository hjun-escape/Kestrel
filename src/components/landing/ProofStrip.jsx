import React from "react";
import { UserRound } from "lucide-react";
import { matte } from "./Frame";
import { Reveal } from "./reveal";
import SenseCredit from "./SenseCredit";

// The user quote that shaped the product: a person, their words, and what we changed. Plain and small.
// The pieces slide in from different sides as it scrolls into view.
export default function ProofStrip() {
  return (
    <section aria-labelledby="proof-heading" className="overflow-hidden py-12 text-ew-ink" style={matte}>
      <div className="mx-auto max-w-[720px] px-4 sm:px-8">
        <Reveal from="left">
          <h2 id="proof-heading" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ew-muted">
            What we heard
          </h2>
        </Reveal>
        <figure className="mt-4 flex items-start gap-3">
          <Reveal from="left" delay={120} className="mt-1 shrink-0">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e0f2fe]">
              <UserRound className="h-[18px] w-[18px] text-[#0369a1]" />
            </span>
          </Reveal>
          <div className="min-w-0">
            <Reveal from="right" delay={240}>
              <blockquote className="rounded-lg rounded-tl-sm border border-ew-rule bg-white px-4 py-3 text-[15.5px] leading-relaxed">
                &ldquo;I wish I woulda asked the cash flow documents a lot earlier in the process.&rdquo;
              </blockquote>
            </Reveal>
            <Reveal from="up" delay={420}>
              <figcaption className="mt-2 text-[13px] text-ew-muted">
                Credit officer, user interview · <span className="text-ew-ink-soft">so cash flow is now part of the first screening.</span>
              </figcaption>
            </Reveal>
            <Reveal from="up" delay={560}>
              <SenseCredit className="mt-3" />
            </Reveal>
          </div>
        </figure>
      </div>
    </section>
  );
}
