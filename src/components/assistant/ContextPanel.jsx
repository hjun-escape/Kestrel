import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { PinOff, Pin } from "lucide-react";
import StatusBadge, { STATUS_STYLES } from "@/components/StatusBadge";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import {
  deriveSourceStates,
  filterRecentSignals,
  formatUsdFull,
  getActiveRefresh,
  statusKey,
} from "@/lib/borrowerUtils";
import { useAssistantPage } from "./AssistantContext";
import { findRunningAction, useActionStates } from "./actionStore";
import { hostOf, relativeTime, safeHref } from "./assistantData";
import { useCompanyLive } from "./useCompanyLive";
import SourceProgress from "./SourceProgress";

const MAX_SIGNALS = 5;

const RECOMMENDATION = {
  proceed: "Proceed",
  request_documents: "Request documents",
  escalate: "Escalate",
};

function Block({ title, children }) {
  return (
    <section className="border-t border-ew-rule-soft px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold text-ew-muted">{title}</h3>
      {children}
    </section>
  );
}

function Signals({ signals }) {
  const recent = filterRecentSignals(signals).slice(0, MAX_SIGNALS);
  if (!recent.length) return <p className="text-[13px] text-ew-muted">No signals in the last 90 days.</p>;
  return (
    <ul className="space-y-3">
      {recent.map((s) => {
        const href = safeHref(s.source_url);
        return (
          <li key={s.id || `${s.type}-${s.date}`} className="text-[13px] leading-snug">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-ew-ink">{SIGNAL_TYPES[s.type]?.label || s.type}</span>
              <span
                className="shrink-0 font-mono text-[11px] text-ew-muted"
                title={s.date_approx ? "Approximate date" : undefined}
              >
                {s.date_approx && "~"}
                {s.date}
              </span>
            </div>
            <p className="text-ew-ink-soft">
              {s.title}
              {s.severity === "strong" && <span className="ml-1 text-[11px] font-semibold text-ew-red">Strong</span>}
              {s.severity === "weak" && <span className="ml-1 text-[11px] font-semibold text-ew-amber">Weak</span>}
            </p>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink"
              >
                {s.source_name || hostOf(href)}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className="text-xs text-ew-muted">Source link missing</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Reviews({ analysis, lenderCheck, cashflow }) {
  if (!analysis && !lenderCheck && !cashflow) return null;
  return (
    <Block title="Latest reviews">
      <dl className="space-y-3 text-[13px] leading-snug">
        {analysis && (
          <div>
            <dt className="flex items-baseline justify-between gap-2 font-semibold text-ew-ink">
              Analyst brief
              {analysis.recommended_action && (
                <span className="text-[11px] font-semibold text-ew-ink-soft">{RECOMMENDATION[analysis.recommended_action] || analysis.recommended_action}</span>
              )}
            </dt>
            <dd className="line-clamp-4 text-ew-ink-soft">{analysis.summary}</dd>
          </div>
        )}
        {lenderCheck && (
          <div>
            <dt className="flex items-baseline justify-between gap-2 font-semibold text-ew-ink">
              Other lenders
              <span className="font-mono text-[11px] text-ew-ink-soft">{lenderCheck.lender_count ?? 0} found</span>
            </dt>
            <dd className="line-clamp-4 text-ew-ink-soft">{lenderCheck.summary}</dd>
          </div>
        )}
        {cashflow && (
          <div>
            <dt className="flex items-baseline justify-between gap-2 font-semibold text-ew-ink">
              Cash-flow review
              <span className="font-mono text-[11px] text-ew-ink-soft">{cashflow.lender_count ?? 0} lenders paid</span>
            </dt>
            <dd className="line-clamp-4 text-ew-ink-soft">{cashflow.summary}</dd>
          </div>
        )}
      </dl>
    </Block>
  );
}

function EmptyContext() {
  return (
    <div className="px-5 py-8">
      <h2 className="font-heading text-lg font-bold text-ew-ink">No company in focus</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ew-ink-soft">
        Pin a company from the portfolio list or a card in the chat. Its status, live source checks and latest
        evidence show here, and your questions default to it.
      </p>
    </div>
  );
}

// Right column: a dossier for the pinned company, or for the company the last
// answer was about. Polls every 3 s while a check runs on it.
export default function ContextPanel() {
  const { focusId, pinnedId, setPinned, byId } = useAssistantPage();
  const actions = useActionStates();
  const chatRun = findRunningAction(actions, focusId);
  const pageRun = focusId ? getActiveRefresh(focusId) : null;
  const run = chatRun || pageRun;
  const { data, loading, error } = useCompanyLive(focusId, { poll: Boolean(run), extras: true });

  const borrower = data?.borrower || (focusId ? byId[focusId] : null);
  const signals = data?.signals;
  const states = useMemo(
    () => deriveSourceStates(borrower, signals || [], run ? { snapshot: run.snapshot || { unavailableBefore: [], signalIdsBefore: [] } } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [borrower, signals, Boolean(run)]
  );

  if (!focusId) return <EmptyContext />;
  if (!borrower) {
    return <p className="px-5 py-8 text-sm text-ew-muted">{loading ? "Loading company" : error || "Company not found."}</p>;
  }

  const key = statusKey(borrower);
  const isPinned = pinnedId === borrower.id;
  return (
    <article aria-labelledby="context-company" className="relative">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${STATUS_STYLES[key].rail}`} />
      <header className="px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-ew-muted">{isPinned ? "Pinned company" : "From the last answer"}</p>
          <button
            type="button"
            onClick={() => setPinned(isPinned ? null : borrower.id)}
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-ew-ink hover:bg-ew-hover"
          >
            {isPinned ? <PinOff aria-hidden="true" className="h-3 w-3" /> : <Pin aria-hidden="true" className="h-3 w-3" />}
            {isPinned ? "Unpin" : "Pin"}
          </button>
        </div>
        <h2 id="context-company" className="mt-1 font-heading text-[22px] font-bold leading-tight tracking-tight text-ew-ink">
          {borrower.name}
        </h2>
        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ew-muted">
          <span className="break-all font-mono">{borrower.website_domain}</span>
          <span className="capitalize">{borrower.stage}</span>
          {borrower.loan_amount_usd ? <span className="font-mono text-ew-ink">{formatUsdFull(borrower.loan_amount_usd)}</span> : null}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <StatusBadge status={borrower.status} lastRefreshed={borrower.last_refreshed} size="lg" />
        </div>
        {borrower.why && key !== "not_checked" && <p className="mt-2 text-[13px] leading-snug text-ew-ink">{borrower.why}</p>}
        <p className="mt-2 text-xs text-ew-muted">
          {borrower.last_refreshed ? `Last checked ${relativeTime(borrower.last_refreshed)}` : "Not checked yet"}
        </p>
      </header>
      <Block title={run ? "Checking sources now" : "Sources"}>
        <SourceProgress states={states} running={Boolean(run)} ariaLabel={run ? "Live source check" : "Source status"} />
      </Block>
      <Block title="Latest signals">
        {signals ? <Signals signals={signals} /> : <p className="text-[13px] text-ew-muted">Loading signals</p>}
      </Block>
      <Reviews analysis={data?.analysis} lenderCheck={data?.lenderCheck} cashflow={data?.cashflow} />
      <div className="border-t border-ew-rule-soft px-5 py-4">
        <Link
          to={`/borrower/${borrower.id}`}
          className="inline-flex h-8 items-center rounded-sm border border-ew-ink px-3 text-sm font-semibold text-ew-ink hover:bg-ew-ink hover:text-white"
        >
          Open full company page
        </Link>
      </div>
    </article>
  );
}
