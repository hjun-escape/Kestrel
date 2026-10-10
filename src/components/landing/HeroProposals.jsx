import React, { useMemo, useState } from "react";
import LandingCtas from "./LandingCtas";
import { SAMPLE_COMPANY } from "./heroData";
import { pipelineScene, sandpileScene, wavesScene } from "./caScenes";
import { useCanvasScene, useFlagProgress } from "./useCanvasScene";

// Three hero proposals built around a cellular automaton that runs the product's workflow.
// Same copy and buttons as the current hero; the automaton drives a live sample credit file.
// Sample company and flags come from heroData (fictional, labelled as the sample).

const LEDGER =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(255,255,255,0.045)_31px,rgba(255,255,255,0.045)_32px)]";

const HEADLINE = "See the trouble before you lend.";
const SUBLINE =
  "Early Warning screens private companies in minutes: public warning signs, other lenders, late payments, every flag with a source.";
const FINE_PRINT = "Built for bank credit officers. Sign-in is optional; the demo opens a sample loan book.";

const STATUS = {
  green: { label: "Green", cls: "border-ew-green-rule bg-ew-green-bg text-ew-green" },
  yellow: { label: "Yellow", cls: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber" },
  red: { label: "Red", cls: "border-ew-red-rule bg-ew-red-bg text-ew-red" },
};

function StatusChip({ status, className = "" }) {
  const s = STATUS[status] || STATUS.green;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[13px] font-semibold ${s.cls} ${className}`}>
      <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-current" />
      {s.label}
    </span>
  );
}

function Shell({ children }) {
  return <div className={`relative overflow-hidden bg-ew-ink text-white ${LEDGER}`}>{children}</div>;
}

function Headline({ className = "", size = "text-[clamp(2.6rem,1.6rem+4.4vw,4.9rem)]" }) {
  return (
    <h1
      id="hero-heading"
      className={`font-heading ${size} font-bold leading-[0.93] tracking-[-0.025em] [font-stretch:72%] [text-wrap:balance] ${className}`}
    >
      {HEADLINE}
    </h1>
  );
}

/** Live sample file: status, why line, flags as they land. */
function LiveFile({ progress, compact = false }) {
  return (
    <div className="rounded-sm border border-white/10 bg-white text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3 border-b border-ew-rule px-4 py-3">
        <div className="min-w-0">
          <p className="font-heading text-[15px] font-bold leading-tight">{SAMPLE_COMPANY.name}</p>
          <p className="text-[12px] text-ew-muted">{SAMPLE_COMPANY.detail}</p>
        </div>
        <StatusChip status={progress.status} />
      </div>
      <p aria-live="polite" className="border-b border-ew-rule-soft px-4 py-2 text-[12.5px] text-ew-ink-soft">
        {progress.why}
      </p>
      <ul className={`px-4 py-2 ${compact ? "min-h-[64px]" : "min-h-[150px]"}`}>
        {progress.flags.length === 0 && <li className="py-1.5 text-[12.5px] text-ew-muted">Waiting for a verified signal…</li>}
        {progress.flags.map((f) => (
          <li key={f.id} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
            <span className="font-semibold">{f.title}</span>
            <span className="shrink-0 text-[12px] text-ew-muted">
              {f.when}, {f.source}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ 1. Pipeline
const STAGES = [
  { n: "01", title: "Search", body: "News, court filings, job posts, reviews" },
  { n: "02", title: "Read", body: "Fragments fuse into whole articles" },
  { n: "03", title: "Tag", body: "AI marks what is relevant" },
  { n: "04", title: "Verify", body: "Same company, exact quote, or it dies" },
];

export function PipelineHero() {
  const progress = useFlagProgress();
  const { canvasRef } = useCanvasScene(() => pipelineScene({ onSignal: progress.onSignal }), { fps: 14 });
  return (
    <Shell>
      <section aria-labelledby="hero-heading" className="mx-auto max-w-[1200px] px-4 pb-16 pt-10 sm:px-8 lg:pb-20 lg:pt-14">
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
          <Headline />
          <div>
            <p className="text-[17px] leading-relaxed text-white/80">{SUBLINE}</p>
            <LandingCtas tone="dark" className="mt-6" />
          </div>
        </div>

        <figure className="mt-12" aria-label="How a check works: search, read, tag, verify, then the credit file">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
            <div className="relative min-h-[240px] overflow-hidden rounded-sm border border-white/10">
              <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
              <ol className="pointer-events-none relative grid grid-cols-4">
                {STAGES.map((s) => (
                  <li key={s.n} className="px-3 pt-3">
                    <p className="text-[11px] font-semibold tracking-wide text-white/50">{s.n}</p>
                    <p className="font-heading text-[15px] font-bold text-white">{s.title}</p>
                    <p className="hidden text-[12px] leading-snug text-white/60 md:block">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
            <LiveFile progress={progress} />
          </div>
          <figcaption className="mt-3 text-[13px] text-white/60">
            A cellular automaton with a different rule in each stage: raw noise enters on the left, and only structure that
            survives every rule reaches the file. Sample applicant.
          </figcaption>
        </figure>
        <p className="mt-6 text-[13px] text-white/60">{FINE_PRINT}</p>
      </section>
    </Shell>
  );
}

// ------------------------------------------------------------------ 2. Waves
const RING_LABELS = ["Search", "Read", "Tag", "Verify"];

export function WavesHero() {
  const progress = useFlagProgress();
  const { canvasRef } = useCanvasScene(() => wavesScene({ onSignal: progress.onSignal }), { fps: 16 });
  return (
    <Shell>
      <section
        aria-labelledby="hero-heading"
        className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pb-24 lg:pt-14"
      >
        <div>
          <Headline />
          <p className="mt-6 max-w-[34rem] text-[18px] leading-relaxed text-white/80">{SUBLINE}</p>
          <LandingCtas tone="dark" className="mt-9" />
          <p className="mt-4 text-[13px] text-white/60">{FINE_PRINT}</p>
        </div>

        <figure aria-label="Signals travel inward through four checks to the company" className="mx-auto w-full max-w-[520px]">
          <div className="relative aspect-square">
            <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
            {/* Ring labels at the top of each ring (outer = Search). */}
            {RING_LABELS.map((label, i) => {
              const edges = [1, 0.8, 0.6, 0.42, 0.24];
              const mid = (edges[i] + edges[i + 1]) / 2;
              return (
                <span
                  key={label}
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-ew-ink/80 px-1.5 text-[11px] font-semibold tracking-wide text-white/70"
                  style={{ top: `${50 - mid * 50}%` }}
                >
                  {label}
                </span>
              );
            })}
            <div className="absolute left-1/2 top-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="font-heading text-[13px] font-bold leading-tight text-white">{SAMPLE_COMPANY.name}</p>
              <StatusChip status={progress.status} className="mt-1.5" />
            </div>
          </div>
          <figcaption className="mt-2 text-center text-[13px] text-white/60" aria-live="polite">
            {progress.flags.length
              ? `Latest: ${progress.flags[progress.flags.length - 1].title}, ${progress.flags[progress.flags.length - 1].when}`
              : "Sources fire at the rim. Each ring is a stricter check; only strong signals reach the company."}
          </figcaption>
        </figure>
      </section>
    </Shell>
  );
}

// ------------------------------------------------------------------ 3. Sandpile
function statusFor(score) {
  return score >= 70 ? "red" : score >= 30 ? "yellow" : "green";
}

export function SandpileHero() {
  const [score, setScore] = useState(0);
  const onScore = useMemo(() => {
    let last = -1;
    return (s) => {
      if (s !== last) {
        last = s;
        setScore(s);
      }
    };
  }, []);
  const { canvasRef } = useCanvasScene(() => sandpileScene({ onScore }), { fps: 30, warmup: 400 });
  const status = statusFor(score);
  return (
    <Shell>
      <section aria-labelledby="hero-heading" className="mx-auto max-w-[1200px] px-4 pb-20 pt-10 text-center sm:px-8 lg:pb-24 lg:pt-14">
        <Headline className="mx-auto max-w-[14ch]" />
        <p className="mx-auto mt-6 max-w-[40rem] text-[18px] leading-relaxed text-white/80">{SUBLINE}</p>
        <div className="mt-8 flex justify-center">
          <LandingCtas tone="dark" />
        </div>

        <figure className="mx-auto mt-12 grid max-w-[980px] items-center gap-8 text-left lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="relative aspect-[16/9] w-full">
            <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
            {/* Threshold rings: the pile's reach is the warning score. */}
            <svg aria-hidden="true" viewBox="0 0 160 90" className="pointer-events-none absolute inset-0 h-full w-full">
              {[
                { r: 0.3, label: "Yellow 30" },
                { r: 0.7, label: "Red 70" },
              ].map((t) => (
                <g key={t.label}>
                  <circle cx="80" cy="45" r={t.r * 43} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.3" strokeDasharray="1 1.5" />
                  <text x="80" y={45 - t.r * 43 - 1.2} textAnchor="middle" fontSize="2.6" fill="rgba(255,255,255,0.6)">
                    {t.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div>
            <p className="text-[12px] font-semibold tracking-wide text-white/55">WARNING SCORE</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-heading text-5xl font-bold tabular-nums">{score}</span>
              <span className="text-white/50">/ 100</span>
            </p>
            <StatusChip status={status} className="mt-2" />
            <p className="mt-4 text-[14px] leading-relaxed text-white/70">
              Every verified signal drops evidence on the pile. Piles topple into avalanches, and how far they reach is the
              score. Cross a ring and the status changes. Sample applicant.
            </p>
            <p className="mt-4 text-[13px] text-white/55">{FINE_PRINT}</p>
          </div>
        </figure>
      </section>
    </Shell>
  );
}
