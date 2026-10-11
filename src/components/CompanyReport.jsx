import React, { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import VerdictCard from "@/components/company/VerdictCard";
import ReportSection from "@/components/company/ReportSection";
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
import { filterRecentSignals } from "@/lib/borrowerUtils";

const DialogContent = /** @type {React.ComponentType<any>} */ (SharedDialogContent);
const DialogTitle = /** @type {React.ComponentType<any>} */ (SharedDialogTitle);
const DialogDescription = /** @type {React.ComponentType<any>} */ (SharedDialogDescription);

// The company report, banker first: the verdict card (status, why, next step, key evidence) on top,
// then one scrolling report with a heading per section. Detail-heavy sections start collapsed.
// CompanyDetail renders it with live data; /dev/progression renders it for its example company.
// Mount with key={borrower.id} so per-company state resets when the company changes.
const DEFAULT_OPEN = { evidence: false, review: true, sources: false, score: false, brief: false, doublecheck: false };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Scroll to an element once the section holding it has rendered open, and move focus there.
function revealLater(targetId) {
  requestAnimationFrame(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  });
}

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
  auditTrail = null,
}) {
  const [open, setOpen] = useState(DEFAULT_OPEN);
  const [auditView, setAuditView] = useState("summary");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [runRequest, setRunRequest] = useState(0);
  const { isAuthenticated } = useAuth();
  const sessionRequest = useMemo(() => createSessionAudit(borrower, signals, checkRun), [borrower.id, borrower.last_refreshed, signals, checkRun]);
  const recentSignals = filterRecentSignals(signals);
  const olderCount = signals.length - recentSignals.length;
  const isApplicant = borrower.stage === "applicant";

  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const reveal = (key, targetId) => {
    setOpen((prev) => ({ ...prev, [key]: true }));
    revealLater(targetId);
  };
  // ReportAudit only knows its own views; "report" was the old tab and means "show the summary" here.
  const changeAuditView = (view) => setAuditView(view === "report" || !view ? "summary" : view);

  function startAudit() {
    setActionsOpen(false);
    setAuditView("summary");
    setRunRequest((n) => n + 1);
    reveal("doublecheck", "doublecheck");
  }

  return (
    <>
      <VerdictCard
        borrower={borrower}
        signals={signals}
        sourceStates={sourceStates}
        running={running}
        refreshError={refreshError}
        onRefresh={onRefresh}
        onRecheck={() => setActionsOpen(true)}
        onEdit={onEdit}
        onDelete={onDelete}
        evidenceCount={recentSignals.length}
        onShowAllEvidence={() => reveal("evidence", "evidence")}
        onNextStep={(kind) => (kind === "documents" ? reveal("review", "applicant-documents") : reveal("review", "review"))}
      />
      {notice && (
        <p role="status" className="mt-2 border-l-2 border-ew-ink bg-ew-surface px-3 py-2 text-xs text-ew-ink-soft">
          {notice}
        </p>
      )}
      <AutoResumeNote state={autoResume} onStop={onStopAutoResume} />

      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
        <DialogContent className="rounded-sm border-ew-rule bg-ew-surface text-ew-ink sm:rounded-sm">
          <DialogTitle>Re-check {borrower.name}</DialogTitle>
          <DialogDescription>Update the report from its sources, or double-check the report you have. Double-checking never changes the original.</DialogDescription>
          <div className="space-y-2">
            <ActionChoice
              disabled={running}
              title="Re-check sources"
              detail="Look again at news, court records, job postings and employee reviews, and update this report."
              onClick={() => { setActionsOpen(false); onRefresh(); }}
            />
            <ActionChoice
              disabled={running}
              title="Double-check this report"
              detail="Confirm each quote, date and company match against its source."
              onClick={startAudit}
            />
            <ActionChoice
              disabled={running}
              title="Double-check with your notes"
              detail="Choose which evidence to test and add instructions before double-checking."
              onClick={() => { setActionsOpen(false); setAuditView("considerations"); }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-8 border-t border-ew-rule">
        <ReportSection
          id="evidence"
          demoId="tab-evidence"
          title={`All warning signs (${recentSignals.length})`}
          summary={`Last 90 days${olderCount > 0 ? `, plus ${olderCount} older` : ""}`}
          open={open.evidence}
          onToggle={() => toggle("evidence")}
        >
          <div data-demo="evidence" tabIndex={-1} className="outline-none">
            <SignalTimeline signals={signals} neverRefreshed={!borrower.last_refreshed} checking={running} newIds={newIds} isApplicant={isApplicant} />
          </div>
        </ReportSection>

        <ReportSection
          id="review"
          demoId="tab-decision"
          title={isApplicant ? "Applicant review" : "Borrower review"}
          summary="Documents, cash flow, other lenders, decision"
          open={open.review}
          onToggle={() => toggle("review")}
        >
          <div className="grid max-w-3xl gap-4">
            <div id="applicant-documents" tabIndex={-1} className="scroll-mt-4 outline-none">
              <ApplicantDecision key={borrower.id} borrower={borrower} signals={signals} />
            </div>
            <div data-demo="tab-cashflow">
              <h3 className="mb-2 font-heading text-sm font-bold text-ew-ink">Cash flow</h3>
              <CashflowReview borrower={borrower} />
            </div>
          </div>
        </ReportSection>

        <ReportSection
          id="sources"
          title="Sources searched"
          summary="What was checked and what was found"
          open={open.sources || running}
          onToggle={() => toggle("sources")}
        >
          <div className="border border-ew-rule bg-ew-surface">
            <SourceStatusRow borrower={borrower} states={sourceStates} recentSignals={recentSignals} running={running} startedAt={startedAt} />
            <CheckTrace run={checkRun} refreshing={running} stale={checkRunStale} />
          </div>
          <div className="mt-4 max-w-3xl">
            <CompanyLinks borrower={borrower} />
          </div>
        </ReportSection>

        <ReportSection
          id="score"
          title="How the status was counted"
          summary="Every warning sign and what it adds"
          open={open.score}
          onToggle={() => toggle("score")}
        >
          <div className="border border-ew-rule bg-ew-surface">
            <WarningScore borrower={borrower} signals={signals} />
          </div>
        </ReportSection>

        <ReportSection
          id="brief"
          demoId="tab-brief"
          title="AI news summary"
          summary="Optional, not used for status"
          open={open.brief}
          onToggle={() => toggle("brief")}
        >
          <div className="max-w-3xl">
            <AnalystBrief borrower={borrower} />
          </div>
        </ReportSection>

        <ReportSection
          id="doublecheck"
          title="Double-check"
          summary="Each quote, date and company match, checked again"
          open={open.doublecheck}
          onToggle={() => toggle("doublecheck")}
        >
          <ReportAudit
            borrower={borrower}
            currentSignals={signals}
            refreshing={running}
            view={auditView}
            onViewChange={changeAuditView}
            request={isAuthenticated ? undefined : sessionRequest}
            sessionOnly={!isAuthenticated}
            runRequest={runRequest}
          />
        </ReportSection>

      </div>
      {auditTrail && <div className="max-w-3xl">{auditTrail}</div>}
    </>
  );
}

function ActionChoice({ title, detail, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-sm border border-ew-rule p-4 text-left hover:bg-ew-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus disabled:opacity-50"
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-ew-muted">{detail}</span>
    </button>
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
    <section aria-labelledby="links-heading">
      <h3 id="links-heading" className="text-xs font-semibold text-ew-muted">
        Company links
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${l.label} (opens in a new tab)`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-ew-rule bg-ew-surface px-2 py-1 text-xs font-medium text-ew-ink hover:border-ew-ink-soft hover:bg-ew-hover"
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
