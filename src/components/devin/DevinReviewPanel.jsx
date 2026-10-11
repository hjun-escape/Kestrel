import React from 'react';
import { ExternalLink, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button as SharedButton } from '@/components/ui/button';
import { safeHref } from '@/components/assistant/assistantData';
import { useDevinAudit } from './useDevinRuns';
import { countVerdicts, formatElapsed, isActiveRun, verdictInfo } from './devinRunUtils';

const Button = /** @type {React.ComponentType<any>} */ (SharedButton);

function Findings({ run }) {
  const findings = run.findings || [];
  const counts = countVerdicts(findings);
  return <div>
    {run.summary && <p className="text-sm leading-relaxed">{run.summary}</p>}
    <p className="mt-2 text-xs text-ew-muted">{counts.supported} confirmed · {counts.contradicted} contradicted · {counts.unresolved} could not confirm</p>
    {findings.length > 0 && <div className="mt-4 divide-y divide-ew-rule-soft border-y border-ew-rule-soft">{findings.map((f, i) => {
      const v = verdictInfo(f.verdict);
      const href = safeHref(f.source_url);
      return <details key={i} className="py-4">
        <summary className="flex cursor-pointer items-start justify-between gap-3 text-sm font-medium"><span>{f.claim}</span><span className={`shrink-0 text-xs font-semibold ${v.tone}`}>{v.label}</span></summary>
        {f.reason && <p className="mt-3 text-sm text-ew-ink-soft"><span className="font-semibold">Why: </span>{f.reason}</p>}
        {f.evidence_quote && <blockquote className="mt-2 border-l-2 border-ew-rule pl-3 text-xs text-ew-muted">“{f.evidence_quote}”</blockquote>}
        {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2">Open cited source<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
      </details>;
    })}</div>}
    {!findings.length && <p className="mt-3 text-sm text-ew-muted">Devin returned no findings for this report.</p>}
  </div>;
}

function Progress({ run, now, timedOut }) {
  const started = Date.parse(run.started_at || '');
  const elapsed = Number.isFinite(started) ? now - started : 0;
  const href = safeHref(run.devin_url);
  return <div role="status" aria-live="polite" className="border border-ew-rule-soft bg-ew-paper p-4">
    <p className="flex items-center gap-2 text-sm font-medium">{!timedOut && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{timedOut ? 'Devin is taking longer than expected.' : 'Devin is opening each cited source and checking the claims.'}</p>
    <p className="mt-1 text-xs text-ew-muted">This usually takes a few minutes. Elapsed {formatElapsed(elapsed)}. {timedOut ? 'We stopped checking automatically; open the session in Devin to follow it.' : 'Checking every 10 seconds.'}</p>
    {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2">Open in Devin<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
  </div>;
}

// Live independent double-check. `signedOut` shows it read-only.
export default function DevinReviewPanel({ borrowerId, companyName, signedOut = false }) {
  const { run, loading, starting, error, timedOut, now, active, start } = useDevinAudit(borrowerId, !signedOut);
  const failed = !!run && run.status === 'failed';
  const done = !!run && run.status === 'finished';
  const showProgress = isActiveRun(run);
  const label = done ? 'Double-check again' : failed || timedOut ? 'Try again' : 'Ask Devin to double-check these claims';
  const busy = starting || active;
  return <section id="devin-review" className="mt-6 border border-ew-rule bg-ew-surface" aria-labelledby="devin-review-heading">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ew-rule px-5 py-5">
      <div><p className="text-xs text-ew-muted">Independent reviewer · Devin</p><h2 id="devin-review-heading" className="mt-1 font-heading text-xl font-bold">Independent double-check by Devin</h2><p className="mt-1 max-w-xl text-sm text-ew-muted">Devin is an AI agent that opens every cited source and checks whether it supports the claims in {companyName ? `${companyName}’s` : 'this'} report.</p></div>
      {signedOut
        ? <p className="text-sm text-ew-muted">Sign in to ask Devin</p>
        : (!showProgress || timedOut) && <Button className="h-9 rounded-sm bg-ew-ink hover:bg-ew-ink-soft" onClick={start} disabled={busy || loading}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : done || failed ? <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />}{label}</Button>}
    </header>
    <div className="p-5">
      {error && <p role="alert" className="mb-4 border border-ew-red-rule bg-ew-red-bg p-3 text-sm text-ew-red">{error}</p>}
      {loading && <p role="status" className="text-sm text-ew-muted">Loading the latest double-check…</p>}
      {signedOut && <p className="text-sm text-ew-muted">Sign in to start a double-check and see past results for your companies.</p>}
      {!signedOut && !loading && !run && !error && <div className="flex min-h-[96px] flex-col items-center justify-center text-center"><ShieldCheck className="mb-2 h-6 w-6 text-ew-muted" aria-hidden="true" /><p className="text-sm font-medium">No independent double-check yet</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-ew-muted">Devin reads each cited source and reports whether it confirms, contradicts or does not settle the claim.</p></div>}
      {showProgress && <Progress run={run} now={now} timedOut={timedOut} />}
      {failed && <p role="alert" className="border border-ew-amber-rule bg-ew-amber-bg p-3 text-sm">Devin could not finish this double-check.{run.error ? ` ${run.error}` : ''} You can try again.{safeHref(run.devin_url) && <> <a href={safeHref(run.devin_url) || undefined} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Open in Devin</a></>}</p>}
      {done && <><Findings run={run} />{safeHref(run.devin_url) && <a href={safeHref(run.devin_url) || undefined} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs underline underline-offset-2">Open in Devin<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}</>}
    </div>
  </section>;
}
