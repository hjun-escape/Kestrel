import React from 'react';
import { Download } from 'lucide-react';
import { checkConfidence, confidenceTone, reviewerAccuracy } from '@/lib/auditMetrics';

const STATUS_TONE = { red: 'border-ew-red-rule bg-ew-red-bg text-ew-red', yellow: 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber', green: 'border-ew-green-rule bg-ew-green-bg text-ew-green' };
const CELL_TONE = { pass: 'text-ew-green', fail: 'text-ew-red', needs_review: 'text-ew-amber' };

const CHECK_NAMES = { identity: 'Company identity', quote: 'Source evidence', support: 'Claim support', freshness: 'Dates and freshness', duplicates: 'Duplicate signals', score: 'Score consistency' };
export default function AuditReportSummary({ run, companyName, preview }) {
  if (!run) return <p className="text-sm text-ew-muted">Not run yet. Run an audit to create this company’s audit report.</p>;
  const p = run.payload;
  const confidence = checkConfidence(p.tests);
  const accuracy = reviewerAccuracy(p.decisions, p.snapshot.signals);
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ company: companyName, ...run }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'audit-report.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article aria-label="Audit report" className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-ew-muted">{new Date(run.created_at).toLocaleString()} · {run.reviewed_by}</p><h3 className="mt-1 font-heading text-lg font-bold">{companyName}</h3></div><button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-sm border border-ew-rule px-3 py-2 text-xs font-medium hover:bg-ew-hover focus-visible:outline-ew-focus"><Download className="h-3.5 w-3.5" aria-hidden="true" />Download report</button></div>
    <dl className="grid grid-cols-2 gap-4 border-y border-ew-rule-soft py-4 sm:grid-cols-4"><div><dt className="text-xs text-ew-muted">Evidence double-check</dt><dd className="mt-1"><span className={`inline-block rounded-sm border px-2 font-heading text-xl font-bold tabular-nums ${confidenceTone(confidence.percent)}`}>{confidence.percent === null ? 'Not assessed' : `${confidence.percent}%`}</span></dd><dd className="mt-1 text-xs text-ew-muted">{confidence.passed}/{confidence.total} passed · {confidence.unresolved} unresolved</dd></div><div><dt className="text-xs text-ew-muted">Reviewer-assessed accuracy</dt><dd className="mt-1 font-heading text-xl font-bold">{accuracy.percent === null ? 'Not assessed' : `${accuracy.percent}%`}</dd><dd className="mt-1 text-xs text-ew-muted">{accuracy.assessed} of {accuracy.total} findings assessed</dd></div><div><dt className="text-xs text-ew-muted">Review risk preview</dt><dd className="mt-1"><span className={`inline-block rounded-sm border px-2 font-heading text-xl font-bold capitalize ${STATUS_TONE[p.result.status] || 'border-ew-rule text-ew-ink'}`}>{p.result.status.replace('_', ' ')}</span></dd></div><div><dt className="text-xs text-ew-muted">Evidence excluded</dt><dd className="mt-1 font-heading text-xl font-bold">{p.excluded_signal_ids.length}</dd></div></dl>
    <p className="text-xs text-ew-muted">Evidence double-check = passed ÷ all checks. Unresolved checks are not passes. This is a check-pass heuristic, not measured accuracy or repayment probability.</p>
    <p className="text-xs text-ew-muted">Accuracy = confirmed ÷ (confirmed + incorrect), based on human review. {accuracy.unassessed} finding(s) remain uncertain or unreviewed. This does not measure missed signals.</p>
    <p className="text-sm leading-relaxed text-ew-ink-soft">{p.result.why}</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-sm font-semibold">Test results</caption><thead className="border-y border-ew-rule bg-ew-paper text-ew-muted"><tr><th scope="col" className="px-3 py-2">Check</th><th scope="col" className="px-3 py-2">Pass</th><th scope="col" className="px-3 py-2">Fail</th><th scope="col" className="px-3 py-2">Needs review</th></tr></thead><tbody>{Object.entries(CHECK_NAMES).map(([key, name]) => <tr key={key} className="border-b border-ew-rule-soft"><th scope="row" className="px-3 py-2.5 font-medium">{name}</th>{['pass', 'fail', 'needs_review'].map(v => <td key={v} className={`px-3 py-2.5 tabular-nums ${p.tests.some(t => t.check === key && t.verdict === v) ? `font-semibold ${CELL_TONE[v]}` : 'text-ew-muted'}`}>{p.tests.filter(t => t.check === key && t.verdict === v).length}</td>)}</tr>)}</tbody></table></div>
    {!!p.considerations.length && <details><summary className="cursor-pointer text-sm font-medium">Considerations ({p.considerations.length})</summary><ul className="mt-3 space-y-3">{p.considerations.map(c => <li key={c.id} className="border-l-2 border-ew-rule pl-3"><p className="text-sm">{c.text}<span className="ml-2 text-xs text-ew-muted">{c.outcome.replace('_', ' ')}</span></p><p className="mt-1 text-xs text-ew-muted">{c.reason}</p></li>)}</ul></details>}
    {!!p.decisions.length && <details><summary className="cursor-pointer text-sm font-medium">Reviewer decisions ({p.decisions.length})</summary><ul className="mt-3 space-y-3">{p.decisions.map(d => <li key={d.signal_id} className="border-l-2 border-ew-rule pl-3"><p className="text-sm">{p.snapshot.signals.find(s => s.id === d.signal_id)?.title || d.signal_id} — {d.decision}</p>{d.note && <p className="mt-1 text-xs text-ew-muted">{d.note}</p>}</li>)}</ul></details>}
    <p className="text-xs leading-relaxed text-ew-muted">{preview ? 'Preview: sample data and session-only history. ' : ''}These checks run by fixed rules, not AI. A pass rate is not measured accuracy.</p>
  </article>;
}
