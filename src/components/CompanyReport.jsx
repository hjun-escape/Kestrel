import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
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
import DocumentExchange from "@/components/DocumentExchange";
import { OUTCOMES } from "@/components/FinalReview";
import { base44 } from "@/api/base44Client";
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
const DEFAULT_OPEN = { evidence: false, review: true, sources: false, score: false, brief: false, documents: false, doublecheck: false };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const DEVIN_ANCHOR = "devin-review";
const ANCHOR_WAIT_MS = 4000;
const ANCHOR_POLL_MS = 150;

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
  const [signoff, setSignoff] = useState(null);
  const { isAuthenticated } = useAuth();
  // Signed out (shared demo book): audits run in the page, and still use documents accepted in the exchange.
  const sessionRequest = useMemo(() => createSessionAudit(borrower, signals, checkRun, async () => (await base44.functions.invoke('documentExchange', { action: 'accepted', borrower_id: borrower.id })).data?.items || []), [borrower.id, borrower.last_refreshed, signals, checkRun]);
  const recentSignals = filterRecentSignals(signals);
  const olderCount = signals.length - recentSignals.length;
  const isApplicant = borrower.stage === "applicant";

  const { hash } = useLocation();
  // Links to #devin-review (e.g. from the assistant) open the double-check section, then scroll once Devin's panel renders.
  useEffect(() => {
    if (hash !== `#${DEVIN_ANCHOR}`) return undefined;
    setOpen((prev) => ({ ...prev, doublecheck: true }));
    setAuditView((v) => (v === "considerations" || v === "history" ? "summary" : v));
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.getElementById(DEVIN_ANCHOR);
      if (el && !el.closest("[hidden]")) { window.clearInterval(timer); revealLater(DEVIN_ANCHOR); }
      else if (Date.now() - started > ANCHOR_WAIT_MS) window.clearInterval(timer);
    }, ANCHOR_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hash]);
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
  function openFinalReview() {
    setAuditView("final");
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
      {signoff && <SignoffBanner signoff={signoff} onOpen={openFinalReview} />}
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
          id="documents"
          title="Document exchange"
          summary="Ask for documents, review what comes back, accept it"
          open={open.documents}
          onToggle={() => toggle("documents")}
        >
          <DocumentExchange borrower={borrower} signals={signals} onRerunAudit={startAudit} />
        </ReportSection>

        <ReportSection
          id="doublecheck"
          title="Double-check and sign-off"
          summary="Each quote, date and company match, checked again, then signed off"
          open={open.doublecheck}
          onToggle={() => toggle("doublecheck")}
        >
          <div role="group" aria-label="Double-check view" className="flex flex-wrap gap-2">
            {[["summary", "Double-check results"], ["final", "Final review and sign-off"]].map(([view, label]) => (
              <button
                key={view}
                type="button"
                aria-pressed={view === "final" ? auditView === "final" : auditView !== "final"}
                onClick={() => setAuditView(view)}
                className={`rounded-sm border px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus ${(view === "final" ? auditView === "final" : auditView !== "final") ? "border-ew-ink bg-ew-ink text-white" : "border-ew-rule text-ew-ink hover:bg-ew-hover"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <ReportAudit
            borrower={borrower}
            currentSignals={signals}
            refreshing={running}
            view={auditView}
            onViewChange={changeAuditView}
            request={isAuthenticated ? undefined : sessionRequest}
            sessionOnly={!isAuthenticated}
            runRequest={runRequest}
            onSignoffChange={setSignoff}
          />
        </ReportSection>
        {auditTrail}
      </div>
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

const SIGNOFF_TONE = { proceed: "border-ew-green-rule bg-ew-green-bg text-ew-green", proceed_with_conditions: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber", request_documents: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber", decline: "border-ew-red-rule bg-ew-red-bg text-ew-red" };

/** The latest final review sign-off, shown under the verdict card. */
function SignoffBanner({ signoff, onOpen }) {
  const label = OUTCOMES.find(([k]) => k === signoff.outcome)?.[1] || signoff.outcome;
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2 text-sm ${SIGNOFF_TONE[signoff.outcome] || "border-ew-rule"}`}>
      <span className="font-semibold">Signed off: {label}</span>
      <span className="text-xs">{signoff.by} · {new Date(signoff.at).toLocaleString()}</span>
      {signoff.note && <span className="min-w-0 flex-1 truncate text-ew-ink">{signoff.note}</span>}
      <button type="button" onClick={onOpen} className="text-xs font-semibold underline underline-offset-2">Final review</button>
    </div>
  );
}
