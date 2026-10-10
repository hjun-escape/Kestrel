import React, { useLayoutEffect, useRef, useState } from "react";
import { createScope } from "animejs";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { AXIS, AXIS_MONTHS, BADGES, FILING, FLAGS, SAMPLE_COMPANY, TODAY, WHY_LINES, axisX } from "./heroData";
import { buildHeroTimeline } from "./heroTimeline";
import { prefersReducedMotion } from "./motion";

const STACK = "[grid-area:1/1]";
const FINAL_STATUS = BADGES[BADGES.length - 1];
const FINAL_WHY = WHY_LINES.length - 1;
const RAIL = { green: "bg-ew-green", yellow: "bg-[#d68a1c]", red: "bg-ew-red" };
const PULSE = { yellow: "ring-[#d68a1c]", red: "ring-ew-red" };

// The markup is the final state (Red, three flags). Reduced motion and
// no-JS visitors see exactly this; the timeline only rewinds and replays it.
function useHeroSequence(rootRef) {
  const [runId, setRunId] = useState(0);

  useLayoutEffect(() => {
    if (prefersReducedMotion() || !rootRef.current) return undefined;
    const scope = createScope({ root: rootRef.current }).add(() => {
      buildHeroTimeline();
    });
    return () => scope.revert();
  }, [rootRef, runId]);

  return () => setRunId((n) => n + 1);
}

function StatusStack() {
  return (
    <div className="grid justify-items-end">
      {BADGES.map((key) => {
        const s = STATUS_STYLES[key];
        return (
          <span
            key={key}
            data-badge={key}
            className={`${STACK} inline-flex items-center gap-2 whitespace-nowrap rounded-sm border px-2.5 py-1 text-sm font-semibold ${s.badge} ${key === FINAL_STATUS ? "" : "opacity-0"}`}
          >
            <span aria-hidden="true" className={`inline-block shrink-0 ${s.glyph}`} />
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

function CompanyCard() {
  return (
    <div className="relative">
      {Object.entries(PULSE).map(([key, ring]) => (
        <span
          key={key}
          data-pulse={key}
          className={`pointer-events-none absolute inset-0 rounded-[3px] opacity-0 ring-2 ${ring}`}
        />
      ))}
      <div className="relative flex overflow-hidden rounded-[3px] border border-ew-rule bg-white shadow-[0_1px_0_rgba(20,32,46,0.04),0_12px_28px_-18px_rgba(20,32,46,0.45)]">
        <div className="relative w-1.5 shrink-0">
          {Object.entries(RAIL).map(([key, bg]) => (
            <span
              key={key}
              data-badge={key}
              className={`absolute inset-0 ${bg} ${key === FINAL_STATUS ? "" : "opacity-0"}`}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading text-[17px] font-bold leading-tight text-ew-ink">{SAMPLE_COMPANY.name}</p>
              <p className="mt-0.5 text-[13px] text-ew-muted">
                {SAMPLE_COMPANY.detail}, {SAMPLE_COMPANY.place}
              </p>
            </div>
            <StatusStack />
          </div>
          <div className="mt-3 grid border-t border-ew-rule-soft pt-2.5 text-[13px] leading-snug text-ew-ink-soft">
            {WHY_LINES.map((line, i) => (
              <p key={line} data-why={i} className={`${STACK} ${i === FINAL_WHY ? "" : "opacity-0"}`}>
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlagItem({ flag, index }) {
  return (
    <li
      data-flag={index}
      className="rounded-[3px] border border-ew-rule bg-white px-3.5 py-2.5 shadow-[0_8px_20px_-16px_rgba(20,32,46,0.5)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-[14px] font-semibold text-ew-ink">{flag.title}</p>
        <p className="text-[12px] text-ew-muted">
          {flag.when},{" "}
          <span className="text-ew-ink-soft underline decoration-ew-rule underline-offset-2">{flag.source}</span>
        </p>
      </div>
      <p className="mt-1.5 border-l-2 border-ew-rule pl-2.5 text-[13px] leading-snug text-ew-ink-soft">
        &ldquo;{flag.quote}&rdquo;
      </p>
    </li>
  );
}

function AxisMark({ flag, index }) {
  const { baseline } = AXIS;
  if (flag.mark.kind === "range") {
    const x1 = axisX(flag.mark.from);
    const x2 = axisX(flag.mark.to);
    return (
      <rect
        data-mark-range={index}
        x={x1}
        y={baseline - 2}
        width={x2 - x1}
        height={4}
        rx={3}
        fill="#14202e"
        fillOpacity="0.45"
        style={{ transformBox: "fill-box", transformOrigin: "left center" }}
      />
    );
  }
  return (
    <circle
      data-mark={index}
      cx={axisX(flag.mark.date)}
      cy={baseline}
      r={5.5}
      fill="#14202e"
      stroke="#eef1f4"
      strokeWidth="2"
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    />
  );
}

function SignalAxis() {
  const { width, left, right, baseline } = AXIS;
  const today = axisX(TODAY.date);
  const filing = axisX(FILING.date);
  return (
    <svg viewBox={`0 0 ${width} 64`} className="block h-auto w-full" aria-hidden="true">
      <rect x={today} y={baseline - 14} width={filing - today} height={28} fill="#14202e" opacity="0.05" />
      <line x1={left} y1={baseline} x2={right} y2={baseline} stroke="#9aa5b3" strokeWidth="1" />
      {AXIS_MONTHS.map((m) => (
        <g key={m.label}>
          <line x1={axisX(m.date)} y1={baseline} x2={axisX(m.date)} y2={baseline + 5} stroke="#9aa5b3" />
          <text x={axisX(m.date) + 3} y={baseline + 17} fontSize="11" fill="#5a6675">
            {m.label}
          </text>
        </g>
      ))}
      <line x1={today} y1={2} x2={today} y2={baseline + 8} stroke="#14202e" strokeWidth="1" />
      <text x={today - 4} y={11} fontSize="11" fill="#14202e" textAnchor="end" fontWeight="600">
        {TODAY.label}
      </text>
      <line x1={filing} y1={2} x2={filing} y2={baseline + 8} stroke="#5a6675" strokeDasharray="3 3" />
      <text x={filing - 4} y={11} fontSize="11" fill="#5a6675" textAnchor="end">
        {FILING.label}
      </text>
      <text x={filing - 4} y={23} fontSize="11" fill="#5a6675" textAnchor="end">
        {FILING.when}
      </text>
      {FLAGS.map((flag, i) => (
        <AxisMark key={flag.id} flag={flag} index={i} />
      ))}
    </svg>
  );
}

// Hero visual: a sample applicant file whose status moves Green, Yellow,
// Red as sourced flags arrive, ahead of the next quarterly financials.
export default function SignalFile() {
  const rootRef = useRef(null);
  const replay = useHeroSequence(rootRef);

  return (
    <figure aria-labelledby="signal-file-caption">
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-3 translate-y-3 rounded-md border border-white/10 bg-white/[0.04] sm:translate-x-5 sm:translate-y-5"
        />
        <div
          ref={rootRef}
          aria-hidden="true"
          className="relative rounded-md bg-ew-paper p-3.5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.75)] sm:p-5"
        >
          <div className="mb-3 flex items-baseline justify-between text-[12px] text-ew-muted">
            <span className="font-semibold text-ew-ink-soft">Applicant screening</span>
            <span>Checked Oct 10, 2026</span>
          </div>
          <CompanyCard />
          <ol className="mt-3 space-y-2 sm:ml-6">
            {FLAGS.map((flag, i) => (
              <FlagItem key={flag.id} flag={flag} index={i} />
            ))}
          </ol>
          <div className="mt-3">
            <SignalAxis />
          </div>
        </div>
      </div>
      <figcaption className="mt-6 flex items-start justify-between gap-4 text-[13px] leading-snug text-white/70 sm:mt-8">
        <span id="signal-file-caption">
          Sample applicant. Two strong flags turn the status Red, weeks before the quarterly financials arrive.
        </span>
        <button
          type="button"
          onClick={replay}
          className="shrink-0 rounded-sm px-1 font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline-white motion-reduce:hidden"
        >
          Replay
        </button>
      </figcaption>
    </figure>
  );
}
