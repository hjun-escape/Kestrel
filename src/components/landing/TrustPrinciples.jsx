import React from "react";
import { STATUS_STYLES } from "@/components/StatusBadge";

const RULES = [
  { key: "red", rule: "2 or more strong flags, or 1 strong and 2 weak" },
  { key: "yellow", rule: "1 strong flag, or 2 or more weak" },
  { key: "green", rule: "Anything less, in the last 90 days" },
];

function RuleBadge({ status }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex w-[5.5rem] shrink-0 items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[13px] font-semibold ${s.badge}`}
    >
      <span aria-hidden="true" className={`inline-block shrink-0 ${s.glyph}`} />
      {s.label}
    </span>
  );
}

function Receipt() {
  return (
    <div className="rounded-[3px] border border-ew-rule bg-white p-4 shadow-[0_14px_30px_-24px_rgba(20,32,46,0.6)]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-ew-muted">Flag</dt>
        <dd className="font-semibold text-ew-ink">CFO departure, strong</dd>
        <dt className="text-ew-muted">Date</dt>
        <dd className="text-ew-ink">Sep 10, 2026</dd>
        <dt className="text-ew-muted">Source</dt>
        <dd className="text-ew-ink underline decoration-ew-rule underline-offset-2">Electrek</dd>
        <dt className="text-ew-muted">Quote</dt>
        <dd className="text-ew-ink-soft">
          &ldquo;Chief financial officer Dana Whitlock has stepped down, effective immediately.&rdquo;
        </dd>
      </dl>
    </div>
  );
}

export default function TrustPrinciples() {
  return (
    <section aria-labelledby="trust-heading" className="bg-ew-paper py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <h2 id="trust-heading" className="sr-only">
          How Kestrel earns trust
        </h2>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          <article>
            <h3 className="font-heading text-[clamp(2.4rem,1.5rem+3.6vw,4.4rem)] font-bold leading-[0.98] tracking-[-0.02em] text-ew-ink [font-stretch:74%]">
              AI reads. Rules decide. You approve.
            </h3>
            <p className="mt-6 max-w-[36rem] text-[17px] leading-relaxed text-ew-ink-soft">
              The model only reads articles and reviews and copies the exact sentence that matters. Plain, fixed rules
              turn flags into a status. A credit officer makes the call.
            </p>
            <ul className="mt-8 max-w-[36rem] divide-y divide-ew-rule border-y border-ew-rule">
              {RULES.map(({ key, rule }) => (
                <li key={key} className="flex items-center gap-4 py-3 text-[15px] text-ew-ink">
                  <RuleBadge status={key} />
                  {rule}
                </li>
              ))}
            </ul>
          </article>

          <div className="space-y-12 lg:pt-3">
            <article>
              <h3 className="text-[20px] font-semibold leading-snug text-ew-ink">Every flag has a receipt</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ew-ink-soft">
                Source, date, link and the exact quote, so you can check it before you act on it.
              </p>
              <div className="mt-5" aria-hidden="true">
                <Receipt />
              </div>
            </article>
            <article className="border-t border-ew-rule pt-8">
              <h3 className="text-[20px] font-semibold leading-snug text-ew-ink">
                Built for private companies with no analyst coverage
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ew-ink-soft">
                Mid-size private borrowers report quarterly, 45 to 90 days after quarter end. Departures, layoffs,
                lawsuits and missed payments show up in public well before that.
              </p>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
