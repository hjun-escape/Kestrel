import React from "react";
import { ChecksIllustration, DecideIllustration, ScreenIllustration } from "./StepIllustrations";

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

// Step accents, matching the hero pipeline's source colours (red/amber/green stay reserved for status).
const ACCENTS = ["#38bdf8", "#c084fc", "#2dd4bf"];

// Static by design: the illustrations render their final state, no scroll-in animation.
export default function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="border-t border-white/10 bg-ew-ink py-20 text-white sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <div className="max-w-3xl">
          <h2
            id="how-heading"
            className="font-heading text-[clamp(2.2rem,1.5rem+2.8vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.02em] text-white [font-stretch:78%]"
          >
            A screening takes minutes, not a week of reading.
          </h2>
          <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-white/80">
            The same checks run before the bank lends and keep running after the loan closes.
          </p>
        </div>

        <ol className="mt-14 grid gap-6 lg:grid-cols-3">
          {STEPS.map(({ title, body, Illustration }, i) => (
            <li
              key={title}
              className="flex flex-col rounded-sm border border-white/12 bg-white/[0.05] p-6"
              style={{ borderTop: `3px solid ${ACCENTS[i]}` }}
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm font-heading text-[24px] font-bold leading-none text-ew-ink tnum [font-stretch:75%]"
                  style={{ background: ACCENTS[i] }}
                >
                  {i + 1}
                </span>
                <h3 className="pt-1 text-[19px] font-semibold leading-snug text-white">
                  <span className="sr-only">Step {i + 1}: </span>
                  {title}
                </h3>
              </div>
              <p className="mt-4 text-[15.5px] leading-relaxed text-white/80">{body}</p>
              <div className="mt-6 flex-1" aria-hidden="true">
                <Illustration />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
