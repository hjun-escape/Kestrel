import React from "react";

// Small illustrations for the three steps. Each renders its final state;
// HowItWorks rewinds and plays them once when scrolled into view.
// Elements marked data-step-part are what the reveal animates.

const SURFACE =
  "h-full rounded-[3px] border border-ew-rule bg-white p-4 shadow-[0_10px_24px_-20px_rgba(20,32,46,0.55)]";

export function ScreenIllustration() {
  return (
    <div className={SURFACE}>
      <p className="text-[12px] font-semibold text-ew-ink-soft">Screen new applicant</p>
      <div className="mt-2.5 rounded-[2px] border border-ew-rule bg-ew-hover px-2.5 py-2 text-[13px] text-ew-ink">
        <span data-step-part="slide">Northfield Battery Works</span>
        <span data-step-part="caret" className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-ew-ink" />
      </div>
      <div className="mt-1.5 rounded-[2px] border border-ew-rule bg-ew-hover px-2.5 py-2 text-[13px] text-ew-muted">
        <span data-step-part="slide">northfieldbattery.com</span>
      </div>
      <span
        data-step-part="press"
        className="mt-3 inline-flex h-8 items-center rounded-[3px] bg-ew-ink px-3 text-[12px] font-semibold text-white"
      >
        Screen applicant
      </span>
    </div>
  );
}

const CHECKS = [
  { label: "News", result: "1 flag" },
  { label: "Legal records and WARN notices", result: "1 flag" },
  { label: "Hiring", result: "Clear" },
  { label: "Employee reviews", result: "Clear" },
  { label: "Cash-flow statement", result: "1 flag" },
];

export function ChecksIllustration() {
  return (
    <ul className={`${SURFACE} space-y-1.5 py-3`}>
      {CHECKS.map((c) => (
        <li
          key={c.label}
          data-step-part="row"
          className="flex items-center justify-between gap-3 border-b border-ew-rule-soft pb-1.5 text-[13px] last:border-0 last:pb-0"
        >
          <span className="flex min-w-0 items-center gap-2 text-ew-ink">
            <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-ew-ink" aria-hidden="true">
              <path
                d="M2 6.5l2.5 2.5L10 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="truncate">{c.label}</span>
          </span>
          <span
            className={`shrink-0 text-[12px] ${c.result === "Clear" ? "text-ew-muted" : "font-semibold text-ew-ink"}`}
          >
            {c.result}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DecideIllustration() {
  return (
    <div className={SURFACE}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-ew-ink">WARN notice, 125 jobs</p>
        <p className="text-[12px] text-ew-muted">State WARN notice</p>
      </div>
      <p className="relative mt-1.5 text-[13px] leading-snug text-ew-ink-soft">
        <span
          data-step-part="highlight"
          aria-hidden="true"
          className="absolute inset-y-0 -left-1 -right-1 origin-left rounded-[2px] bg-[#e1e8f8]"
        />
        <span className="relative">&ldquo;Number of employees affected: 125.&rdquo;</span>
      </p>
      <p className="mt-1 text-[12px] text-ew-ink-soft underline decoration-ew-rule underline-offset-2">Open source</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Approve", "Request documents", "Decline"].map((label) => (
          <span
            key={label}
            data-step-part="choice"
            className="inline-flex h-7 items-center rounded-[3px] border border-ew-rule px-2 text-[11.5px] font-semibold text-ew-ink"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
