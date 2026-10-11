import React, { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, FileCheck2, FileText, Pause, Play, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';

import WorkflowExample from '@/components/WorkflowExample';

const STEPS = [
  { title: 'Build the company report', label: 'Report', icon: FileText, owner: 'Base44 + fixed scoring rules',
    body: 'Gather public warning signs, match the company, and attach dated quotes and source links. Fixed rules set Red, Yellow or Green.', output: 'Company report + source evidence' },
  { title: 'Audit the evidence', label: 'Audit', icon: ShieldCheck, owner: 'Evidence checks + independent reviewer',
    body: 'Test identity, source evidence, claim support, freshness, duplicates and score consistency. Explain each result and retain the activity log.', output: 'Audit report + confidence assessment', note: 'Devin’s independent findings inform the review; they do not replace officer approval.' },
  { title: 'Request and check documents', label: 'Documents', icon: FileCheck2, owner: 'Company + credit officer',
    body: 'Ask for cash-flow statements, bank statements and a debt schedule early. Inspect lender payments, missed payments and gaps against the public evidence.', output: 'Document evidence + questions to resolve' },
  { title: 'Review the findings manually', label: 'Manual review', icon: UserRound, owner: 'Credit officer',
    body: 'Read the sources, compare the documents, and mark findings Confirmed, Incorrect or Uncertain. Add considerations and rerun when new evidence changes the picture.', output: 'Reviewed findings + decision rationale' },
  { title: 'Confirm and record the decision', label: 'Confirmation', icon: ClipboardCheck, owner: 'Credit officer — not AI',
    body: 'Record the decision, supporting notes and a follow-up date. Request more documents, proceed, watchlist or decline; retain the report and review history.', output: 'Recorded decision + follow-up' },
];

export default function AboutWorkflow() {
  const root = useRef(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(preference.matches); if (preference.matches) setPlaying(false); };
    update(); preference.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    const visibility = () => setPageVisible(!document.hidden);
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => { observer.disconnect(); preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!playing || !visible || !pageVisible || reduced) return undefined;
    const timer = setTimeout(() => setActive(stage => (stage + 1) % STEPS.length), 3300);
    return () => clearTimeout(timer);
  }, [active, playing, visible, pageVisible, reduced]);

  const control = 'inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-rule bg-ew-surface px-2.5 text-xs font-medium hover:bg-ew-hover focus-visible:outline-ew-focus';
  const moving = playing && visible && pageVisible && !reduced;
  const selected = STEPS[active];
  return <section ref={root} aria-labelledby="workflow-heading" className="relative left-1/2 mt-10 w-[calc(100vw-32px)] max-w-[1100px] -translate-x-1/2 border border-ew-rule bg-ew-surface px-4 py-5 sm:px-6 sm:py-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ew-muted">The full workflow</p><h2 id="workflow-heading" className="mt-1 font-heading text-xl font-bold">From report to a human decision.</h2><p className="mt-4 text-[10px] font-semibold uppercase tracking-[.12em] text-ew-muted">0{active + 1} · {selected.owner}</p><h3 className="mt-1 text-sm font-semibold">{selected.title}</h3></div>
      {!reduced && <div className="flex gap-2"><button type="button" className={control} onClick={() => setPlaying(value => !value)}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{playing ? 'Pause' : 'Play'}</button><button type="button" className={control} aria-label="Restart workflow animation" onClick={() => { setActive(0); setPlaying(true); }}><RotateCcw className="h-3.5 w-3.5" /></button></div>}
    </div>
    <p className="mt-4 text-[10px] text-ew-muted md:hidden">Scroll horizontally to follow all five stages →</p>
    <div className="mt-2 overflow-x-auto">
    <div className="relative h-[250px] min-w-[850px]">
      <svg aria-hidden="true" viewBox="0 0 1000 250" preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-ew-focus">
        <defs><marker id="workflow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {[0, 1, 2, 3].map(i => <g key={i}>
          <path d={`M ${138 + i * 200} 82 H ${258 + i * 200}`} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1.5" markerEnd="url(#workflow-arrow)" />
          {moving && [0, 1, 2].map(p => <circle key={p} r={p === 0 ? 3.5 : 2} fill="currentColor" opacity={p === 0 ? .95 : .4}>
            <animateMotion path={`M ${138 + i * 200} 82 H ${258 + i * 200}`} dur="1.1s" begin={`${p * -.36}s`} repeatCount="indefinite" />
          </circle>)}
        </g>)}
        <path d="M 700 150 V 176 Q 700 192 684 192 H 316 Q 300 192 300 176 V 150" stroke="currentColor" strokeOpacity=".3" strokeWidth="1.5" strokeDasharray="4 5" fill="none" markerEnd="url(#workflow-arrow)" />
        {moving && <circle r="3" fill="currentColor"><animateMotion path="M 700 150 V 176 Q 700 192 684 192 H 316 Q 300 192 300 176 V 150" dur="1.65s" repeatCount="indefinite" /></circle>}
      </svg>
    <ol aria-label="Report to confirmation workflow" className="absolute inset-0">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const current = i === active;
        return <li key={step.label} className="absolute top-[24px] w-[160px] -translate-x-1/2 text-center" style={{ left: `${10 + i * 20}%` }}>
          <button type="button" onClick={() => { setActive(i); setPlaying(false); }} aria-current={current ? 'step' : undefined} className="group w-full rounded-sm focus-visible:outline-ew-focus">
            <span className="block text-[10px] font-medium tracking-[.12em] text-ew-muted">0{i + 1}</span>
            <span className={`mx-auto mt-3 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border transition-all duration-700 motion-reduce:transition-none ${current ? 'border-ew-focus bg-ew-focus text-white shadow-[0_0_24px_0_rgba(37,99,235,0.18)]' : 'border-ew-rule bg-ew-paper text-ew-ink group-hover:border-ew-focus'}`}><Icon className="h-6 w-6" /></span>
            <span className="mt-3 block text-sm font-semibold">{step.label}</span>
          </button>
        </li>;
      })}
    </ol>
      <button type="button" className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-ew-surface px-3 text-[11px] text-ew-muted underline underline-offset-4 focus-visible:outline-ew-focus" onClick={() => { setActive(1); setPlaying(false); }}>New evidence → rerun audit</button>
    </div></div>
    <WorkflowExample stage={active} animate={moving} playback={playing && !reduced} onStage={stage => { setActive(stage); setPlaying(false); }} />
  </section>;
}
