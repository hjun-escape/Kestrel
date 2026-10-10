import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, MousePointer2 } from "lucide-react";
import { prefersReducedMotion } from "./motion";
import { useScrollProgress } from "./reveal";

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

const CARD = "rounded-sm border border-ew-rule bg-white p-4 text-ew-ink shadow-[0_10px_28px_-18px_rgba(20,32,46,0.4)]";

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
          <span className={`text-[14px] ${r.fast ? "font-semibold text-ew-ink" : "text-ew-muted"}`}>{r.label}</span>
          <span className="h-3 overflow-hidden rounded-sm bg-[#cdd3db]/60">
            <span
              className={`block h-full rounded-sm ${r.fast ? "bg-[#0ea5e9]" : "bg-[#5a6675]/45"}`}
              style={{ width: `${r.pct}%`, transition: `width ${r.fast ? 600 : 900}ms ${r.fast ? "cubic-bezier(.2,.8,.2,1)" : "linear"}` }}
            />
          </span>
          <span className={`flex items-center gap-1.5 font-mono text-[13px] ${r.fast ? "font-semibold text-ew-ink" : "text-ew-muted"}`}>
            {r.fast && r.pct === 100 && <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#0284c7]" />}
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
      <div className={`rounded-sm border border-ew-red-rule bg-[#fdecea]/40 p-2.5 transition-all duration-500 ${flagIn ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}>
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
// Jul 1 to Nov 30 (152 days) across the width. Scroll-driven: as the panel scrolls up, the CFO departure lands,
// then the WARN notice, then the Q3 financials marker, then the lead-time bracket draws across.
const AXIS_DAYS = 152;
const pos = (month, day) => (((month - 7) * 30.5 + (day - 1)) / AXIS_DAYS) * 100;
const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov"].map((label, i) => ({ label, at: pos(7 + i, 1) }));
const LINE_Y = 64; // px from the top of the timeline

export function LeadTimeline() {
  const [ref, p] = useScrollProgress({ start: 0.9, end: 0.4 });
  const flags = [
    { label: "CFO departure", date: "Sep 10", left: pos(9, 10), at: 0.12 },
    { label: "WARN notice", date: "Sep 24", left: pos(9, 24), at: 0.32 },
  ];
  const fin = pos(11, 14);
  const showFin = p >= 0.52;
  const bracket = Math.min(1, Math.max(0, (p - 0.66) / 0.3));
  return (
    <div ref={ref} className="relative h-[176px]">
      {/* Axis with month ticks and labels. */}
      <div className="absolute inset-x-0 h-[2px] rounded bg-[#14202e]/25" style={{ top: LINE_Y }} />
      {MONTHS.map((m) => (
        <div key={m.label} className="absolute" style={{ left: `${m.at}%`, top: LINE_Y - 4 }}>
          <span className="block h-[10px] w-px bg-[#14202e]/35" />
          <span className="absolute left-0 top-4 -translate-x-1/2 text-[12px] text-ew-muted">{m.label}</span>
        </div>
      ))}

      {/* Flags land on the line. */}
      {flags.map((f) => {
        const on = p >= f.at;
        return (
          <div
            key={f.label}
            className="absolute -translate-x-1/2 text-center transition-all duration-500 ease-out"
            style={{ left: `${f.left}%`, top: LINE_Y - 46, opacity: on ? 1 : 0, transform: `translate(-50%, ${on ? 0 : -14}px)` }}
          >
            <p className="whitespace-nowrap text-[12.5px] font-semibold text-ew-ink">{f.label}</p>
            <p className="whitespace-nowrap text-[11px] text-ew-muted">{f.date}</p>
            <span
              className="mx-auto mt-1 block h-3.5 w-3.5 rounded-full bg-ew-red"
              style={{ boxShadow: "0 0 0 4px rgba(185, 28, 28, 0.18)" }}
            />
          </div>
        );
      })}

      {/* Quarterly financials marker. */}
      <div
        className="absolute transition-opacity duration-500"
        style={{ left: `${fin}%`, top: LINE_Y - 46, opacity: showFin ? 1 : 0 }}
      >
        <p className="-translate-x-1/2 whitespace-nowrap text-[12.5px] font-semibold text-ew-ink-soft">Q3 financials</p>
        <p className="-translate-x-1/2 whitespace-nowrap text-[11px] text-ew-muted">Nov 14</p>
        <span className="mt-1 block h-[34px] w-0 border-l-2 border-dashed border-[#14202e]/45" />
      </div>

      {/* Lead-time bracket, drawn across as you scroll. */}
      <div className="absolute" style={{ left: `${flags[0].left}%`, width: `${(fin - flags[0].left) * bracket}%`, top: LINE_Y + 36 }}>
        <span className="block h-2.5 rounded-b-sm border-x-2 border-b-2 border-[#0284c7]" style={{ opacity: bracket > 0 ? 1 : 0 }} />
      </div>
      <p
        className="absolute -translate-x-1/2 whitespace-nowrap font-heading text-[17px] font-bold text-[#0284c7] transition-opacity duration-300"
        style={{ left: `${(flags[0].left + fin) / 2}%`, top: LINE_Y + 54, opacity: bracket >= 1 ? 1 : 0 }}
      >
        9 weeks earlier
      </p>
    </div>
  );
}
