import React from "react";
import { CircleCheck, UserRound } from "lucide-react";

// What testers said in our Sense AI user tests (quotes verbatim from the Sense results), each with what we
// changed because of it. Testers are labelled by test, not by job: Sense did not give their roles.

const TESTERS = {
  a: { label: "Tester 1 · idea interview", bg: "#e0f2fe", fg: "#0369a1" },
  b: { label: "Tester 2 · live app test", bg: "#f3e8ff", fg: "#7e22ce" },
};

export const VOICES = [
  {
    who: "a",
    quote: "It didn't cost me anything financially. It just cost me time.",
    change: "Screening runs before the loan, in minutes, not a week.",
  },
  {
    who: "a",
    quote: "I wish I woulda asked the cash flow documents a lot earlier in the process.",
    change: "The cash-flow statement is checked in the first screening, for other lenders and late payments.",
  },
  {
    who: "b",
    quote: "I don't think it defines what yet red, yellow, and green are…",
    change: "Each status shows the rule behind it, plus a 0 to 100 warning score.",
  },
  {
    who: "b",
    quote: "It cannot be used to fully rely on at this point in my opinion.",
    change: "AI only tags. Fixed rules set the status, and every flag shows its source, date and exact quote.",
  },
];

/** One tester's quote: avatar, speech bubble, and what we changed. */
export function VoiceCard({ voice }) {
  const t = TESTERS[voice.who];
  return (
    <figure className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: t.bg }}>
        <UserRound className="h-[18px] w-[18px]" style={{ color: t.fg }} />
      </span>
      <div className="min-w-0 flex-1">
        <figcaption className="text-[12px] font-medium text-ew-muted">{t.label}</figcaption>
        <blockquote className="mt-1 rounded-lg rounded-tl-sm border border-ew-rule bg-white px-4 py-3 text-[15px] leading-relaxed text-ew-ink">
          &ldquo;{voice.quote}&rdquo;
        </blockquote>
        <div className="mt-2 flex items-start gap-2 rounded-md border border-ew-rule bg-[#f8faf8] px-3 py-2">
          <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ew-green" />
          <p className="text-[13px] leading-snug text-ew-ink-soft">
            <span className="font-semibold text-ew-ink">How we solved it: </span>
            {voice.change}
          </p>
        </div>
      </div>
    </figure>
  );
}
