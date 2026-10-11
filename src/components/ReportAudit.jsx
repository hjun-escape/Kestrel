import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, ExternalLink, Loader2, Plus, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button as SharedButton } from '@/components/ui/button';
import AuditWorkflow from '@/components/AuditWorkflow';
import ConsiderationEditor from '@/components/ConsiderationEditor';
import AuditReportSummary from '@/components/AuditReportSummary';
import { checkConfidence, reviewerAccuracy } from '@/lib/auditMetrics';
import { AUDIT_CHECKS } from '@/lib/auditCheckDefinitions';
import AuditRunProgress from '@/components/AuditRunProgress';
import { Dialog, DialogContent, DialogTitle as SharedDialogTitle, DialogDescription as SharedDialogDescription } from '@/components/ui/dialog';

const Button = /** @type {React.ComponentType<any>} */ (SharedButton);
const DialogTitle = /** @type {React.ComponentType<any>} */ (SharedDialogTitle);
const DialogDescription = /** @type {React.ComponentType<any>} */ (SharedDialogDescription);

const LABELS = { pass: 'Pass', fail: 'Fail', needs_review: 'Needs review', supported: 'Supported', unsupported: 'Unsupported', unresolved: 'Unresolved', applied: 'Applied', not_applied: 'Not applied' };
const errorText = e => e?.response?.data?.error || e.message || 'Could not complete the audit.';
const requestAudit = async body => (await base44.functions.invoke('auditReport', body)).data;
const stamp = value => new Date(value).toLocaleString();
const field = 'w-full rounded-sm border border-ew-rule bg-ew-surface px-3 py-2 text-sm focus-visible:outline-ew-focus';

function Verdict({ value }) {
  const tone = value === 'pass' || value === 'supported' ? 'border-ew-green-rule bg-ew-green-bg text-ew-green' : value === 'fail' || value === 'unsupported' ? 'border-ew-red-rule bg-ew-red-bg text-ew-red' : 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber';
  return <span className={`inline-flex rounded-sm border px-2 py-0.5 text-xs font-medium ${tone}`}>{LABELS[value] || value}</span>;
}

export default function ReportAudit({ borrower, currentSignals = [], refreshing = false, request = requestAudit, preview = false, sessionOnly = false, view = null, onViewChange = null, runRequest = 0, onConfidenceChange = null }) {
  const { isAuthenticated } = useAuth();
  const allowed = preview || sessionOnly || isAuthenticated;
  const handledRequest = useRef(0);
  const [phase, setPhase] = useState(-1);
  const [activity, setActivity] = useState([]);
  const [failed, setFailed] = useState(false);
  const [progressTests, setProgressTests] = useState([]);
  const [revealed, setRevealed] = useState(0);
  const execution = useRef(0);
  const [runs, setRuns] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [considerations, setConsiderations] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [internalTab, setTab] = useState('checks');
  const tab = view === 'audit' ? 'checks' : view || internalTab;
  const AuditContainer = view === 'considerations' && !preview ? DialogContent : view === 'audit' && preview ? 'details' : 'section';
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const selected = runs.find(r => r.id === selectedId) || runs[0];
  const payload = selected?.payload;
  const signals = payload?.snapshot.signals || currentSignals;
  const accuracy = reviewerAccuracy(payload?.decisions || [], signals);
  const historical = selected && selected.id !== runs[0]?.id;
  const stale = payload && (payload.snapshot.refreshed_at !== (borrower.last_refreshed || '') || payload.identity !== [borrower.name, borrower.website_domain, borrower.hq_city, borrower.hq_state].map(s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).join('|'));

  useEffect(() => { onConfidenceChange?.(stale ? null : checkConfidence(runs[0]?.payload.tests || [])); }, [runs, stale, onConfidenceChange]);
  useEffect(() => {
    if (!runRequest || runRequest === handledRequest.current || loading || busy || refreshing) return;
    handledRequest.current = runRequest;
    if (allowed) execute('run');
  }, [runRequest, loading, refreshing, allowed, busy]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPhase(-1); setActivity([]); setFailed(false);
    execution.current += 1; setBusy(''); setProgressTests([]); setRevealed(0);
    setRuns([]); setConsiderations([]); setDecisions([]); setError(''); setDismissed([]);
    if (!allowed) { setLoading(false); return; }
    request({ action: 'list', borrower_id: borrower.id }).then(data => {
      if (!active) return;
      setRuns(data.runs || []); setSuggestions(data.suggestions || []);
      setSelectedId(data.runs?.[0]?.id || '');
      setDecisions(data.runs?.[0]?.payload.decisions || []);
    }).catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; execution.current += 1; };
  }, [borrower.id, allowed, request]);

  const patchConsideration = (id, patch) => setConsiderations(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
  function addConsideration(suggestion) {
    if (considerations.length >= 20) return;
    const validIds = new Set(signals.map(s => s.id));
    setConsiderations(cs => [...cs, { id: crypto.randomUUID(), text: suggestion?.text || '', enabled: true, mode: suggestion?.mode || 'consider', check: suggestion?.check || 'identity', signal_ids: (suggestion?.signal_ids || []).filter(id => validIds.has(id)) }]);
    if (suggestion) setDismissed(ds => [...ds, suggestion.id]);
  }
  function patchDecision(signalId, patch) {
    setDecisions(ds => {
      const old = ds.find(d => d.signal_id === signalId) || { signal_id: signalId, decision: 'uncertain', note: '' };
      return [...ds.filter(d => d.signal_id !== signalId), { ...old, ...patch }];
    });
  }
  async function execute(action) {
    const executionId = ++execution.current;
    const current = () => execution.current === executionId;
    setBusy(action); setError(''); setNotice('');
    setFailed(false); setPhase(0); setActivity([]);
    setProgressTests([]); setRevealed(0);
    const log = (message, meta = {}) => setActivity(ls => [...ls, { time: new Date().toLocaleTimeString(), message, kind: 'info', ...meta }]);
    log(`Preparing ${borrower.name}: ${signals.length} findings and ${considerations.filter(c => c.enabled).length} active considerations.`);
    if (!preview) onViewChange?.('summary');
    try {
      setPhase(1);
      log('Running evidence checks. They run by fixed rules, not AI.');
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      const data = await request({ action, borrower_id: borrower.id, considerations, decisions, parent_run_id: runs[0]?.id || '' });
      if (!current()) return;
      setProgressTests(data.run.payload.tests);
      log('Checks returned. Results appear one at a time below.');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (let i = 0; i < AUDIT_CHECKS.length; i++) {
        const check = AUDIT_CHECKS[i];
        if (!reducedMotion) await new Promise(resolve => setTimeout(resolve, 450));
        if (!current()) return;
        const results = data.run.payload.tests.filter(t => t.check === check.key);
        log(`${check.title}: ${results.filter(t => t.verdict === 'pass').length} passed, ${results.filter(t => t.verdict === 'fail').length} failed, ${results.filter(t => t.verdict === 'needs_review').length} need review. Why: ${check.why}`, { kind: 'check', check: check.key });
        setRevealed(i + 1);
      }
      setPhase(2);
      log(`Status after double-check: ${data.run.payload.result.status}. ${data.run.payload.excluded_signal_ids.length} findings excluded; original report unchanged.`, { kind: 'result', status: data.run.payload.result.status, why: data.run.payload.result.why });
      setPhase(3);
      setRuns(rs => [data.run, ...rs]); setSelectedId(data.run.id);
      setDecisions(data.run.payload.decisions || []); setSuggestions(data.suggestions || []); setDismissed([]);
      setNotice(action === 'review' ? 'Review saved as a new version.' : 'Audit complete. Review the checks and explanations below.');
      setTab('checks');
      onViewChange?.(preview ? 'audit' : 'summary');
      log(sessionOnly ? 'Audit report ready. Session-only demo: nothing saved to the shared book.' : 'Audit report saved as a new version.', { kind: 'done' });
      setPhase(4);
    } catch (e) { if (current()) { setError(errorText(e)); setFailed(true); log(`Stopped: ${errorText(e)}`, { kind: 'error' }); } }
    finally { if (current()) setBusy(''); }
  }
  const canRun = allowed && !busy && !loading && !refreshing && !historical;
  const summaryReport = <><AuditReportSummary run={selected} companyName={borrower.name} preview={preview} />{!!runs.length && <details className="mt-6 border-t border-ew-rule-soft pt-4"><summary className="cursor-pointer text-sm font-medium">Review history ({runs.length} versions)</summary><div className="mt-3 space-y-2">{runs.map((r, i) => <button type="button" key={r.id} onClick={() => setSelectedId(r.id)} className={`flex w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left text-xs ${selected?.id === r.id ? 'border-ew-ink bg-ew-paper' : 'border-ew-rule-soft hover:bg-ew-hover'}`}><span>{stamp(r.created_at)} · {r.reviewed_by}{i === 0 ? ' · Latest' : ''}</span><span className="capitalize">{r.payload.result.status.replace('_', ' ')}</span></button>)}</div></details>}</>;
  return <>{preview && <AuditWorkflow preview={preview} companyName={borrower.name} mode={view || 'audit'} onReview={() => { if (onViewChange) onViewChange(view === 'report' ? 'audit' : 'considerations'); else setTab('checks'); }} />}<div hidden={view === 'report'}><Dialog open={view === 'considerations' && !preview} onOpenChange={open => { if (!open) onViewChange?.('summary'); }}><AuditContainer className={`border border-ew-rule bg-ew-surface ${view === 'considerations' && !preview ? 'max-h-[85vh] overflow-y-auto p-0 text-ew-ink sm:max-w-2xl sm:rounded-sm' : 'mt-6'}`} aria-labelledby="audit-heading">
    {view === 'considerations' && !preview && <><DialogTitle className="sr-only">Rerun with considerations</DialogTitle><DialogDescription className="sr-only">Edit the instructions for the next audit run.</DialogDescription></>}
    {view === 'audit' && preview && <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Evidence checks & reviewer assessments <span className="ml-2 text-xs font-normal text-ew-muted">{payload?.tests.length || 0} checks</span></summary>}
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ew-rule px-5 py-5">
      <div><h2 id="audit-heading" className="font-heading text-xl font-bold">{view === 'considerations' ? 'Rerun with considerations' : view === 'summary' ? 'Audit report' : view === 'history' ? 'Review history' : 'Evidence checks'}</h2>
        <p className="mt-1 text-sm text-ew-muted">{view === 'considerations' ? 'Choose what to apply. Your next run is saved separately.' : view === 'history' ? 'Open a past version to inspect its evidence and decisions.' : 'Inspect the evidence and record your judgment.'}</p></div>
      {view !== 'history' && !(view === 'summary' && !runs.length && phase < 0 && !loading) && <Button className={`h-9 rounded-sm bg-ew-ink px-3.5 hover:bg-ew-ink-soft ${view === 'considerations' && !preview ? 'mr-7' : ''}`} onClick={() => execute('run')} disabled={!canRun}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}{busy === 'run' ? 'Running checks…' : view === 'considerations' ? 'Run with considerations' : runs.length ? 'Run audit again' : 'Run audit'}</Button>}
    </header>
    {!allowed ? <p className="p-5 text-sm text-ew-muted">Sign in to audit your company reports and save review history.</p> : <>
      {view !== 'considerations' && <AuditRunProgress phase={phase} logs={activity} failed={failed} running={!!busy} tests={progressTests.length || phase >= 0 ? progressTests : payload?.tests || []} revealed={progressTests.length || phase >= 0 ? revealed : AUDIT_CHECKS.length} report={tab === 'summary' ? summaryReport : null} onRun={() => execute('run')} canRun={canRun} />}
      {sessionOnly && <p className="border-b border-ew-rule-soft px-5 py-3 text-xs text-ew-muted">Session-only demo audit of this company’s recorded evidence. No shared data is changed.</p>}
      {!view && <ol aria-label="Audit workflow" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-ew-rule-soft bg-ew-paper px-5 py-3 text-xs text-ew-ink-soft">
        {['Report ready', 'Run checks', 'Review evidence', 'Edit considerations', 'Rerun & compare'].map((step, i) => <li key={step} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-ew-rule">{i + 1}</span>{step}{i < 4 && <ChevronRight className="h-3 w-3 text-ew-muted" />}</li>)}
      </ol>}
      <div className="px-5 pt-4">
        {error && <p role="alert" className="mb-4 border border-ew-red-rule bg-ew-red-bg p-3 text-sm text-ew-red">{error}</p>}
        {notice && tab !== 'summary' && <p role="status" className="mb-3 text-sm text-ew-green">{notice}</p>}
        {loading && <p role="status" className="py-4 text-sm">Loading saved audits…</p>}
        {refreshing && <p role="status" className="mb-3 text-sm text-ew-muted">Wait for the source check to finish before auditing.</p>}
        {stale && <p className="mb-3 border border-ew-amber-rule bg-ew-amber-bg p-3 text-sm">This audit covers an older report or company identity. Run a new audit to check the current evidence.</p>}
        {payload && (!view || view === 'audit') && <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="border border-ew-rule-soft p-3"><p className="text-xs text-ew-muted">Reviewer-assessed accuracy</p><p className="mt-1 font-heading text-2xl font-bold">{accuracy.percent === null ? 'Not assessed' : `${accuracy.percent}%`}</p><p className="mt-1 text-xs text-ew-muted">{accuracy.assessed} assessed · {accuracy.unassessed} uncertain or unreviewed</p></div>
          <div className="border border-ew-rule-soft p-3"><p className="text-xs text-ew-muted">Checks passed</p><p className="mt-1 font-heading text-2xl font-bold">{payload.tests.filter(t => t.verdict === 'pass').length}<span className="text-base font-normal text-ew-muted"> / {payload.tests.length}</span></p><p className="mt-1 text-xs text-ew-muted">Check coverage, not an accuracy percentage</p></div>
          <div className="border border-ew-rule-soft p-3"><p className="text-xs text-ew-muted">Needs attention</p><p className="mt-1 font-heading text-2xl font-bold">{payload.tests.filter(t => t.verdict !== 'pass').length}</p><p className="mt-1 text-xs text-ew-muted">{payload.tests.filter(t => t.verdict === 'fail').length} failed · {payload.tests.filter(t => t.verdict === 'needs_review').length} need review</p></div>
          <div className="border border-ew-rule-soft p-3"><p className="text-xs text-ew-muted">Review risk preview</p><p className="mt-1 font-heading text-2xl font-bold capitalize">{payload.result.status.replace('_', ' ')}</p><p className="mt-1 text-xs text-ew-muted">{payload.excluded_signal_ids.length} evidence item(s) excluded · Original report retained</p></div>
        </div>}
        {payload?.comparison && view !== 'history' && view !== 'considerations' && <div className="mb-4 border-l-2 border-ew-focus bg-ew-paper p-3 text-sm"><p className="font-semibold">What changed since the previous run</p><p className="mt-1">Risk preview: <span className="capitalize">{payload.comparison.previous_status} → {payload.result.status}</span>. {payload.comparison.added.length} added, {payload.comparison.removed.length} removed, {payload.comparison.changed.length} changed evidence items; {payload.comparison.tests_changed} check verdicts changed.</p><p className="mt-1 text-xs text-ew-muted">{payload.result.why}</p></div>}
      </div>
      {!view && <div className="flex gap-5 border-b border-ew-rule px-5" role="tablist" aria-label="Audit sections">
        {[['checks', 'Checks & reasoning'], ['considerations', 'Considerations'], ['history', 'Review history']].map(([value, label]) => <button key={value} id={`audit-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`audit-panel-${value}`} onClick={() => setTab(value)} className={`border-b-2 py-3 text-sm font-medium ${tab === value ? 'border-ew-ink text-ew-ink' : 'border-transparent text-ew-muted'}`}>{label}</button>)}
      </div>}
      <div role={view ? undefined : 'tabpanel'} id={`audit-panel-${tab}`} aria-labelledby={view ? undefined : `audit-tab-${tab}`} className="p-5">
        {(tab === 'checks' || (tab === 'summary' && payload)) && <details open={tab === 'checks'} className={tab === 'summary' ? 'mb-5 border-b border-ew-rule-soft pb-4' : ''}>
          <summary className="mb-4 cursor-pointer text-sm font-semibold">Review findings & check reasoning</summary>
          {!payload && <p className="text-sm text-ew-muted">Run an audit to check company identity, source evidence, claim support, freshness, duplicates and score consistency.</p>}
          {payload && <><p className="mb-4 text-xs text-ew-muted">Version saved {stamp(selected.created_at)} by {selected.reviewed_by}. Explanations describe the evidence and rules behind each verdict.</p>
            <details className="mb-4 border border-ew-rule p-3"><summary className="cursor-pointer text-sm font-semibold">Score consistency <span className="ml-2"><Verdict value={payload.tests.find(t => t.check === 'score')?.verdict} /></span></summary><TestExplanation test={payload.tests.find(t => t.check === 'score')} /></details>
            <div className="space-y-4">{signals.map(s => {
              const decision = (historical ? payload.decisions : decisions).find(d => d.signal_id === s.id);
              const excluded = payload.excluded_signal_ids.includes(s.id);
              return <article key={s.id} className="border border-ew-rule">
                <div className="border-b border-ew-rule-soft bg-ew-paper p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{s.title}</h3>{excluded && <span className="text-xs text-ew-amber">Excluded from review risk preview</span>}</div><blockquote className="mt-2 text-sm text-ew-ink-soft">“{s.snippet || 'No evidence text recorded.'}”</blockquote><p className="mt-2 text-xs text-ew-muted">{s.source_name} · {s.date} · {s.severity}</p></div>
                <div className="divide-y divide-ew-rule-soft">{payload.tests.filter(t => t.signal_id === s.id).map(t => <details key={t.id} className="px-4 py-3"><summary className="flex cursor-pointer items-center justify-between gap-3 text-sm"><span>{t.title}</span><Verdict value={t.verdict} /></summary><TestExplanation test={t} /></details>)}</div>
                <div className="border-t border-ew-rule-soft p-4"><label className="text-xs font-semibold" htmlFor={`decision-${s.id}`}>Your assessment</label><select id={`decision-${s.id}`} className={`${field} mt-1`} disabled={!!busy || historical || stale} value={decision?.decision || ''} onChange={e => patchDecision(s.id, { decision: e.target.value })}><option value="" disabled>Choose an assessment</option><option value="confirmed">Confirmed</option><option value="incorrect">Incorrect — exclude from review preview</option><option value="uncertain">Uncertain</option></select><label htmlFor={`note-${s.id}`} className="mt-2 block text-xs text-ew-muted">Review note</label><textarea id={`note-${s.id}`} className={`${field} mt-1`} maxLength={1000} rows={2} disabled={!!busy || historical || stale} value={decision?.note || ''} placeholder="What did you verify, or what is still missing?" onChange={e => patchDecision(s.id, { note: e.target.value })} /></div>
              </article>;
            })}</div>
            {!signals.length && <p className="text-sm text-ew-muted">No signals recorded. A consistent score does not prove absence of risk.</p>}
            {payload.considerations.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold">Considerations applied in this version</h3>{payload.considerations.map(c => <div className="mt-2 border border-ew-rule-soft p-3" key={c.id}><div className="flex justify-between gap-3 text-sm"><span>{c.text}</span><Verdict value={c.outcome} /></div><p className="mt-2 text-xs text-ew-muted">{c.reason}</p></div>)}</div>}
            <Button className="mt-4" variant="outline" disabled={!canRun || stale} onClick={() => execute('review')}><Check className="mr-2 h-4 w-4" />{busy === 'review' ? 'Saving…' : 'Save review as new version'}</Button>
          </>}
        </details>}
        {tab === 'considerations' && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-ew-muted">Add an instruction, then apply it or skip it for this run.</p><Button className="h-8 rounded-sm" variant="outline" onClick={() => addConsideration()} disabled={!!busy || historical || considerations.length >= 20}><Plus className="mr-1 h-4 w-4" />Add consideration</Button></div>
          <div className="mt-4 space-y-3">{considerations.map((c, index) => <ConsiderationEditor key={c.id} consideration={c} index={index} signals={signals} disabled={!!busy || historical} onChange={patch => patchConsideration(c.id, patch)} onRemove={() => setConsiderations(cs => cs.filter(v => v.id !== c.id))} />)}</div>
          {!considerations.length && <p className="mt-4 text-sm text-ew-muted">No instructions selected for this rerun. Add one or reuse a previous consideration below.</p>}
          <div className="mt-6 border-t border-ew-rule pt-4"><h3 className="font-semibold">Previously tested for {borrower.name}</h3><p className="mt-1 text-xs text-ew-muted">Suggested from saved reviews of this company and identity. Choose what to reuse.</p>{suggestions.filter(s => !dismissed.includes(s.id)).length ? suggestions.filter(s => !dismissed.includes(s.id)).map(s => <div key={`${s.run_id}-${s.id}`} className="mt-3 border border-ew-rule-soft p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{s.text}</p><Verdict value={s.outcome} /></div><p className="mt-1 text-xs text-ew-muted">Previously tested · {stamp(s.tested_at)} · {s.tested_by}</p><p className="mt-2 text-xs text-ew-muted">{s.reason}</p><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={!!busy || historical || considerations.length >= 20} onClick={() => addConsideration(s)}>Include & edit</Button><Button size="sm" variant="ghost" onClick={() => setDismissed(ds => [...ds, s.id])}>Dismiss</Button></div></div>) : <p className="mt-3 text-sm text-ew-muted">No previous considerations to suggest.</p>}</div>
        </>}
                {tab === 'history' && <><p className="mb-3 text-sm text-ew-muted">Every audit and saved review is a separate version. Open a version to inspect its evidence and instructions.</p>{runs.map((r, i) => <button key={r.id} type="button" onClick={() => { setSelectedId(r.id); setTab('checks'); onViewChange?.('audit'); }} className={`mb-2 flex w-full flex-wrap items-center justify-between gap-2 border p-3 text-left ${selectedId === r.id ? 'border-ew-ink bg-ew-paper' : 'border-ew-rule-soft'}`}><span><span className="text-sm font-semibold">{r.kind === 'review' ? 'Reviewer decision' : 'Audit run'}{i === 0 ? ' · Latest' : ''}</span><span className="mt-1 block text-xs text-ew-muted">{stamp(r.created_at)} · {r.reviewed_by}</span></span><span className="text-sm capitalize">{r.payload.result.status.replace('_', ' ')} <ChevronRight className="ml-2 inline h-4 w-4" /></span></button>)}{!runs.length && <p className="text-sm text-ew-muted">No saved reviews yet.</p>}</>}
        {historical && <Button className="mt-4" variant="outline" onClick={() => setSelectedId(runs[0].id)}>Return to latest version</Button>}
      </div>
    </>}
  </AuditContainer></Dialog></div></>;
}

function TestExplanation({ test }) {
  if (!test) return null;
  return <div className="mt-3 space-y-2 text-sm"><p><span className="font-medium">Expected: </span>{test.expected}</p><p><span className="font-medium">Actual: </span>{test.actual}</p><p className="text-ew-ink-soft"><span className="font-medium">Reasoning: </span>{test.reason}</p>{test.source_url && <a href={test.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">Inspect source<ExternalLink className="h-3 w-3" /><span className="sr-only"> (opens in a new tab)</span></a>}</div>;
}
