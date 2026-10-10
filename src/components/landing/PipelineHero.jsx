import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { LANES, LANE_COLORS, encodeText, pipelineScene } from "./caScenes";
import { prefersReducedMotion } from "./motion";
import { SAMPLE_APPLICANTS } from "./sampleApplicants";
import { useCanvasScene, useFlagProgress } from "./useCanvasScene";
import AsciiField from "./AsciiField";
import { BANDS as SCORE_BANDS, warningScore } from "@/lib/warningScore.ts";

// The landing hero: Kestrel's workflow as a cellular automaton.
//   left    "Screen new applicant", like the app's form: pick a sample company and watch it typed in
//   middle  its five sources feed in on the left edge, then Search -> Read -> Tag -> Verify, each stage with its
//           own rule and an animated gate; hover any cell to see what it is
//   right   the report: status, warning score, flags as verified signals land, and an activity log
// Sample companies and items are fictional (sampleApplicants.js) and labelled as samples.

const SOURCE_LABELS = ["News", "Court filings", "Job posts", "Reviews", "LinkedIn"];
const STAGES = [
  { title: "Search", body: "Find every mention" },
  { title: "Read", body: "Pull the full text" },
  { title: "Tag", body: "AI marks what matters" },
  { title: "Verify", body: "Same company, exact quote" },
];
const GUTTER = 210; // sources column: example items sliding into their lanes
const HEADER = 72; // stage titles above the cells
const EXIT = 1; // the pipeline runs the full frame; its exit gate is the frame's right edge
const FPS = 14;
const MS_PER_COLUMN = (2 * 1000) / FPS; // the conveyor moves one column every other step
const css = ([r, g, b], a = 1) => `rgba(${r},${g},${b},${a})`;

function shorten(text, max = 40) {
  const t = String(text).replace(/\s*·.*$/, "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ------------------------------------------------------------------ small pieces
const STATUS = {
  green: { label: "Green", cls: "border-ew-green-rule bg-ew-green-bg text-ew-green" },
  yellow: { label: "Yellow", cls: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber" },
  red: { label: "Red", cls: "border-ew-red-rule bg-ew-red-bg text-ew-red" },
};

function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.green;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[13px] font-semibold ${s.cls}`}>
      <span aria-hidden="true" className="h-2 w-2 rounded-[1px] bg-current" />
      {s.label}
    </span>
  );
}

const SCORE_BAR = { red: "bg-ew-red", yellow: "bg-ew-amber", green: "bg-ew-green" };

/** Warning score in the report: number and a bar with the Yellow and Red lines. */
function ReportScore({ score }) {
  return (
    <div className="border-b border-ew-rule-soft px-4 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Warning score</span>
        <span className="ml-auto font-heading text-[22px] font-bold tabular-nums leading-none">{score.score}</span>
        <span className="text-[12px] text-ew-muted">/ 100</span>
      </div>
      <div role="meter" aria-label="Warning score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.score} className="relative mt-1.5 h-1.5 rounded-sm bg-ew-rule">
        <div className={`h-full rounded-sm transition-[width] duration-700 ${SCORE_BAR[score.band]}`} style={{ width: `${Math.max(score.score, 1)}%` }} />
        {[SCORE_BANDS.yellow, SCORE_BANDS.red].map((t) => (
          <span key={t} aria-hidden="true" className="absolute top-[-2px] h-[10px] w-px bg-ew-ink-soft" style={{ left: `${t}%` }} />
        ))}
      </div>
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
      <span aria-hidden="true" className="pointer-events-none absolute z-20 h-3 w-3 -translate-x-1/2 rounded-[2px] border border-white" style={{ left: tip.x, top: tip.y - 1 }} />
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

/** One example item: slides right through the edge while its cells feed into the lane at the same rate. */
function InputChip({ job }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const raf = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const col = LANE_COLORS[job.lane];
  return (
    <div className="relative h-[30px] overflow-hidden">
      <p
        className="absolute inset-y-0 left-0 flex w-full items-center rounded-sm border px-2 text-[11.5px] text-white/90"
        style={{
          borderColor: css(col, 0.6),
          background: css(col, 0.14),
          transform: go ? "translateX(102%)" : "translateX(0)",
          transition: `transform ${job.ms}ms linear`,
        }}
      >
        <span className="truncate">{job.text}</span>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the form on the left
function useTyped(texts, key) {
  const total = texts.reduce((n, t) => n + t.length, 0);
  const [n, setN] = useState(() => (prefersReducedMotion() ? total : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setN(total);
      return undefined;
    }
    setN(0);
    const t = setInterval(() => setN((v) => (v >= total ? v : v + 1)), 38);
    return () => clearInterval(t);
  }, [key, total]);
  let left = n;
  const out = texts.map((t) => {
    const shown = t.slice(0, Math.max(0, left));
    left -= t.length;
    return shown;
  });
  return { values: out, done: n >= total, active: texts.findIndex((t, i) => out[i].length < t.length) };
}

/** A read-only input that looks like the app's form field, highlighted while it is being typed. */
function TypedField({ id, label, value, active, mono = false }) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-[12.5px] font-medium text-ew-ink">{label}</span>
      <input
        id={id}
        readOnly
        tabIndex={-1}
        value={value}
        className={`mt-1 h-9 w-full rounded-sm border bg-white px-2.5 text-[13.5px] text-ew-ink outline-none ${
          active ? "border-ew-focus ring-2 ring-ew-focus/25" : "border-ew-rule"
        } ${mono ? "font-mono text-[12.5px]" : ""}`}
      />
    </label>
  );
}

const CLEAN_CHECK_MS = 9000; // a company with nothing to flag still takes a moment to check

function ApplicantForm({ company, onSelect, progress, runKey }) {
  const fields = [company.name, company.domain, company.city, company.state];
  const typed = useTyped(fields, runKey);
  const [cleanDone, setCleanDone] = useState(false);
  useEffect(() => {
    setCleanDone(false);
    if (company.flags.length || !typed.done) return undefined;
    const t = setTimeout(() => setCleanDone(true), CLEAN_CHECK_MS);
    return () => clearTimeout(t);
  }, [company, typed.done, runKey]);
  const finished = company.flags.length ? progress.done : cleanDone;
  const phase = !typed.done ? "typing" : finished ? "ready" : "screening";
  return (
    <div className="flex h-full flex-col rounded-sm border border-white/10 bg-white text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
      <div className="border-b border-ew-rule px-4 py-3">
        <p className="font-heading text-[16px] font-bold leading-tight">Screen new applicant</p>
        <p className="text-[12px] text-ew-muted">Sample companies, fictional</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        <label htmlFor="sample-applicant" className="block">
          <span className="text-[12.5px] font-medium text-ew-ink">Sample applicant</span>
          <select
            id="sample-applicant"
            value={company.id}
            onChange={(e) => onSelect(e.target.value)}
            className="mt-1 h-9 w-full rounded-sm border border-ew-rule bg-ew-paper px-2 text-[13.5px] text-ew-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus"
          >
            {SAMPLE_APPLICANTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="border-t border-ew-rule-soft" />
        <TypedField id="sample-name" label="Company name" value={typed.values[0]} active={typed.active === 0} />
        <TypedField id="sample-domain" label="Website domain" value={typed.values[1]} active={typed.active === 1} mono />
        <div className="grid grid-cols-[1fr_72px] gap-3">
          <TypedField id="sample-city" label="HQ city" value={typed.values[2]} active={typed.active === 2} />
          <TypedField id="sample-state" label="HQ state" value={typed.values[3]} active={typed.active === 3} />
        </div>
        <div className="mt-auto pt-2">
          <div
            aria-live="polite"
            className={`flex h-10 w-full items-center justify-center gap-2 rounded-sm text-[14px] font-semibold transition-colors ${
              phase === "typing" ? "bg-ew-ink/40 text-white" : "bg-ew-ink text-white"
            }`}
          >
            {phase === "typing" && "Save and check"}
            {phase === "screening" && (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Checking 5 sources…
              </>
            )}
            {phase === "ready" && (
              <>
                <Check aria-hidden="true" className="h-4 w-4" /> Report ready
              </>
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-ew-muted">{company.detail}</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the pipeline and report
function PipelineRun({ company, onProgress }) {
  const progress = useFlagProgress(company.flags);
  const [log, setLog] = useState([]);
  const [pulse, setPulse] = useState([0, 0, 0, 0]);
  const [jobs, setJobs] = useState([]); // input chips, at most one per lane
  const [landed, setLanded] = useState(null);
  const startRef = useRef(performance.now());
  const regionRef = useRef(null);
  const reportRef = useRef(null);
  const itemFor = useCallback((lane, id = 0) => {
    const items = company.items[lane] ?? [];
    return items[Math.abs(id) % items.length] ?? "";
  }, [company]);

  useEffect(() => onProgress?.({ cycle: progress.cycle, done: progress.done }), [progress.cycle, progress.done, onProgress]);

  const addLog = useCallback((lane, stage, text) => {
    const s = Math.floor((performance.now() - startRef.current) / 1000);
    const stamp = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    setLog((l) => [...l.slice(-17), { key: `${s}-${Math.random()}`, stamp, lane, stage, text }]);
  }, []);
  const bump = useCallback((stage) => setPulse((p) => p.map((v, i) => (i === stage ? v + 1 : v))), []);

  const { canvasRef, sceneRef } = useCanvasScene(
    () =>
      pipelineScene({
        exitFrac: EXIT,
        top: HEADER,
        verifyPass: company.verifyPass,
        onMark: ({ lane, id }) => {
          bump(2);
          addLog(lane, "Tag", `${SOURCE_LABELS[lane]}: ${shorten(itemFor(lane, id))} marked relevant`);
        },
        onDrop: ({ lane, id }) => {
          bump(3);
          addLog(lane, "Verify", `${SOURCE_LABELS[lane]}: not confirmed, dropped ${shorten(itemFor(lane, id), 26)}`);
        },
        onSignal: ({ lane }) => {
          bump(3);
          const flag = progress.onSignal();
          if (flag) {
            setLanded(flag.id);
            addLog(lane, "Report", `Verified: ${flag.title} added to the report`);
          }
        },
      }),
    { fps: FPS }
  );

  // Verified cells fly to the report's flag list.
  useEffect(() => {
    const place = () => {
      const region = regionRef.current?.getBoundingClientRect();
      const report = reportRef.current?.getBoundingClientRect();
      // The report is a separate panel to the right; verified cells fly to the frame's edge level with its flags.
      if (region && report) sceneRef.current?.setTarget({ x: region.width - 4, y: report.top - region.top + 170 });
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

  // Example items: one lane at a time slides an item through the edge while its cells feed in.
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let n = 0;
    const timers = [];
    const launch = () => {
      const lane = n % LANES;
      const id = Math.floor(n / LANES);
      n += 1;
      const text = shorten(itemFor(lane, id), 44);
      const bits = encodeText(text, 9, 14);
      const ms = bits[0].length * MS_PER_COLUMN;
      const key = `${lane}-${n}`;
      setJobs((js) => [...js.filter((j) => j.lane !== lane), { key, lane, text, ms }]);
      sceneRef.current?.inject(lane, bits);
      bump(0);
      addLog(lane, "Search", `${SOURCE_LABELS[lane]}: found “${shorten(text, 30)}”`);
      timers.push(
        setTimeout(() => bump(1), ms + 900),
        setTimeout(() => setJobs((js) => js.filter((j) => j.key !== key)), ms + 120)
      );
    };
    const first = setTimeout(launch, 900); // after the form has typed the company in
    const every = setInterval(launch, 1500);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      timers.forEach(clearTimeout);
    };
  }, [sceneRef, addLog, bump, itemFor]);

  const describe = useCallback(
    (p) => {
      const source = SOURCE_LABELS[p.lane] ?? "";
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
    },
    [itemFor]
  );
  const { tip, handlers } = useProbe(sceneRef, describe);

  // Status, score and why line from the app's own scoring for the flags landed so far.
  const score = useMemo(
    () => warningScore(progress.flags.map((f) => ({ type: f.type, severity: f.severity, date: f.date, title: f.title, source_name: f.source }))),
    [progress.flags]
  );

  return (
    <>
    <div data-ascii-clear className="min-w-0">
    <figure aria-label={`How Kestrel checks ${company.name}: sources, search, read, tag, verify, report`} className="relative h-[clamp(580px,74vh,740px)] overflow-hidden rounded-sm border border-white/10 bg-black/10 lg:h-full">
      {/* Sources column: each source's example item sliding into its lane. */}
      <div className="absolute bottom-0 left-0 top-0 border-r border-white/10" style={{ width: GUTTER }}>
        <div className="flex flex-col justify-end px-3 pb-2" style={{ height: HEADER }}>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-white/45">SOURCES</p>
          <p className="truncate text-[12px] text-white/60">{company.name}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 grid" style={{ top: HEADER, gridTemplateRows: `repeat(${LANES}, minmax(0, 1fr))` }}>
          {SOURCE_LABELS.map((label, lane) => {
            const job = jobs.find((j) => j.lane === lane);
            return (
              <div key={label} className="flex flex-col justify-center gap-1 border-t border-white/5 px-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white/85">
                  <span aria-hidden="true" className="h-2 w-2 rounded-[2px]" style={{ background: css(LANE_COLORS[lane]) }} />
                  {label}
                  <span aria-hidden="true" className="ml-auto text-white/35">→</span>
                </p>
                {job ? <InputChip key={job.key} job={job} /> : <div className="h-[30px]" />}
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

        <Tooltip tip={tip} />
      </div>
    </figure>
    </div>

    {/* Report: its own panel, same gap and height as the form on the left. */}
    <div data-ascii-clear className="min-h-0 min-w-0">
      <aside ref={reportRef} aria-label={`Report for ${company.name}`} className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-white/10 bg-white text-ew-ink shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
        <div className="flex items-start justify-between gap-3 border-b border-ew-rule px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Report · sample</p>
            <p className="font-heading text-[15px] font-bold leading-tight">{company.name}</p>
          </div>
          <StatusChip status={score.band} />
        </div>
        <ReportScore score={score} />
        <p aria-live="polite" className="border-b border-ew-rule-soft px-4 py-2 text-[12.5px] text-ew-ink-soft">
          {score.why}
        </p>
        <ul className="min-h-[86px] px-4 py-2">
          {progress.flags.length === 0 && (
            <li className="py-1 text-[12.5px] text-ew-muted">
              {company.flags.length ? "Waiting for a verified signal…" : "Nothing verified: every item is dropped before the report."}
            </li>
          )}
          {progress.flags.map((f) => (
            <li
              key={f.id}
              className={`-mx-2 flex items-baseline justify-between gap-3 rounded-sm px-2 py-1 text-[13px] transition-colors duration-1000 ${landed === f.id ? "bg-sky-100" : "bg-transparent"}`}
              onTransitionEnd={() => setLanded((l) => (l === f.id ? null : l))}
            >
              <span className="font-semibold">{f.title}</span>
              <span className="shrink-0 text-[12px] text-ew-muted">{f.when}</span>
            </li>
          ))}
        </ul>
        <div className="flex min-h-0 flex-1 flex-col border-t border-ew-rule bg-ew-paper px-4 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ew-muted">Activity log</p>
          <ol aria-live="polite" className="mt-1 flex min-h-0 flex-1 flex-col justify-end space-y-0.5 overflow-hidden font-mono text-[11px] leading-snug">
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
      </aside>
    </div>
    </>
  );
}

// ------------------------------------------------------------------ the hero
export function PipelineHero() {
  const [companyId, setCompanyId] = useState(SAMPLE_APPLICANTS[0].id);
  const [run, setRun] = useState({ cycle: 0, done: false });
  const company = SAMPLE_APPLICANTS.find((c) => c.id === companyId) || SAMPLE_APPLICANTS[0];
  const onProgress = useCallback((p) => setRun((r) => (r.cycle === p.cycle && r.done === p.done ? r : p)), []);
  return (
    // -mt-16 pt-16: the dark background and character field extend up behind the transparent nav.
    <div className="relative -mt-16 overflow-hidden bg-ew-ink pt-16 text-white">
      {/* Page-wide character field (fixed behind the viewport; covers every section). */}
      <AsciiField />
      {/* Stage titles pulse when something happens in that stage. Self-contained keyframes. */}
      <style>{"@keyframes kestrelPulse{0%{color:#fff;text-shadow:0 0 14px rgba(255,255,255,.9)}100%{text-shadow:0 0 0 rgba(255,255,255,0)}}"}</style>
      <section aria-labelledby="hero-heading" className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-8">
        {/* Visible heading removed by design (the nav shows Kestrel); kept for screen readers. */}
        <h1 id="hero-heading" className="sr-only">
          Kestrel, private company screener
        </h1>
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px] lg:grid-rows-[clamp(580px,74vh,740px)]">
          <div data-ascii-clear className="min-w-0">
          <ApplicantForm
            company={company}
            onSelect={(id) => {
              setCompanyId(id);
              setRun({ cycle: 0, done: false });
            }}
            progress={run}
            runKey={`${company.id}-${run.cycle}`}
          />
          </div>
          <PipelineRun key={company.id} company={company} onProgress={onProgress} />
        </div>
      </section>
    </div>
  );
}
