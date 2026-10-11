import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Check, ChevronRight, ExternalLink } from "lucide-react";
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
const DEFAULT_OPEN = { evidence: false, review: true, sources: false, score: false, brief: false, documents: false, doublecheck: false, cashflow: false, lenders: false };

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
  // Review and sign-off, in order: 1 double-check, 2 document exchange, 3 final check and sign-off.
  const [step, setStep] = useState("report");
  const [confidence, setConfidence] = useState(null);
  const [docItems, setDocItems] = useState([]);
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
    setStep("check");
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
  // Open a section of the report (step 1) and scroll to it.
  const reveal = (key, targetId) => {
    setStep("report");
    setOpen((prev) => ({ ...prev, [key]: true }));
    revealLater(targetId);
  };
  // ReportAudit only knows its own views; "report" was the old tab and means "show the summary" here.
  const changeAuditView = (view) => {
    if (view === "final") return setStep("final");
    setStep("check");
    setAuditView(view === "report" || !view ? "summary" : view);
  };

  function startAudit() {
    setActionsOpen(false);
    setAuditView("summary");
    setStep("check");
    setRunRequest((n) => n + 1);
    revealLater("doublecheck");
  }
  function openFinalReview() {
    setStep("final");
    revealLater("doublecheck");
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
        confidence={confidence}
        onConfidence={() => { setStep("check"); revealLater("doublecheck"); }}
        onNextStep={(kind) => { if (kind === "documents") { setStep("documents"); revealLater("doublecheck"); } else reveal("evidence", "evidence"); }}
      />
      {signoff && <SignoffBanner signoff={signoff} onOpen={openFinalReview} />}
      <SignoffStamp signoff={signoff} />
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
              onClick={() => { setActionsOpen(false); setStep("check"); setAuditView("considerations"); revealLater("doublecheck"); }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* The workflow, right under the card: 1 review the report, 2 double-check it, 3 exchange documents,
          4 final check and sign-off. The selected step's content shows below it. */}
      <div id="doublecheck" className="mt-6 scroll-mt-4 border border-ew-rule bg-ew-surface px-5 py-4">
        <ReviewSteps
          step={step}
          onStep={setStep}
          done={{
            report: !!borrower.last_refreshed && (step !== "report" || !!confidence?.total),
            check: !!confidence && confidence.total > 0,
            documents: docItems.some((d) => d.status === "accepted" || d.status === "rejected"),
            final: !!signoff,
          }}
          started={{
            report: false,
            check: false,
            documents: docItems.length > 0,
            final: false,
          }}
          notes={{
            extra: "Lenders, cash flow, AI summary · not used for the status",
            report: borrower.last_refreshed ? `${recentSignals.length} warning sign${recentSignals.length === 1 ? "" : "s"} · sources · status` : "Not checked yet",
            check: confidence?.total ? `${confidence.percent}% confidence · ${confidence.passed}/${confidence.total} passed` : "Not run yet",
            documents: docItems.length ? `${docItems.filter((d) => d.status === "submitted").length} to review · ${docItems.filter((d) => d.status === "accepted").length} accepted` : "Optional",
            final: signoff ? "Signed off" : "Confirm each flag, then sign off",
          }}
        />
      </div>

      <div className="mt-4 border-t border-ew-rule" hidden={step !== "report"}>
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

      </div>

      <div className="mt-4" hidden={step !== "documents"}>
        <DocumentExchange borrower={borrower} signals={signals} onRerunAudit={startAudit} onItemsChange={setDocItems} />
      </div>
      {/* Stays mounted on every step so a running double-check and your calls are never lost. */}
      <div className="mt-4" hidden={step !== "check" && step !== "final"}>
        <ReportAudit
          borrower={borrower}
          currentSignals={signals}
          refreshing={running}
          view={step === "final" ? "final" : auditView}
          onViewChange={changeAuditView}
          request={isAuthenticated ? undefined : sessionRequest}
          sessionOnly={!isAuthenticated}
          runRequest={runRequest}
          onSignoffChange={setSignoff}
          onConfidenceChange={setConfidence}
        />
      </div>

      <div className="mt-4 border-t border-ew-rule" hidden={step !== "extra"}>
        <ReportSection
          id="lenders"
          demoId="tab-decision"
          title="Other lenders"
          summary="Public liens, lender lawsuits and loan news"
          open={open.lenders}
          onToggle={() => toggle("lenders")}
        >
          <div className="max-w-3xl">
            <ApplicantDecision key={borrower.id} borrower={borrower} signals={signals} parts={{ documents: false, lenders: true, decision: false }} />
          </div>
        </ReportSection>

        <ReportSection
          id="cashflow"
          demoId="tab-cashflow"
          title="Cash flow"
          summary="Bank statement check: who they pay, late and bounced payments"
          open={open.cashflow}
          onToggle={() => toggle("cashflow")}
        >
          <div className="max-w-3xl">
            <CashflowReview borrower={borrower} />
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
      </div>
      {step !== "final" && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setStep(NEXT[step][0])} className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white hover:bg-ew-ink-soft">
            Next: {NEXT[step][1]}
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

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

const NEXT = { report: ["check", "double-check"], check: ["documents", "document exchange"], documents: ["extra", "additional AI checks (optional)"], extra: ["final", "final check"] };
const OPTIONAL = new Set(["extra"]);
const STEPS = [
  ["report", "Review report", "Warning signs, sources, how the status was counted"],
  ["check", "Double-check", "Each quote, date and company match"],
  ["documents", "Document exchange", "Ask the company, review what comes back"],
  ["extra", "Additional AI checks", "Other lenders, cash flow, AI news summary"],
  ["final", "Final check and sign-off", "Your call on every flag"],
];

/**
 * The three review steps as a workflow diagram: green = done, yellow = in progress, blank = not started.
 * The state is always written out too (Done / In progress / Not started), never colour alone.
 */
function ReviewSteps({ step, onStep, done, started, notes }) {
  const stateOf = (key) => (done[key] ? "done" : step === key || started[key] ? "progress" : OPTIONAL.has(key) ? "optional" : "todo");
  const NODE = {
    done: "border-ew-green bg-ew-green text-white",
    progress: "border-[#d68a1c] bg-[#fdf3e1] text-ew-amber",
    todo: "border-ew-rule bg-ew-surface text-ew-muted",
    optional: "border-dashed border-ew-rule bg-ew-surface text-ew-muted",
  };
  const LABEL = { done: ["Done", "text-ew-green"], progress: ["In progress", "text-ew-amber"], todo: ["Not started", "text-ew-muted"], optional: ["Optional", "text-ew-muted"] };
  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0" aria-label="Review steps">
      {STEPS.map(([key, title, hint], i) => {
        const state = stateOf(key);
        const current = step === key;
        const [label, labelTone] = LABEL[state];
        return (
          <li key={key} className="relative flex flex-1 sm:flex-col sm:items-center">
            {/* connector to the next step: green once this step is done */}
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="absolute left-[calc(50%+26px)] right-[calc(-50%+26px)] top-[22px] hidden h-[3px] rounded-full bg-ew-rule sm:block">
                <span className="block h-full rounded-full bg-ew-green transition-[width] duration-700 ease-out" style={{ width: state === "done" ? "100%" : "0%" }} />
              </span>
            )}
            <button
              type="button"
              onClick={() => onStep(key)}
              data-demo={`step-${key}`}
              aria-current={current ? "step" : undefined}
              className="group flex items-start gap-3 rounded-sm p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus sm:flex-col sm:items-center sm:text-center"
            >
              <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] text-sm font-bold transition-colors duration-500 ${NODE[state]} ${current ? "ring-4 ring-[#14202e]/10" : ""}`}>
                {state === "done" ? <Check aria-hidden="true" className="h-5 w-5" /> : i + 1}
                {state === "progress" && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-[#d68a1c] motion-reduce:animate-none" />}
              </span>
              <span className="min-w-0 sm:mt-1">
                <span className={`block text-sm font-semibold ${current ? "text-ew-ink underline decoration-2 underline-offset-4" : "text-ew-ink"}`}>{title}</span>
                <span className={`block text-[11px] font-semibold uppercase tracking-wider ${labelTone}`}>{label}</span>
                <span className="block text-xs text-ew-muted">{notes[key] || hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The moment of sign-off: a stamp lands on the page with the outcome, holds, then lifts away, and the banner
 * stays. Only for a sign-off made just now (not one loaded with the page). Reduced motion: a plain fade.
 */
function SignoffStamp({ signoff }) {
  const [shown, setShown] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | in | land | out
  const seen = useRef(signoff?.at || null);
  useEffect(() => {
    if (!signoff?.at || signoff.at === seen.current) return undefined;
    seen.current = signoff.at;
    if (Date.now() - Date.parse(signoff.at) > 15000) return undefined;
    setShown(signoff);
    setPhase("in");
    const t = [
      window.setTimeout(() => setPhase("land"), 30),
      window.setTimeout(() => setPhase("out"), 1900),
      window.setTimeout(() => { setPhase("idle"); setShown(null); }, 2600),
    ];
    return () => t.forEach(window.clearTimeout);
  }, [signoff]);
  if (!shown || phase === "idle") return null;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const label = OUTCOMES.find(([k]) => k === shown.outcome)?.[1] || shown.outcome;
  const tone = { proceed: "#1d6b43", proceed_with_conditions: "#965006", request_documents: "#965006", decline: "#b42318" }[shown.outcome] || "#14202e";
  const style = reduce
    ? { opacity: phase === "land" ? 1 : 0, transition: "opacity 300ms ease-out" }
    : {
        opacity: phase === "land" ? 1 : 0,
        transform: phase === "in" ? "scale(1.9) rotate(-14deg)" : phase === "land" ? "scale(1) rotate(-6deg)" : "scale(1.04) rotate(-6deg) translateY(-12px)",
        transition: phase === "out" ? "opacity 600ms ease-in, transform 600ms ease-in" : "opacity 260ms ease-out, transform 380ms cubic-bezier(.2,1.4,.4,1)",
      };
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" style={{ background: phase === "land" ? "rgba(20,32,46,0.08)" : "transparent", transition: "background 400ms ease-out" }}>
      <div style={{ ...style, borderColor: tone, color: tone }} className="rounded-md border-[5px] bg-white/95 px-10 py-5 text-center shadow-[0_24px_60px_-20px_rgba(20,32,46,0.5)]">
        <p className="font-heading text-[34px] font-black uppercase leading-none tracking-[0.12em]">Signed off</p>
        <p className="mt-2 text-base font-bold">{label}</p>
        <p className="mt-1 text-xs font-medium opacity-80">{shown.by} · {new Date(shown.at).toLocaleString()}</p>
      </div>
    </div>
  );
}
