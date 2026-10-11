import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, Play, ShieldCheck } from 'lucide-react';
import { Button as SharedButton } from '@/components/ui/button';
import DevinReviewPanel from '@/components/devin/DevinReviewPanel';

// The shared JS forwardRef button does not declare its props for checkJs.
const Button = /** @type {React.ComponentType<any>} */ (SharedButton);

const STAGES = [
  { title: 'Collect the report', detail: 'Freeze claims, quotes, sources and the active considerations.' },
  { title: 'Hand off to a reviewer', detail: 'Send the report to a separate reviewer for independent verification.' },
  { title: 'Run the audit tests', detail: 'Check identity, source text, claim support, dates, duplicates and scoring.' },
  { title: 'Inspect source evidence', detail: 'Record the evidence behind each finding and any limits to verification.' },
  { title: 'Compare the conclusions', detail: 'Show agreements, disagreements and unresolved claims side by side.' },
  { title: 'Publish audit for review', detail: 'Keep the original report and attach the independent findings and logs.' },
];
const EVENTS = [
  ['REPORT', 'Captured the example Kestrel report: 3 claims, 3 source links, original risk Red.'],
  ['HANDOFF', 'Prepared a separate reviewer input with company domain, headquarters and selected considerations. No live review session was started.'],
  ['TESTS', 'Queued six checks: company identity, source evidence, claim support, freshness, duplicates and score consistency.'],
  ['EVIDENCE', 'Example identity test: the supplier lawsuit names Northstar Trading Ltd in London, not the Chicago manufacturer.'],
  ['COMPARE', 'Example disagreement: Kestrel included the supplier lawsuit. Independent reviewer example marks the claim contradicted.'],
  ['RESULT', 'Example audit ready: 1 supported, 1 contradicted, 1 unresolved claim. Excluding the wrong-company claim gives a Yellow review risk preview.'],
];
const SAMPLE_RESULTS = [
  { verdict: 'Supported', claim: 'Northstar Manufacturing CFO steps down', reason: 'The example announcement explicitly names Northstar Manufacturing and its CFO. Identity agrees with the company in the report.', evidence: 'Northstar Manufacturing announced that its chief financial officer will step down.' },
  { verdict: 'Contradicted', claim: 'Northstar faces a supplier lawsuit', reason: 'The example court report identifies Northstar Trading Ltd in London. Its identity conflicts with the Chicago manufacturer, so this claim should be excluded from this company’s review.', evidence: 'A supplier filed a lawsuit against Northstar Trading Ltd, based in London.' },
  { verdict: 'Unresolved', claim: 'Northstar announces planned layoffs', reason: 'The example source describes a proposal subject to consultation, not completed layoffs. The recorded date is also outside the 90-day scoring window.', evidence: 'The company proposed a restructuring plan subject to consultation.' },
];

export default function AuditWorkflow({ preview = false, companyName, onReview, mode = 'audit', borrowerId = '', connected = false, signedOut = false }) {
  const [phase, setPhase] = useState(-1);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);
  const logEnd = useRef(null);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'nearest' }); }, [logs]);
  function replay() {
    timers.current.forEach(clearTimeout);
    setLogs([]); setPhase(0); setRunning(true);
    timers.current = EVENTS.map(([type, message], index) => setTimeout(() => {
      setPhase(index);
      setLogs(ls => [...ls, { time: new Date().toLocaleTimeString(), type, message }]);
      if (index === EVENTS.length - 1) { setPhase(STAGES.length); setRunning(false); }
    }, 700 * (index + 1)));
  }
  const finished = phase === STAGES.length;
  if (mode === 'report') return <section className="mt-6 border border-ew-rule bg-ew-surface p-5" aria-labelledby="original-report-heading"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-ew-muted">Kestrel report · Example</p><h2 id="original-report-heading" className="mt-1 font-heading text-xl font-bold">{companyName}</h2></div><span className="border border-ew-red-rule bg-ew-red-bg px-2 py-1 text-xs font-semibold text-ew-red">Red · 2 strong signals</span></div><p className="mt-4 max-w-2xl text-sm leading-relaxed">The report flags a CFO departure and a supplier lawsuit as strong signals. It also retains an older planned-layoff announcement.</p><div className="mt-5 divide-y divide-ew-rule-soft border-y border-ew-rule-soft">{SAMPLE_RESULTS.map((r, i) => <details key={r.claim} className="py-4"><summary className="cursor-pointer text-sm font-medium">{i + 1}. {r.claim}<span className="ml-2 text-xs font-normal text-ew-muted">{i === 2 ? 'Historical · Weak' : 'Strong'}</span></summary><blockquote className="mt-3 border-l-2 border-ew-rule pl-3 text-sm text-ew-ink-soft">“{r.evidence}”</blockquote><p className="mt-2 text-xs text-ew-muted">Fictional source evidence for this preview.</p></details>)}</div><p className="mt-4 text-xs text-ew-muted">Producer: Kestrel analysis. Open Audit to see the independent reviewer’s findings.</p><Button className="mt-4" onClick={onReview}>Open independent audit<ArrowRight className="ml-2 h-4 w-4" /></Button></section>;
  if (mode !== 'audit') return null;
  if (borrowerId && (connected || signedOut)) return <DevinReviewPanel borrowerId={borrowerId} companyName={companyName} signedOut={signedOut} />;
  return <section className="mt-6 border border-ew-rule bg-ew-surface" aria-labelledby="independent-heading">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ew-rule px-5 py-5">
      <div><p className="text-xs text-ew-muted">{preview ? 'Reviewer · Example' : 'Independent reviewer · Not connected'}</p><h2 id="independent-heading" className="mt-1 font-heading text-xl font-bold">Independent audit</h2><p className="mt-1 text-sm text-ew-muted">Verifies the Kestrel report’s claims against their evidence.</p></div>
      <Button className="h-9 rounded-sm bg-ew-ink hover:bg-ew-ink-soft" onClick={replay} disabled={!preview || running}>{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{running ? 'Replaying example…' : preview ? 'Replay audit workflow' : 'Devin not connected'}</Button>
    </header>
    <div className="p-5">{finished ? <><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm">1 supported · 1 contradicted · 1 unresolved</p><p className="text-xs text-ew-muted">Example review complete</p></div><div className="divide-y divide-ew-rule-soft border-y border-ew-rule-soft">{SAMPLE_RESULTS.map(r => <details key={r.claim} className="py-4"><summary className="flex cursor-pointer items-start justify-between gap-3 text-sm font-medium"><span>{r.claim}</span><span className={`shrink-0 text-xs ${r.verdict === 'Contradicted' ? 'text-ew-red' : r.verdict === 'Supported' ? 'text-ew-green' : 'text-ew-amber'}`}>{r.verdict}</span></summary><p className="mt-3 text-sm text-ew-ink-soft"><span className="font-semibold">Audit reasoning: </span>{r.reason}</p><blockquote className="mt-2 border-l-2 border-ew-rule pl-3 text-xs text-ew-muted">“{r.evidence}”</blockquote></details>)}</div><Button variant="outline" className="mt-4" onClick={onReview}>Edit considerations & rerun</Button></> : <div className="flex min-h-[120px] flex-col items-center justify-center text-center"><ShieldCheck className="mb-2 h-6 w-6 text-ew-muted" /><p className="text-sm font-medium">{running ? 'Independent review example in progress' : 'No independent audit yet'}</p><p className="mt-2 max-w-sm text-xs leading-relaxed text-ew-muted">{preview ? 'Replay the workflow to see the example findings. Open the log below to watch each step.' : 'Connect a live reviewer to receive independent audit findings.'}</p></div>}</div>
    <details className="border-t border-ew-rule" open={running || undefined}><summary className="cursor-pointer px-5 py-4 text-sm font-medium">Workflow & activity log <span className="ml-2 text-xs font-normal text-ew-muted">{finished ? '6 steps complete' : running ? 'In progress' : '6 steps'}</span></summary><div className="grid gap-5 px-5 pb-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]">
      <div><h3 className="text-sm font-semibold">Audit workflow</h3><ol className="mt-4 space-y-3">{STAGES.map((s, i) => {
        const done = phase > i; const active = phase === i;
        return <li key={s.title} className="flex gap-3"><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${done ? 'border-ew-green-rule bg-ew-green-bg text-ew-green' : active ? 'border-ew-focus text-ew-focus' : 'border-ew-rule text-ew-muted'}`}>{done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}</span><div><p className="text-sm font-medium">{s.title}<span className="ml-2 text-xs font-normal text-ew-muted">{done ? 'Done' : active ? 'Working' : 'Waiting'}</span></p><p className="mt-0.5 text-xs leading-relaxed text-ew-muted">{s.detail}</p></div></li>;
      })}</ol></div>
      <div><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Activity log</h3><span className="text-xs text-ew-muted">{preview ? 'Example events' : 'No session started'}</span></div><div role="log" aria-live="polite" aria-label="Independent audit activity log" className="mt-4 h-[290px] overflow-y-auto border border-ew-rule bg-ew-ink p-4 font-mono text-xs leading-relaxed text-white/85">{!logs.length && <p className="text-white/50">{preview ? 'Ready. Press “Replay audit workflow” to watch the stages and logs.' : 'Waiting for a live reviewer.'}</p>}{logs.map((l, i) => <div key={i} className="mb-3"><p><span className="text-white/45">{l.time}</span><span className="ml-2 text-teal-300">[PREVIEW · {l.type}]</span></p><p className="mt-1">{l.message}</p></div>)}<div ref={logEnd} /></div></div>
    </div></details>
  </section>;
}
