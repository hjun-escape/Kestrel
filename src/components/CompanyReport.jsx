import React, { useMemo, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import CompanyHeader from "@/components/CompanyHeader";
import SourceStatusRow from "@/components/SourceStatusRow";
import SignalTimeline from "@/components/SignalTimeline";
import ApplicantDecision from "@/components/ApplicantDecision";
import CashflowReview from "@/components/CashflowReview";
import AnalystBrief from "@/components/AnalystBrief";
import CheckTrace from "@/components/CheckTrace";
import AutoResumeNote from "@/components/AutoResumeNote";
import WarningScore from "@/components/WarningScore";
import ReportAudit from "@/components/ReportAudit";
import { useAuth } from "@/lib/AuthContext";
import { createSessionAudit } from "@/lib/sessionAudit";
import { Dialog, DialogContent as SharedDialogContent, DialogTitle as SharedDialogTitle, DialogDescription as SharedDialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatTimeToFlag, timeToFirstFlag } from "@/lib/timeToFlag.ts";
import { filterRecentSignals } from "@/lib/borrowerUtils";

const DialogContent = /** @type {React.ComponentType<any>} */ (SharedDialogContent);
const DialogTitle = /** @type {React.ComponentType<any>} */ (SharedDialogTitle);
const DialogDescription = /** @type {React.ComponentType<any>} */ (SharedDialogDescription);

// The company report: everything shown for one company once it has been checked (status, sources,
// warning score, how it was checked, evidence, cash flow, decision, analyst brief, profiles).
// CompanyDetail renders it with live data; /dev/progression renders it for its example company.
// Mount with key={borrower.id} so per-company state resets when the company changes.
export default function CompanyReport({
  borrower,
  signals,
  sourceStates,
  running = false,
  startedAt = null,
  refreshError = null,
  onRefresh = () => {},
  onEdit,
  onDelete,
  notice = null,
  checkRun = null,
  checkRunStale = false,
  newIds = null,
  autoResume = null,
  onStopAutoResume,
}) {
  const [cashflowReview, setCashflowReview] = useState(null);
  const [reviewView, setReviewView] = useState('report');
  const { isAuthenticated } = useAuth();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [runRequest, setRunRequest] = useState(0);
  const [confidence, setConfidence] = useState(null);
  const sessionRequest = useMemo(() => createSessionAudit(borrower, signals, checkRun), [borrower.id, borrower.last_refreshed, signals, checkRun]);
  function openReview(view) {
    setReviewView(view);
  }
  function startAudit() { setActionsOpen(false); setReviewView('summary'); setRunRequest(n => n + 1); }
  const recentSignals = filterRecentSignals(signals);
  const olderCount = signals.length - recentSignals.length;
  const isApplicant = borrower.stage === "applicant";
  const flagLine = formatTimeToFlag(timeToFirstFlag(borrower, signals, cashflowReview ? [cashflowReview] : []));

  return (
    <>
      <div className="border border-ew-rule bg-ew-surface">
        <CompanyHeader
          borrower={borrower}
          signals={signals}
          sourceStates={sourceStates}
          running={running}
          refreshError={refreshError}
          onRefresh={onRefresh}
          onEdit={onEdit}
          onDelete={onDelete}
          onRunActions={() => setActionsOpen(true)}
          confidence={confidence}
        />
        {notice && (
          <p role="status" className="border-t border-ew-rule-soft px-5 py-2 text-xs text-ew-ink-soft">
            {notice}
          </p>
        )}
        <nav aria-label="Company report sections" className="flex flex-wrap gap-1 border-t border-ew-rule-soft px-5">
          {[['report', 'Company report'], ['summary', 'Audit report']].map(([view, label]) => <button key={view} type="button" aria-current={reviewView === view ? 'page' : undefined} onClick={() => openReview(view)} className={`border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-ew-focus ${reviewView === view ? 'border-ew-ink text-ew-ink' : 'border-transparent text-ew-muted hover:text-ew-ink'}`}>{label}</button>)}
        </nav>
        <div hidden={reviewView !== 'report'}>
        <SourceStatusRow borrower={borrower} states={sourceStates} recentSignals={recentSignals} running={running} startedAt={startedAt} />
        <AutoResumeNote state={autoResume} onStop={onStopAutoResume} />
        <WarningScore borrower={borrower} signals={signals} />
        <CheckTrace run={checkRun} refreshing={running} stale={checkRunStale} />
        {flagLine && (
          <p className="border-t border-ew-rule-soft px-5 py-2 text-xs text-ew-ink-soft">{flagLine}</p>
        )}
        </div>
      </div>

      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
        <DialogContent className="rounded-sm border-ew-rule bg-ew-surface text-ew-ink sm:rounded-sm">
          <DialogTitle>Run checks for {borrower.name}</DialogTitle>
          <DialogDescription>Choose how to update or review this report. The original report stays intact when auditing.</DialogDescription>
          <div className="space-y-2">
            <button type="button" disabled={running} onClick={() => { setActionsOpen(false); setReviewView('report'); onRefresh(); }} className="w-full rounded-sm border border-ew-rule p-4 text-left hover:bg-ew-hover disabled:opacity-50"><span className="block text-sm font-semibold">Refresh source data</span><span className="mt-1 block text-xs text-ew-muted">Collect current signals and update the company report.</span></button>
            <button type="button" disabled={running} onClick={startAudit} className="w-full rounded-sm border border-ew-rule p-4 text-left hover:bg-ew-hover disabled:opacity-50"><span className="block text-sm font-semibold">Audit this report</span><span className="mt-1 block text-xs text-ew-muted">Run evidence checks, then view progression and activity logs.</span></button>
            <button type="button" disabled={running} onClick={() => { setActionsOpen(false); setReviewView('considerations'); }} className="w-full rounded-sm border border-ew-rule p-4 text-left hover:bg-ew-hover disabled:opacity-50"><span className="block text-sm font-semibold">Rerun with considerations</span><span className="mt-1 block text-xs text-ew-muted">Apply or skip instructions and choose evidence to test.</span></button>
          </div>
        </DialogContent>
      </Dialog>
      <div hidden={reviewView === 'report'}><ReportAudit borrower={borrower} currentSignals={signals} refreshing={running} view={reviewView} onViewChange={openReview} request={isAuthenticated ? undefined : sessionRequest} sessionOnly={!isAuthenticated} runRequest={runRequest} onConfidenceChange={setConfidence} /></div>

      {/* Evidence first: the signals behind the status, each with its source and
          what to ask. Next steps (decision, other lenders, analyst) sit beside it. */}
      <div hidden={reviewView !== 'report'}><div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="evidence-heading" className="min-w-0">
          <div data-demo="evidence">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 id="evidence-heading" className="font-heading text-xl font-bold tracking-tight text-ew-ink">
                Evidence
              </h2>
              <p className="text-xs tabular-nums text-ew-muted">
                {recentSignals.length} in the last 90 days{olderCount > 0 ? `, ${olderCount} older` : ""}
              </p>
            </div>
            <SignalTimeline
              signals={signals}
              neverRefreshed={!borrower.last_refreshed}
              checking={running}
              newIds={newIds}
            />
          </div>
          {isApplicant ? (
            <div className="mt-6">
              <CashflowReview borrower={borrower} onReviewChange={setCashflowReview} />
            </div>
          ) : (
            <Collapsible className="mt-6 border border-ew-rule bg-ew-surface">
              <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left font-heading text-sm font-bold text-ew-ink">
                <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                Upload latest statement
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CashflowReview borrower={borrower} onReviewChange={setCashflowReview} />
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>

        <aside aria-label="Next steps" className="flex min-w-0 flex-col gap-4">
          <ApplicantDecision key={borrower.id} borrower={borrower} signals={signals} />
          <AnalystBrief borrower={borrower} />
          <CompanyLinks borrower={borrower} />
        </aside>
      </div></div>
    </>
  );
}

function CompanyLinks({ borrower }) {
  const links = [
    { label: "Website", href: borrower.website_domain ? `https://${borrower.website_domain}` : null },
    { label: "LinkedIn", href: borrower.linkedin_url },
    { label: "Glassdoor", href: borrower.glassdoor_url },
  ].filter((l) => l.href && /^https?:\/\//.test(l.href));
  if (links.length === 0) return null;
  const lookup = borrower.profile_search || {};
  const autoFound = [
    lookup.linkedin === "found" && borrower.linkedin_url ? "LinkedIn" : null,
    lookup.glassdoor === "found" && borrower.glassdoor_url ? "Glassdoor" : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="links-heading" className="border border-ew-rule bg-ew-surface px-4 py-3">
      <h2 id="links-heading" className="text-xs font-semibold text-ew-muted">
        Company profiles
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${l.label} (opens in a new tab)`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-ew-rule px-2 py-1 text-xs font-medium text-ew-ink hover:border-ew-ink-soft hover:bg-ew-hover"
            >
              {l.label}
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
      {autoFound.length > 0 && (
        <p className="mt-2 text-xs text-ew-muted">
          {autoFound.join(" and ")} found automatically: the LinkedIn page lists {borrower.website_domain}.
        </p>
      )}
    </section>
  );
}
