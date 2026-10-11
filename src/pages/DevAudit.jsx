import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import ReportAudit from '@/components/ReportAudit';
import { buildAudit, suggestConsiderations, validateConsiderations, validateDecisions } from '../../base44/functions/auditReport/logic';
import { scoreBorrower } from '../../base44/functions/scoreBorrower/entry';

// Interactive local example, using the real audit engine. No external data or saved production records.
const today = new Date().toISOString().slice(0, 10);
const dateAgo = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
/** @type {Array<import('../../base44/functions/scoreBorrower/entry').Signal & {id: string}>} */
const signals = [
  { id: 'example-cfo', type: 'exec_departure', severity: 'strong', date: dateAgo(5), title: 'Northstar Manufacturing CFO steps down', snippet: 'Northstar Manufacturing announced that its chief financial officer will step down.', source_name: 'Example company announcement', source_url: 'https://example.com/northstar/cfo' },
  { id: 'example-lawsuit', type: 'legal_layoffs', severity: 'strong', date: dateAgo(12), title: 'Northstar faces a supplier lawsuit', snippet: 'A supplier filed a lawsuit against Northstar Trading Ltd, based in London.', source_name: 'Example court report', source_url: 'https://example.com/northstar/lawsuit' },
  { id: 'example-old', type: 'legal_layoffs', severity: 'weak', date: dateAgo(120), title: 'Northstar announces planned layoffs', snippet: 'The company proposed a restructuring plan subject to consultation.', source_name: 'Example news report', source_url: 'https://example.com/northstar/restructuring' },
];
const borrower = { id: 'audit-preview', name: 'Northstar Manufacturing', website_domain: 'northstar.example', hq_city: 'Chicago', hq_state: 'IL', status: scoreBorrower(signals, today).status, last_refreshed: new Date().toISOString(), sources_unavailable: [] };
const trace = { articles: signals.map(s => ({ url: s.source_url, snippet: s.snippet, same_company: s.id !== 'example-lawsuit', why: s.id === 'example-lawsuit' ? 'The source refers to a London trading company, not the Chicago manufacturer.' : 'The collection check matched the example company announcement.' })) };
function createPreviewRequest() {
  let runs = [];
  const calculateScore = async ss => scoreBorrower(ss, today);
  const ready = buildAudit({ borrower, signals, trace, today, calculateScore, decisions: [], considerations: [{ id: 'previous-identity', text: 'Check the domain and headquarters; another Northstar operates in the UK.', enabled: true, mode: 'consider', check: 'identity', signal_ids: ['example-lawsuit'] }] }).then(payload => {
    runs = [{ id: 'preview-first', kind: 'audit', created_at: new Date(Date.now() - 3600000).toISOString(), reviewed_by: 'Example analyst', payload }];
  });
  return async body => {
    await ready;
    if (body.action === 'list') return { runs, suggestions: suggestConsiderations(runs, borrower) };
    const payload = await buildAudit({ borrower, signals, trace, today, calculateScore, previous: runs[0]?.payload,
      considerations: validateConsiderations(body.considerations, signals), decisions: validateDecisions(body.decisions, signals) });
    const run = { id: crypto.randomUUID(), kind: body.action === 'review' ? 'review' : 'audit', created_at: new Date().toISOString(), reviewed_by: 'You (preview)', payload };
    runs = [run, ...runs];
    return { run, suggestions: suggestConsiderations(runs, borrower) };
  };
}
export default function DevAudit() {
  const request = useMemo(createPreviewRequest, []);
  const [view, setView] = useState('report');
  return <div className="min-h-screen bg-ew-paper text-ew-ink">
    <AppHeader>{null}</AppHeader>
    <main className="mx-auto max-w-[960px] px-5 py-7">
      <Link to="/" className="text-xs text-ew-muted underline underline-offset-2">Back to loan book</Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-heading text-2xl font-bold">Northstar Manufacturing</h1><p className="mt-1 text-sm text-ew-muted">Private manufacturer · Chicago, IL</p></div>
        <span className="border border-ew-rule px-2 py-1 text-xs text-ew-muted">Frontend preview</span>
      </div>
      <nav aria-label="Company review views" className="mt-6 flex gap-1 border-b border-ew-rule">
        {[['report', 'Report'], ['audit', 'Audit'], ['considerations', 'Rerun'], ['summary', 'Audit report']].map(([key, label]) => <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)} className={`border-b-2 px-4 py-3 text-sm font-medium ${view === key ? 'border-ew-ink text-ew-ink' : 'border-transparent text-ew-muted hover:text-ew-ink'}`}>{label}</button>)}
      </nav>
      <ReportAudit borrower={borrower} request={request} preview view={view} onViewChange={setView} />
      <p className="mt-5 text-xs leading-relaxed text-ew-muted">Fictional report and simulated Devin results. No live AI calls. History lasts for this page visit.</p>
    </main>
  </div>;
}
