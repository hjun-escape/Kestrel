import React, { useCallback, useMemo, useRef, useState } from "react";
import LandingCtas from "./LandingCtas";
import { FLAGS, SAMPLE_COMPANY } from "./heroData";
import { LANES, RING_EDGES, pipelineScene, sandpileScene, wavesScene } from "./caScenes";
import { useCanvasScene, useFlagProgress } from "./useCanvasScene";

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
      <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-white/60">Early Warning</p>
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
const EXIT = 0.68; // share of the width the pipeline runs across; the right side holds the intro and file
const HEADER = 76; // px reserved at the top for stage titles

export function PipelineHero() {
  const progress = useFlagProgress();
  const { canvasRef, sceneRef } = useCanvasScene(() => pipelineScene({ onSignal: progress.onSignal, exitFrac: EXIT, top: HEADER }), { fps: 14 });
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
      ? { kicker: `Verify · ${source}`, title: item, body: "Same company and the quote is word for word in the source. Heading to the file." }
      : { kicker: `Verify · ${source}`, title: item, body: "Failed the check: dropped." };
  }, []);
  const { tip, handlers } = useProbe(sceneRef, describe);

  return (
    <Stage>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-crosshair" {...handlers} />
      {/* Stage titles above the cells. */}
      <ol className="pointer-events-none absolute left-0 top-0 grid grid-cols-4" style={{ width: `${EXIT * 100}%`, height: HEADER }}>
        {STAGES.map((s, i) => (
          <li key={s.title} className="flex flex-col justify-end border-l border-white/10 px-4 pb-2 first:border-l-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45">0{i + 1}</p>
            <p className="font-heading text-[17px] font-bold leading-tight text-white">{s.title}</p>
            <p className="text-[12px] text-white/55">{s.body}</p>
          </li>
        ))}
      </ol>
      {/* Input: the five sources feeding in on the left edge. */}
      {SOURCES.map((s, i) => (
        <Pill key={s.label} className="left-3" style={{ top: `calc(${HEADER}px + (100% - ${HEADER}px) * ${(i + 0.5) / LANES})`, transform: "translateY(-50%)" }}>
          {s.label} →
        </Pill>
      ))}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex flex-col justify-center gap-5 px-6" style={{ width: `${(1 - EXIT) * 100}%` }}>
        <Intro />
        <LiveFile progress={progress} />
      </div>
      <Tooltip tip={tip} />
    </Stage>
  );
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
