import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, ExternalLink, Loader2, X } from 'lucide-react';
import { AUDIT_CHECKS } from '@/lib/auditCheckDefinitions';
import { checkTone } from '@/lib/auditMetrics';
import { Dialog, DialogContent as SharedDialogContent, DialogTitle as SharedDialogTitle, DialogDescription as SharedDialogDescription } from '@/components/ui/dialog';

const DialogContent = /** @type {React.ComponentType<any>} */ (SharedDialogContent);
const DialogTitle = /** @type {React.ComponentType<any>} */ (SharedDialogTitle);
const DialogDescription = /** @type {React.ComponentType<any>} */ (SharedDialogDescription);

// Audit steps in three sub tabs: Steps (steps and the six checks), Activity log (each entry opens
// in a modal with the results behind it) and Report. Colour always comes with a text label.

const STEPS = ['Collect report', 'Check each quote', 'Recount status', 'Write summary'];
const TONE = {
  green: { card: 'border-ew-green-rule bg-ew-green-bg', text: 'text-ew-green', tag: 'border-ew-green-rule bg-ew-green-bg text-ew-green', label: 'All passed' },
  amber: { card: 'border-ew-amber-rule bg-ew-amber-bg', text: 'text-ew-amber', tag: 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber', label: 'Needs review' },
  red: { card: 'border-ew-red-rule bg-ew-red-bg', text: 'text-ew-red', tag: 'border-ew-red-rule bg-ew-red-bg text-ew-red', label: 'Failed' },
  blue: { card: 'border-ew-rule bg-ew-surface', text: 'text-ew-focus', tag: 'border-[#b9c8f0] bg-[#eef2fc] text-ew-focus', label: 'Info' },
  none: { card: 'border-ew-rule bg-ew-surface', text: 'text-ew-muted', tag: 'border-ew-rule bg-ew-none-bg text-ew-none', label: 'Waiting' },
};
const STATUS_TONE = { red: 'red', yellow: 'amber', green: 'green' };
const VERDICT = { pass: ['Pass', 'green'], fail: ['Fail', 'red'], needs_review: ['Needs review', 'amber'] };

const counts = results => ({ pass: results.filter(t => t.verdict === 'pass').length, fail: results.filter(t => t.verdict === 'fail').length, review: results.filter(t => t.verdict === 'needs_review').length });

function Counts({ results }) {
  const c = counts(results);
  return <p className="flex flex-wrap gap-x-2 text-[11px] font-medium tabular-nums"><span className="text-ew-green">{c.pass} passed</span><span className="text-ew-muted">·</span><span className={c.fail ? 'text-ew-red' : 'text-ew-muted'}>{c.fail} failed</span><span className="text-ew-muted">·</span><span className={c.review ? 'text-ew-amber' : 'text-ew-muted'}>{c.review} could not confirm</span></p>;
}

/** What a log entry is about, for its colour and label. */
function entryInfo(log, tests) {
  if (log.kind === 'check') {
    const check = AUDIT_CHECKS.find(c => c.key === log.check);
    return { tone: checkTone(tests.filter(t => t.check === log.check)), label: check?.title || 'Check', check };
  }
  if (log.kind === 'result') return { tone: STATUS_TONE[log.status] || 'blue', label: 'Status result' };
  if (log.kind === 'error') return { tone: 'red', label: 'Stopped' };
  if (log.kind === 'done') return { tone: 'green', label: 'Saved' };
  return { tone: 'blue', label: 'Step' };
}

export default function AuditRunProgress({ phase, logs, failed, running, tests = [], revealed = 0, report = null, onRun = null, canRun = true }) {
  const [tab, setTab] = useState(report ? 'report' : 'progress');
  const [openLog, setOpenLog] = useState(null);
  // Watch the progression while a run is going; land on the report when it finishes.
  useEffect(() => { if (running) setTab('progress'); else if (report && phase >= 4) setTab('report'); }, [running, phase, report]);
  useEffect(() => { if (!report && tab === 'report') setTab('progress'); }, [report, tab]);
  // Nothing has run yet: say so once, instead of green steps above cards that all say "Waiting".
  if (phase < 0 && !tests.length) {
    return <section className="border-b border-ew-rule bg-ew-paper px-5 py-5" aria-label="Audit status">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${TONE.none.tag}`}>Not run yet</span>No audit has been run for this report</h3>
      <p className="mt-2 max-w-[70ch] text-sm text-ew-ink-soft">The audit confirms each quote, date and company match, and recounts the status with fixed rules. It takes about 20 seconds.</p>
      {onRun && <button type="button" onClick={onRun} disabled={!canRun} className="mt-3 inline-flex h-9 items-center rounded-sm bg-ew-ink px-3.5 text-sm font-medium text-white hover:bg-ew-ink-soft disabled:opacity-50">Run audit</button>}
    </section>;
  }

  const tabs = [['progress', 'Steps'], ['log', `Activity log (${logs.length})`], ...(report ? [['report', 'Report']] : [])];
  const headTone = failed ? 'red' : running ? 'blue' : phase >= 0 ? 'green' : 'none';
  const opened = openLog == null ? null : logs[openLog];
  const openedInfo = opened && entryInfo(opened, tests);
  const openedTests = opened?.kind === 'check' ? tests.filter(t => t.check === opened.check) : [];

  return <section className="border-b border-ew-rule bg-ew-paper" aria-label="Audit steps">
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><span className={`rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${TONE[headTone].tag}`}>{failed ? 'Stopped' : running ? 'Running' : phase >= 0 ? 'Complete' : 'Saved'}</span>{failed ? 'Audit stopped' : running ? 'Audit in progress' : phase >= 0 ? 'Audit complete' : 'Latest saved audit'}</h3>
      <span className="text-xs text-ew-muted">Checks run by fixed rules</span>
    </div>
    <div role="tablist" aria-label="Audit report sections" className="mt-2 flex gap-5 border-b border-ew-rule px-5">
      {tabs.map(([value, label]) => <button key={value} id={`audit-sub-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`audit-subpanel-${value}`} onClick={() => setTab(value)} className={`border-b-2 py-2.5 text-[13px] font-medium ${tab === value ? 'border-ew-ink text-ew-ink' : 'border-transparent text-ew-muted hover:text-ew-ink'}`}>{label}</button>)}
    </div>

    <div role="tabpanel" id={`audit-subpanel-${tab}`} aria-labelledby={`audit-sub-${tab}`} className="px-5 py-4">
      {tab === 'progress' && <>
        <ol className="grid gap-3 sm:grid-cols-4">{STEPS.map((name, i) => {
          const done = phase < 0 || i < phase;
          return <li key={name} className="flex items-center gap-2 text-xs"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 motion-reduce:transition-none ${done ? 'border-ew-green-rule bg-ew-green-bg text-ew-green' : failed && i === phase ? 'border-ew-red-rule bg-ew-red-bg text-ew-red' : i === phase ? 'border-ew-focus text-ew-focus' : 'border-ew-rule text-ew-muted'}`}>{done ? <Check className="h-3.5 w-3.5" /> : failed && i === phase ? <X className="h-3.5 w-3.5" /> : running && i === phase ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : i + 1}</span>{name}</li>;
        })}</ol>
        <div className="mt-5 flex items-center justify-between text-xs"><p className="font-semibold">What we double-check</p><span className="text-ew-muted">{tests.length ? running ? 'Checks returned · revealing results' : 'Results ready' : failed ? 'No results returned' : 'Waiting for results'}</span></div>
        <div role="progressbar" aria-label="Check results displayed" aria-valuemin={0} aria-valuemax={AUDIT_CHECKS.length} aria-valuenow={revealed} className="mt-2 h-1 overflow-hidden rounded-full bg-ew-rule"><div className="h-full bg-ew-focus transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${revealed / AUDIT_CHECKS.length * 100}%` }} /></div>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{AUDIT_CHECKS.map((check, i) => {
          const done = i < revealed;
          const active = running && tests.length > 0 && i === revealed;
          const results = tests.filter(t => t.check === check.key);
          const tone = done ? checkTone(results) : 'none';
          return <li key={check.key} className={`rounded-sm border border-l-4 p-3 transition-[border-color,background-color,box-shadow,transform] duration-500 ease-out motion-reduce:transition-none ${active ? 'border-ew-focus bg-ew-surface shadow-sm -translate-y-0.5' : TONE[tone].card}`}>
            <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold">{check.title}</h4>{active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ew-focus motion-reduce:animate-none" aria-label="Revealing result" /> : <span className={`rounded-sm border px-1.5 text-[10px] font-semibold leading-4 ${TONE[tone].tag}`}>{done ? TONE[tone].label : 'Waiting'}</span>}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-ew-ink-soft">{check.why}</p>
            <div className={`mt-3 transition-opacity duration-500 motion-reduce:transition-none ${done ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!done}><Counts results={results} /></div>
          </li>;
        })}</ol>
      </>}

      {tab === 'log' && (logs.length ? <ol role="log" aria-label="Audit activity log" aria-live="polite" className="max-h-80 divide-y divide-ew-rule-soft overflow-y-auto rounded-sm border border-ew-rule bg-ew-surface">{logs.map((log, i) => {
        const info = entryInfo(log, tests);
        return <li key={i}><button type="button" onClick={() => setOpenLog(i)} className={`flex w-full items-start gap-3 border-l-4 px-3 py-2 text-left text-[12px] leading-relaxed hover:bg-ew-hover ${TONE[info.tone].card.split(' ')[0]}`}>
          <time className="shrink-0 font-mono text-[11px] text-ew-muted">{log.time}</time>
          <span className={`shrink-0 rounded-sm border px-1.5 text-[10.5px] font-semibold leading-[18px] ${TONE[info.tone].tag}`}>{info.label}</span>
          <span className="min-w-0 flex-1 truncate text-ew-ink-soft">{log.message}</span>
          <ChevronRight aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ew-muted" />
        </button></li>;
      })}</ol> : <p className="text-sm text-ew-muted">No activity in this session. Run the audit to see each step logged.</p>)}

      {tab === 'report' && report}
    </div>

    <Dialog open={!!opened} onOpenChange={o => { if (!o) setOpenLog(null); }}>
      {opened && <DialogContent className="max-h-[85vh] overflow-y-auto rounded-sm border-ew-rule bg-ew-surface text-ew-ink sm:max-w-xl sm:rounded-sm">
        <div className="flex items-center gap-2 pr-6"><span className={`rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${TONE[openedInfo.tone].tag}`}>{openedInfo.label}</span><time className="font-mono text-xs text-ew-muted">{opened.time}</time></div>
        <DialogTitle className="font-heading text-lg font-bold leading-snug">{opened.kind === 'check' ? openedInfo.check?.title : opened.kind === 'result' ? `Status after double-check: ${opened.status}` : opened.message.split('. ')[0]}</DialogTitle>
        <DialogDescription className="text-sm text-ew-ink-soft">{opened.kind === 'check' ? openedInfo.check?.why : opened.message}</DialogDescription>
        {opened.kind === 'check' && <>
          <div className={`rounded-sm border px-3 py-2 ${TONE[openedInfo.tone].card}`}><Counts results={openedTests} /></div>
          <ul className="space-y-2">{openedTests.map(t => {
            const [label, tone] = VERDICT[t.verdict] || [t.verdict, 'none'];
            return <li key={t.id} className={`rounded-sm border border-l-4 p-3 text-sm ${TONE[tone].card}`}>
              <div className="flex items-start justify-between gap-3"><p className="font-medium">{t.title}</p><span className={`shrink-0 rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${TONE[tone].tag}`}>{label}</span></div>
              {t.expected && <p className="mt-2 text-xs"><span className="font-semibold">Expected: </span>{t.expected}</p>}
              {t.actual && <p className="mt-1 text-xs"><span className="font-semibold">Actual: </span>{t.actual}</p>}
              {t.reason && <p className="mt-1 text-xs text-ew-ink-soft"><span className="font-semibold">Reasoning: </span>{t.reason}</p>}
              {t.source_url && <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2">Inspect source<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
            </li>;
          })}</ul>
          {!openedTests.length && <p className="text-sm text-ew-muted">No results recorded for this check.</p>}
        </>}
        {opened.kind === 'result' && opened.why && <p className={`rounded-sm border px-3 py-2 text-sm ${TONE[openedInfo.tone].card}`}>{opened.why}</p>}
      </DialogContent>}
    </Dialog>
  </section>;
}
