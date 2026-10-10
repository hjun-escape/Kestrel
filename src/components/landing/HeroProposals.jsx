import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LandingCtas from "./LandingCtas";
import { FLAGS, SAMPLE_COMPANY } from "./heroData";
import { LANES, LANE_COLORS, RING_EDGES, encodeText, pipelineScene, sandpileScene, wavesScene } from "./caScenes";
import { prefersReducedMotion } from "./motion";
import { useCanvasScene, useFlagProgress } from "./useCanvasScene";
import { BANDS as SCORE_BANDS, warningScore } from "@/lib/warningScore.ts";

// Three hero proposals, each a full-bleed cellular automaton that runs the product's workflow.
// The intro is kept to the name, one line and the buttons; stage and source labels sit outside the
// cells; hovering any cell explains what it is. Sample company and items are fictional (heroData).

const LEDGER =
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(255,255,255,0.03)_31px,rgba(255,255,255,0.03)_32px)]";

// ------------------------------------------------------------------ shared
const SOURCES = [
  {
    label: "News",
    items: [
      "“Northfield CFO Dana Whitlock steps down” · Electrek",
      "“Northfield opens a second Reno line” · Reno Gazette",
      "“Battery makers face a cathode squeeze” · Reuters",
      "“Northfield names new plant manager” · NNBW",
    ],
  },
  {
    label: "Court filings",
    items: [
      "Sagebrush Capital v. Northfield Battery Works · Washoe County",
      "UCC-1 lien, Sierra Equipment Finance · Nevada SOS",
      "Small-claims case, Northfield Farms (Ohio) · different company",
    ],
  },
  {
    label: "Job posts",
    items: ["Process engineer, Reno · posted Aug 2", "Line supervisor · posting removed Sep 18", "14 openings in the last 30 days vs 37/month before"],
  },
  {
    label: "Reviews",
    items: ["“Paychecks were late twice in September” · Glassdoor", "“Great team, long shifts” · Glassdoor", "“Layoffs announced at the all-hands” · Indeed"],
  },
  {
    label: "LinkedIn",
    items: ["Dana Whitlock · CFO · Jan 2021 – Sep 2026", "Marcus Lee · COO · still at Northfield", "Company headcount 412 → 381"],
  },
];
const itemFor = (lane, id = 0) => {
  const items = SOURCES[lane]?.items ?? [];
  return items[Math.abs(id) % items.length] ?? "";
};

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

/** The whole hero: full-bleed, the automaton fills it. */
function Stage({ children, className = "" }) {
  return (
    <div className={`relative overflow-hidden bg-ew-ink text-white ${LEDGER}`}>
      <section aria-labelledby="hero-heading" className={`relative h-[clamp(640px,90vh,860px)] ${className}`}>
        {children}
      </section>
    </div>
  );
}

/** Name, one line, buttons. Solid backing so it reads over the cells. */
function Intro({ className = "" }) {
  return (
    <div className={`pointer-events-auto rounded-sm border border-white/10 bg-ew-ink/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm ${className}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/60">Kestrel</p>
      <h1 id="hero-heading" className="mt-2 font-heading text-[clamp(2rem,1.4rem+2vw,3rem)] font-bold leading-[0.98] tracking-[-0.02em] [font-stretch:76%]">
        See the trouble before you lend.
      </h1>
      <p className="mt-3 text-[15px] text-white/75">Screening for private-company borrowers.</p>
      <LandingCtas tone="dark" className="mt-5" />
    </div>
  );
}

/** Hover: ask the scene what is under the pointer and show it just above. */
function useProbe(sceneRef, describe) {
  const [tip, setTip] = useState(null);
  const frame = useRef(0);
  const onPointerMove = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const info = sceneRef.current?.probe?.(x, y);
        const text = info ? describe(info) : null;
        setTip(text ? { x: info.x ?? x, y: info.y ?? y, ...text } : null);
      });
    },
    [sceneRef, describe]
  );
  const onPointerLeave = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setTip(null);
  }, []);
  return { tip, handlers: { onPointerMove, onPointerLeave } };
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 rounded-[2px] border border-white"
        style={{ left: tip.x, top: tip.y - 1 }}
      />
      <div
        role="status"
        className="pointer-events-none absolute z-30 w-max max-w-[300px] -translate-x-1/2 -translate-y-full rounded-sm border border-white/15 bg-[#0b1220] px-3 py-2 text-left shadow-xl"
        style={{ left: tip.x, top: tip.y - 10 }}
      >
        {tip.kicker && <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/50">{tip.kicker}</p>}
        <p className="text-[13px] font-semibold leading-snug text-white">{tip.title}</p>
        {tip.body && <p className="mt-0.5 text-[12px] leading-snug text-white/65">{tip.body}</p>}
      </div>
    </>
  );
}

/** Live sample credit file: status, why line, flags as they land. */
function LiveFile({ progress, className = "" }) {
  return (
    <div className={`pointer-events-auto rounded-sm border border-white/10 bg-white text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.4)] ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-ew-rule px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Credit file · sample</p>
          <p className="font-heading text-[15px] font-bold leading-tight">{SAMPLE_COMPANY.name}</p>
        </div>
        <StatusChip status={progress.status} />
      </div>
      <p aria-live="polite" className="border-b border-ew-rule-soft px-4 py-2 text-[12.5px] text-ew-ink-soft">
        {progress.why}
      </p>
      <ul className="min-h-[104px] px-4 py-2">
        {progress.flags.length === 0 && <li className="py-1.5 text-[12.5px] text-ew-muted">Waiting for a verified signal…</li>}
        {progress.flags.map((f) => (
          <li key={f.id} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
            <span className="font-semibold">{f.title}</span>
            <span className="shrink-0 text-[12px] text-ew-muted">{f.when}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Pill = ({ children, className = "", style }) => (
  <span className={`pointer-events-none absolute rounded-sm border border-white/15 bg-ew-ink/90 px-2 py-0.5 text-[11.5px] font-semibold text-white/85 ${className}`} style={style}>
    {children}
  </span>
);

// ------------------------------------------------------------------ 1. Pipeline
const STAGES = [
  { title: "Search", body: "Find every mention" },
  { title: "Read", body: "Pull the full text" },
  { title: "Tag", body: "AI marks what matters" },
  { title: "Verify", body: "Same company, exact quote" },
];
const GUTTER = 230; // input column: example items being encoded
const HEADER = 72; // stage titles (and the applicant input) above the cells
const EXIT = 0.66; // share of the canvas the pipeline runs across; the report sits to the right
const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

/** One example input: its text turns into blocks, then the bits spawn into the lane. */
function EncoderCard({ job }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const started = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / job.encodeMs);
      setShown(Math.round(t * job.text.length));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [job]);
  const col = LANE_COLORS[job.lane];
  return (
    <div
      className={`rounded-sm border bg-ew-ink/95 px-2.5 py-1.5 transition-opacity duration-500 ${job.leaving ? "opacity-0" : "opacity-100"}`}
      style={{ borderColor: css(col, 0.55) }}
    >
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: css(col) }}>
        Encoding
      </p>
      <p className="font-mono text-[11px] leading-snug text-white/85 [overflow-wrap:anywhere]">
        {[...job.text].map((ch, i) =>
          i < shown ? (
            <span key={i} style={{ color: css(col) }}>
              {(ch.charCodeAt(0) >> 3) & 1 ? "█" : "▓"}
            </span>
          ) : (
            <span key={i}>{ch}</span>
          )
        )}
      </p>
    </div>
  );
}

export function PipelineHero() {
  const progress = useFlagProgress();
  const [log, setLog] = useState([]);
  const [pulse, setPulse] = useState([0, 0, 0, 0]);
  const [jobs, setJobs] = useState([]); // encoder cards, at most one per lane
  const [landed, setLanded] = useState(null);
  const startRef = useRef(performance.now());
  const regionRef = useRef(null);
  const reportRef = useRef(null);

  const addLog = useCallback((lane, stage, text) => {
    const s = Math.floor((performance.now() - startRef.current) / 1000);
    const stamp = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    setLog((l) => [...l.slice(-6), { key: `${s}-${Math.random()}`, stamp, lane, stage, text }]);
  }, []);
  const bump = useCallback((stage) => setPulse((p) => p.map((v, i) => (i === stage ? v + 1 : v))), []);

  const { canvasRef, sceneRef } = useCanvasScene(
    () =>
      pipelineScene({
        exitFrac: EXIT,
        top: HEADER,
        onMark: ({ lane, id }) => {
          bump(2);
          addLog(lane, "Tag", `${SOURCES[lane].label}: ${shorten(itemFor(lane, id))} marked relevant`);
        },
        onDrop: ({ lane, id }) => {
          bump(3);
          addLog(lane, "Verify", `${SOURCES[lane].label}: quote not found, dropped ${shorten(itemFor(lane, id), 26)}`);
        },
        onSignal: ({ lane }) => {
          bump(3);
          const before = progress.step;
          progress.onSignal();
          const flag = FLAGS[Math.min(before, FLAGS.length - 1)];
          if (before < FLAGS.length) {
            setLanded(flag.id);
            addLog(lane, "Report", `Verified: ${flag.title} added to the report`);
          }
        },
      }),
    { fps: 14 }
  );

  // Verified cells fly to the report's flag list.
  useEffect(() => {
    const place = () => {
      const region = regionRef.current?.getBoundingClientRect();
      const report = reportRef.current?.getBoundingClientRect();
      if (region && report) sceneRef.current?.setTarget({ x: report.left - region.left + 24, y: report.top - region.top + 92 });
    };
    place();
    const ro = new ResizeObserver(place);
    if (regionRef.current) ro.observe(regionRef.current);
    const t = setTimeout(place, 400);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [sceneRef]);

  // Example inputs: pick a lane, show its item being encoded, then spawn the bits into that lane.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let n = 0;
    const timers = [];
    const launch = () => {
      const lane = n % LANES;
      const id = Math.floor(n / LANES);
      n += 1;
      const text = shorten(itemFor(lane, id), 44);
      const key = `${lane}-${n}`;
      const job = { key, lane, text, encodeMs: 1100, leaving: false };
      setJobs((js) => [...js.filter((j) => j.lane !== lane), job]);
      bump(0);
      timers.push(
        setTimeout(() => {
          sceneRef.current?.inject(lane, encodeText(text));
          addLog(lane, "Search", `${SOURCES[lane].label}: encoded “${shorten(text, 30)}”`);
          setJobs((js) => js.map((j) => (j.key === key ? { ...j, leaving: true } : j)));
          timers.push(setTimeout(() => bump(1), 1400));
        }, 1200),
        setTimeout(() => setJobs((js) => js.filter((j) => j.key !== key)), 1900)
      );
    };
    launch();
    const every = setInterval(launch, 1500);
    return () => {
      clearInterval(every);
      timers.forEach(clearTimeout);
    };
  }, [sceneRef, addLog, bump]);

  const describe = useCallback((p) => {
    const source = SOURCES[p.lane]?.label ?? "";
    const stage = STAGES[p.stage]?.title ?? "";
    if (p.empty) return { kicker: `${stage} · ${source} lane`, title: "Nothing here", body: "Filtered out at this stage." };
    const item = itemFor(p.lane, p.id);
    if (p.stage === 0) return { kicker: `Search · ${source}`, title: item, body: "Matched the company name in the last 180 days." };
    if (p.stage === 1) return { kicker: `Read · ${source}`, title: item, body: "Full text pulled through Bright Data." };
    if (p.stage === 2)
      return p.state === 2
        ? { kicker: `Tag · ${source}`, title: item, body: "Marked relevant: a warning sign about this company." }
        : { kicker: `Tag · ${source}`, title: item, body: "Not marked: not a warning sign, will be dropped." };
    return p.state === 2
      ? { kicker: `Verify · ${source}`, title: item, body: "Same company and the quote is word for word in the source. Heading to the report." }
      : { kicker: `Verify · ${source}`, title: item, body: "Failed the check: dropped." };
  }, []);
  const { tip, handlers } = useProbe(sceneRef, describe);
  // The report's warning score and status, from the app's own scoring rules for the flags landed so far.
  const score = useMemo(() => warningScore(progress.flags.map(flagSignal)), [progress.flags]);

  return (
    <div className="bg-ew-ink text-white">
      {/* Stage titles pulse when something happens in that stage. Self-contained keyframes. */}
      <style>{"@keyframes kestrelPulse{0%{color:#fff;text-shadow:0 0 14px rgba(255,255,255,.9)}100%{text-shadow:0 0 0 rgba(255,255,255,0)}}"}</style>
      <section aria-labelledby="hero-heading" className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-8">
        <h1 id="hero-heading" className="font-heading text-[clamp(1.6rem,1.2rem+1.4vw,2.3rem)] font-bold leading-tight tracking-[-0.015em]">
          Kestrel
        </h1>
        <p className="mt-0.5 text-[15px] text-white/65">Private company screener</p>

        {/* The pipeline, in a padded frame. */}
        <figure aria-label="How Kestrel checks one applicant: input, search, read, tag, verify, report" className="relative mt-6 h-[clamp(560px,72vh,720px)] overflow-hidden rounded-sm border border-white/10 bg-black/10">
          {/* Input column: the applicant, then each source's example item being encoded. */}
          <div className="absolute bottom-0 left-0 top-0 border-r border-white/10" style={{ width: GUTTER }}>
            <div className="flex flex-col justify-center px-3" style={{ height: HEADER }}>
              <ApplicantInput key={progress.step === 0 ? "run" : "hold"} />
            </div>
            <div className="absolute inset-x-0 bottom-0 grid" style={{ top: HEADER, gridTemplateRows: `repeat(${LANES}, minmax(0, 1fr))` }}>
              {SOURCES.map((s, lane) => {
                const job = jobs.find((j) => j.lane === lane);
                return (
                  <div key={s.label} className="flex flex-col justify-center gap-1 border-t border-white/5 px-3">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85">
                      <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: css(LANE_COLORS[lane]) }} />
                      {s.label}
                      <span aria-hidden="true" className="ml-auto text-white/35">→</span>
                    </p>
                    {job ? <EncoderCard key={job.key} job={job} /> : <div className="h-[46px]" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* The automaton, its stage titles, and the report. */}
          <div ref={regionRef} className="absolute bottom-0 right-0 top-0" style={{ left: GUTTER }}>
            <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-crosshair" {...handlers} />
            <ol className="pointer-events-none absolute left-0 top-0 grid grid-cols-4" style={{ width: `${EXIT * 100}%`, height: HEADER }}>
              {STAGES.map((s, i) => (
                <li key={s.title} className="flex flex-col justify-end border-l border-white/10 px-4 pb-2 first:border-l-0">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45">0{i + 1}</p>
                  <p key={pulse[i]} className="font-heading text-[17px] font-bold leading-tight text-white motion-safe:animate-[kestrelPulse_700ms_ease-out]">
                    {s.title}
                  </p>
                  <p className="text-[12px] text-white/55">{s.body}</p>
                </li>
              ))}
            </ol>

            <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex flex-col justify-center px-4" style={{ width: `${(1 - EXIT) * 100}%` }}>
              <div ref={reportRef} className="pointer-events-auto rounded-sm border border-white/10 bg-white text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
                <div className="flex items-start justify-between gap-3 border-b border-ew-rule px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Report · sample</p>
                    <p className="font-heading text-[15px] font-bold leading-tight">{SAMPLE_COMPANY.name}</p>
                  </div>
                  <StatusChip status={score.band} />
                </div>
                <ReportScore score={score} />
                <p aria-live="polite" className="border-b border-ew-rule-soft px-4 py-2 text-[12.5px] text-ew-ink-soft">
                  {score.why}
                </p>
                <ul className="min-h-[86px] px-4 py-2">
                  {progress.flags.length === 0 && <li className="py-1 text-[12.5px] text-ew-muted">Waiting for a verified signal…</li>}
                  {progress.flags.map((f) => (
                    <li
                      key={f.id}
                      className={`-mx-2 flex items-baseline justify-between gap-3 rounded-sm px-2 py-1 text-[13px] transition-colors duration-1000 ${
                        landed === f.id ? "bg-sky-100" : "bg-transparent"
                      }`}
                      onTransitionEnd={() => setLanded((l) => (l === f.id ? null : l))}
                    >
                      <span className="font-semibold">{f.title}</span>
                      <span className="shrink-0 text-[12px] text-ew-muted">{f.when}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-ew-rule bg-ew-paper px-4 py-2">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Activity log</p>
                  <ol aria-live="polite" className="mt-1 space-y-0.5 font-mono text-[11px] leading-snug">
                    {log.map((e) => (
                      <li key={e.key} className="flex gap-2">
                        <span className="shrink-0 text-ew-muted">{e.stamp}</span>
                        <span className="shrink-0 font-semibold" style={{ color: css(LANE_COLORS[e.lane].map((v) => Math.round(v * 0.62))) }}>
                          {e.stage}
                        </span>
                        <span className="min-w-0 truncate text-ew-ink-soft">{e.text}</span>
                      </li>
                    ))}
                    {log.length === 0 && <li className="text-ew-muted">Starting…</li>}
                  </ol>
                </div>
              </div>
            </div>
            <Tooltip tip={tip} />
          </div>
        </figure>

      </section>
    </div>
  );
}

// Sample flags as the app would store them: the CFO exit and WARN notice are strong, late payments weak.
const FLAG_SEVERITY = { cfo: "strong", warn: "strong", late: "weak" };
const FLAG_DATE = { cfo: "2026-09-10", warn: "2026-09-24", late: "2026-08-31" };
function flagSignal(f) {
  return {
    type: f.id === "cfo" ? "exec_departure" : "legal_layoffs",
    severity: FLAG_SEVERITY[f.id] ?? "weak",
    date: FLAG_DATE[f.id] ?? "2026-09-01",
    title: f.title,
    source_name: f.source,
  };
}

const SCORE_BAR = { red: "bg-ew-red", yellow: "bg-ew-amber", green: "bg-ew-green" };

/** Warning score in the report: number, bar with the Yellow and Red lines. */
function ReportScore({ score }) {
  return (
    <div className="border-b border-ew-rule-soft px-4 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Warning score</span>
        <span className="ml-auto font-heading text-[22px] font-bold tabular-nums leading-none">{score.score}</span>
        <span className="text-[12px] text-ew-muted">/ 100</span>
      </div>
      <div
        role="meter"
        aria-label="Warning score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score.score}
        className="relative mt-1.5 h-1.5 rounded-sm bg-ew-rule"
      >
        <div className={`h-full rounded-sm transition-[width] duration-700 ${SCORE_BAR[score.band]}`} style={{ width: `${Math.max(score.score, 1)}%` }} />
        {[SCORE_BANDS.yellow, SCORE_BANDS.red].map((t) => (
          <span key={t} aria-hidden="true" className="absolute top-[-2px] h-[10px] w-px bg-ew-ink-soft" style={{ left: `${t}%` }} />
        ))}
      </div>
    </div>
  );
}

/** The applicant being entered: types the company, then shows its domain and city. */
function ApplicantInput() {
  const name = SAMPLE_COMPANY.name;
  const [n, setN] = useState(() => (prefersReducedMotion() ? name.length : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const t = setInterval(() => setN((v) => (v >= name.length ? v : v + 1)), 55);
    return () => clearInterval(t);
  }, [name]);
  const done = n >= name.length;
  return (
    <div className="rounded-sm border border-white/30 bg-white/[0.06] px-2.5 py-1.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/55">Input · applicant</p>
      <p className="truncate font-mono text-[12px] text-white">
        {name.slice(0, n)}
        <span aria-hidden="true" className={`ml-px inline-block h-3 w-[6px] translate-y-[1px] bg-white ${done ? "opacity-0" : "animate-pulse"}`} />
      </p>
      <p className={`truncate text-[11px] text-white/55 transition-opacity duration-300 ${done ? "opacity-100" : "opacity-0"}`}>
        {SAMPLE_COMPANY.place} · searching 5 sources
      </p>
    </div>
  );
}


function shorten(text, max = 40) {
  const t = String(text).replace(/\s*·.*$/, "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ------------------------------------------------------------------ 2. Waves
const RING_NAMES = ["", "Search", "Read", "Tag", "Verify", "Company"];
const RING_RULES = [
  "",
  "Every signal travels from the rim.",
  "Fronts carry on: the full text is read.",
  "A front passes only where 2 neighbours fire: AI marks what matters.",
  "Needs 2 neighbours and passes the quote check; weak fronts break up.",
  "Signals that arrive here land in the credit file.",
];
const CX = 0.66;
const CY = 0.54;
const RF = 0.6;

export function WavesHero() {
  const progress = useFlagProgress();
  const [geo, setGeo] = useState(null);
  const { canvasRef, sceneRef } = useCanvasScene(
    () => wavesScene({ onSignal: progress.onSignal, cxFrac: CX, cyFrac: CY, rFrac: RF }),
    { fps: 16, onLayout: (scene, w, h) => setGeo({ ...scene.geometry(), w, h }) }
  );
  const describe = useCallback((p) => {
    const source = SOURCES[p.sector]?.label ?? "";
    const ring = RING_NAMES[p.ring] ?? "";
    if (p.ring === 5) return { kicker: "Company", title: SAMPLE_COMPANY.name, body: RING_RULES[5] };
    if (p.empty) return { kicker: `${ring} ring · ${source} side`, title: `${ring}`, body: RING_RULES[p.ring] };
    return {
      kicker: `${ring} ring · from ${source}`,
      title: p.state === "front" ? itemFor(p.sector, Math.round(p.x + p.y)) : "Checked, settling",
      body: RING_RULES[p.ring],
    };
  }, []);
  const { tip, handlers } = useProbe(sceneRef, describe);

  const labelAt = (r, angle) =>
    geo && {
      left: Math.min(geo.w - 60, Math.max(60, geo.cx + Math.cos(angle) * r)),
      top: Math.min(geo.h - 16, Math.max(16, geo.cy + Math.sin(angle) * r)),
    };

  return (
    <Stage>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-crosshair" {...handlers} />
      {geo &&
        RING_NAMES.slice(1, 5).map((name, i) => {
          const r = ((RING_EDGES[i] + RING_EDGES[i + 1]) / 2) * geo.R;
          const pos = labelAt(r, Math.PI * 0.08); // just right of the bottom-right diagonal, clear of the intro
          return (
            <Pill key={name} className="-translate-x-1/2 -translate-y-1/2" style={pos}>
              {name}
            </Pill>
          );
        })}
      {/* Input: each source feeds one sector of the rim. */}
      {geo &&
        SOURCES.map((s, l) => {
          const a = ((l + 0.5) / LANES) * Math.PI * 2 - Math.PI / 2;
          return (
            <Pill key={s.label} className="-translate-x-1/2 -translate-y-1/2 text-white/70" style={labelAt(geo.R * 1.08, a)}>
              {s.label}
            </Pill>
          );
        })}
      {geo && (
        <div className="pointer-events-none absolute w-[200px] -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: geo.cx, top: geo.cy }}>
          <p className="font-heading text-[13px] font-bold leading-tight">{SAMPLE_COMPANY.name}</p>
          <StatusChip status={progress.status} className="mt-1.5" />
        </div>
      )}
      <div className="pointer-events-none absolute left-[4%] top-1/2 flex w-[min(380px,32%)] -translate-y-1/2 flex-col gap-5">
        <Intro />
        <LiveFile progress={progress} />
      </div>
      <Tooltip tip={tip} />
    </Stage>
  );
}

// ------------------------------------------------------------------ 3. Sandpile
const statusFor = (score) => (score >= 70 ? "red" : score >= 30 ? "yellow" : "green");
const SCX = 0.64;
const SCY = 0.54;
const SRF = 0.44;

export function SandpileHero() {
  const [score, setScore] = useState(0);
  const [drops, setDrops] = useState(0);
  const [geo, setGeo] = useState(null);
  const onScore = useMemo(() => {
    let last = -1;
    let lastDrops = -1;
    return (s, d) => {
      if (s !== last) {
        last = s;
        setScore(s);
      }
      if (d !== lastDrops) {
        lastDrops = d;
        setDrops(d);
      }
    };
  }, []);
  const { canvasRef, sceneRef } = useCanvasScene(() => sandpileScene({ onScore, cxFrac: SCX, cyFrac: SCY, rFrac: SRF }), {
    fps: 30,
    warmup: 400,
    onLayout: (scene, w, h) => setGeo({ ...scene.geometry(), w, h }),
  });
  const describe = useCallback((p) => {
    const reach = Math.round(p.distance * 100);
    const zone = reach >= 70 ? "Red zone" : reach >= 30 ? "Yellow zone" : "Green zone";
    const flag = FLAGS[(p.drops + Math.round(p.distance * 7)) % FLAGS.length];
    if (!p.height && !p.toppling) return { kicker: `${zone} · reach ${reach}`, title: "No evidence here yet", body: "The pile has to grow this far to push the score here." };
    return {
      kicker: `${zone} · reach ${reach}`,
      title: `Evidence from: ${flag.title} (${flag.when})`,
      body: p.toppling ? "Avalanche: this cell hit 4 grains and is spilling to its neighbours." : `${p.height} of 4 grains. One more and it topples.`,
    };
  }, []);
  const { tip, handlers } = useProbe(sceneRef, describe);
  const status = statusFor(score);
  const latest = drops ? FLAGS[(drops - 1) % FLAGS.length] : null;

  return (
    <Stage>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-crosshair" {...handlers} />
      {geo && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
          {[
            { r: 0.3, label: "Yellow 30" },
            { r: 0.7, label: "Red 70" },
            { r: 1, label: "100" },
          ].map((t) => (
            <g key={t.label}>
              <circle cx={geo.cx} cy={geo.cy} r={t.r * geo.R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 5" />
              <text x={geo.cx + t.r * geo.R + 6} y={geo.cy - 4} fontSize="11" fontWeight="600" fill="rgba(255,255,255,0.65)">
                {t.label}
              </text>
            </g>
          ))}
        </svg>
      )}
      {/* Input: where verified signals land. */}
      {geo && (
        <Pill className="-translate-x-1/2" style={{ left: geo.cx, top: Math.max(12, geo.cy - geo.R - 34) }}>
          {latest ? `Verified signal dropped: ${latest.title}` : "Verified signals drop here"} ↓
        </Pill>
      )}
      <div className="pointer-events-none absolute left-[4%] top-1/2 flex w-[min(380px,32%)] -translate-y-1/2 flex-col gap-5">
        <Intro />
        <div className="pointer-events-auto rounded-sm border border-white/10 bg-ew-ink/90 p-5 backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Warning score · sample</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-heading text-5xl font-bold tabular-nums">{score}</span>
            <span className="text-white/50">/ 100</span>
            <StatusChip status={status} className="ml-auto" />
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-white/65">
            Each verified signal adds evidence. Piles topple into avalanches; how far they reach is the score.
          </p>
        </div>
      </div>
      <Tooltip tip={tip} />
    </Stage>
  );
}
