import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, MousePointer2 } from "lucide-react";
import { prefersReducedMotion } from "./motion";

// Small looping demos for the landing sections: show the product working instead of describing it.
// Each loops only while on screen; visitors who ask for reduced motion see the final frame.

/**
 * Steps 0..count-1, advancing every `ms` while the element is in view, then starting over (or, with `once`,
 * stopping on the last step). Reduced motion: stays on the last step.
 */
export function useLoop(count, ms, { once = false } = {}) {
  const ref = useRef(null);
  const [step, setStep] = useState(() => (prefersReducedMotion() ? count - 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const el = ref.current;
    let timer = null;
    const io = new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting) timer = setInterval(() => setStep((s) => (once ? Math.min(s + 1, count - 1) : (s + 1) % count)), ms);
    });
    if (el) io.observe(el);
    return () => {
      clearInterval(timer);
      io.disconnect();
    };
  }, [count, ms, once]);
  return [ref, step];
}

const STATUS = {
  green: { label: "Green", cls: "border-ew-green-rule bg-ew-green-bg text-ew-green" },
  yellow: { label: "Yellow", cls: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber" },
  red: { label: "Red", cls: "border-ew-red-rule bg-ew-red-bg text-ew-red" },
};
export function StatusChip({ status, className = "" }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[13px] font-semibold transition-colors duration-500 ${s.cls} ${className}`}>
      <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-current" />
      {s.label}
    </span>
  );
}

const CARD = "rounded-sm border border-ew-rule bg-white p-4 text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.35)]";

// ------------------------------------------------------------------ Minutes, not a week
export function RaceBars() {
  const [ref, step] = useLoop(8, 900); // 0 start, 1..7 manual crawls; Kestrel done at step 1
  const manual = Math.min(100, (step / 7) * 100);
  const kestrel = step >= 1 ? 100 : 0;
  return (
    <div ref={ref} className="space-y-4">
      {[
        { label: "Reading by hand", pct: manual, end: "~1 week", fast: false },
        { label: "Kestrel", pct: kestrel, end: "2 min", fast: true },
      ].map((r) => (
        <div key={r.label} className="grid grid-cols-[130px_minmax(0,1fr)_84px] items-center gap-4">
          <span className={`text-[14px] ${r.fast ? "font-semibold text-white" : "text-white/65"}`}>{r.label}</span>
          <span className="h-3 overflow-hidden rounded-sm bg-white/10">
            <span
              className={`block h-full rounded-sm ${r.fast ? "bg-[#38bdf8]" : "bg-white/35"}`}
              style={{ width: `${r.pct}%`, transition: `width ${r.fast ? 600 : 900}ms ${r.fast ? "cubic-bezier(.2,.8,.2,1)" : "linear"}` }}
            />
          </span>
          <span className={`flex items-center gap-1.5 font-mono text-[13px] ${r.fast ? "text-white" : "text-white/55"}`}>
            {r.fast && r.pct === 100 && <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#38bdf8]" />}
            {r.end}
          </span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Step demos
export function ScreenDemo() {
  const name = "Northfield Battery Works";
  const domain = "northfieldbattery.com";
  const [ref, step] = useLoop(30, 120); // ~3.6 s loop
  const n = Math.min(name.length, step * 2);
  const d = Math.max(0, Math.min(domain.length, (step - 12) * 2));
  const pressed = step >= 25;
  return (
    <div ref={ref} className={CARD}>
      <p className="text-[12px] font-semibold text-ew-muted">Screen new applicant</p>
      <p className="mt-2.5 h-9 rounded-sm border border-ew-rule px-2.5 py-2 text-[13.5px]">
        {name.slice(0, n)}
        {n < name.length && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 bg-ew-ink" />}
      </p>
      <p className="mt-1.5 h-9 rounded-sm border border-ew-rule px-2.5 py-2 font-mono text-[12.5px] text-ew-ink-soft">{domain.slice(0, d)}</p>
      <span
        className={`mt-3 inline-flex h-9 items-center gap-2 rounded-sm px-3 text-[13px] font-semibold text-white transition-all duration-200 ${
          pressed ? "scale-95 bg-ew-ink ring-4 ring-[#38bdf8]/40" : "bg-ew-ink"
        }`}
      >
        {pressed ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
        {pressed ? "Checking…" : "Save and check"}
      </span>
    </div>
  );
}

const CHECKS = [
  { label: "News", detail: "12 articles read", result: "1 flag" },
  { label: "Court filings", detail: "3 records", result: "1 flag" },
  { label: "Job posts", detail: "14 vs 37/month", result: "Clear" },
  { label: "Reviews", detail: "48 reviews", result: "Clear" },
  { label: "Cash flow", detail: "2 other lenders", result: "1 flag" },
];
export function CheckDemo() {
  const [ref, step] = useLoop(CHECKS.length + 4, 550);
  return (
    <div ref={ref} className={CARD}>
      <ul className="divide-y divide-ew-rule-soft">
        {CHECKS.map((c, i) => {
          const done = step > i;
          const flag = c.result !== "Clear";
          return (
            <li key={c.label} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
              <span className="min-w-0">
                <span className="font-medium">{c.label}</span>
                <span className={`ml-2 font-mono text-[11.5px] text-ew-muted transition-opacity duration-300 ${done ? "opacity-100" : "opacity-0"}`}>{c.detail}</span>
              </span>
              {done ? (
                <span className={`rounded-sm px-1.5 py-0.5 text-[12px] font-semibold ${flag ? "bg-ew-red-bg text-ew-red" : "text-ew-muted"}`}>{c.result}</span>
              ) : (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-ew-muted" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const CHOICES = ["Approve", "Request documents", "Decline"];
export function DecideDemo() {
  const [ref, step] = useLoop(8, 600); // 0 empty, 1 flag in, 3 cursor moves, 4 click, 7 hold
  const flagIn = step >= 1;
  const cursorAt = step >= 3;
  const clicked = step >= 4;
  return (
    <div ref={ref} className={`${CARD} relative`}>
      <div className={`rounded-sm border border-ew-red-rule bg-ew-red-bg/40 p-2.5 transition-all duration-500 ${flagIn ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}>
        <p className="flex justify-between text-[13px] font-semibold">
          WARN notice, 125 jobs <span className="font-normal text-ew-muted">Nevada DETR</span>
        </p>
        <p className="mt-1 text-[12.5px] text-ew-ink-soft">&ldquo;Number of employees affected: 125.&rdquo;</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHOICES.map((c) => (
          <span
            key={c}
            className={`rounded-sm border px-2.5 py-1.5 text-[12.5px] font-semibold transition-all duration-200 ${
              clicked && c === "Request documents" ? "border-ew-ink bg-ew-ink text-white" : "border-ew-rule text-ew-ink"
            }`}
          >
            {clicked && c === "Request documents" ? "✓ Documents requested" : c}
          </span>
        ))}
      </div>
      <MousePointer2
        aria-hidden="true"
        className="pointer-events-none absolute h-5 w-5 fill-white text-ew-ink transition-all duration-700 ease-out"
        style={cursorAt ? { left: "38%", bottom: "14px", transform: clicked ? "scale(0.85)" : "scale(1)" } : { left: "88%", bottom: "70%" }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ Before the quarterly financials
// Jul 1 to Nov 30 (152 days) across the width; each month is about 20%.
const AXIS_DAYS = 152;
const pos = (month, day) => (((month - 7) * 30.5 + (day - 1)) / AXIS_DAYS) * 100;
const AXIS = ["Jul", "Aug", "Sep", "Oct", "Nov"].map((label, i) => ({ label, at: pos(7 + i, 1) }));
export function LeadTimeline() {
  const [ref, step] = useLoop(7, 700); // 1 first flag, 2 second, 3 financials marker, 4 bracket
  const flags = [
    { label: "CFO departure", left: pos(9, 10) },
    { label: "WARN notice", left: pos(9, 24) },
  ];
  const fin = pos(11, 14);
  return (
    <div ref={ref} className="relative pb-2 pt-10">
      <div className="relative h-px bg-white/30">
        {AXIS.map((a) => (
          <span key={a.label} className="absolute top-3 -translate-x-1/2 text-[12px] text-white/50" style={{ left: `${a.at}%` }}>
            {a.label}
          </span>
        ))}
        {flags.map((f, i) => (
          <span key={f.label} className={`absolute -top-[7px] transition-all duration-500 ${step > i ? "scale-100 opacity-100" : "scale-0 opacity-0"}`} style={{ left: `${f.left}%` }}>
            <span className="block h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-ew-red ring-4 ring-ew-red/25" />
            <span className="absolute -top-8 left-0 -translate-x-1/2 whitespace-nowrap text-[12.5px] font-semibold text-white">{f.label}</span>
          </span>
        ))}
        <span className={`absolute -top-6 h-12 border-l-2 border-dashed border-white/60 transition-opacity duration-500 ${step >= 3 ? "opacity-100" : "opacity-0"}`} style={{ left: `${fin}%` }}>
          <span className="absolute -top-6 left-0 -translate-x-1/2 whitespace-nowrap text-[12.5px] font-semibold text-white/80">Q3 financials</span>
        </span>
        <span
          className="absolute top-9 h-2 border-x-2 border-b-2 border-[#38bdf8] transition-all duration-700 ease-out"
          style={{ left: `${flags[0].left}%`, width: step >= 4 ? `${fin - flags[0].left}%` : "0%" }}
        >
          <span className={`absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap font-heading text-[18px] font-bold text-[#38bdf8] transition-opacity duration-500 ${step >= 4 ? "opacity-100" : "opacity-0"}`}>
            9 weeks earlier
          </span>
        </span>
      </div>
    </div>
  );
}
