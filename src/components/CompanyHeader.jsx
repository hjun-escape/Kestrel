import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { SOURCES } from "@/lib/signalTypes";
import { formatRelative, formatUsdFull, reasonText } from "@/lib/borrowerUtils";

// Detail header: identity, status with the reason, key facts, and the Refresh
// control with per-source progress.
export default function CompanyHeader({ borrower, sourceStates, running, refreshError, onRefresh }) {
  const hq = [borrower.hq_city, borrower.hq_state].filter(Boolean).join(", ");
  const isApplicant = borrower.stage === "applicant";
  const facts = [
    { term: "Domain", value: borrower.website_domain },
    { term: "Headquarters", value: hq || "—" },
    { term: "Industry", value: borrower.industry || "—" },
    { term: "Stage", value: isApplicant ? "Applicant" : "Borrower" },
    { term: isApplicant ? "Amount requested" : "Loan amount", value: formatUsdFull(borrower.loan_amount_usd), numeric: true },
    { term: "Last refreshed", value: <LastRefreshed value={borrower.last_refreshed} /> },
  ];

  return (
    <div className="px-5 pb-4 pt-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-heading text-[32px] font-bold leading-[1.05] tracking-tight text-ew-ink">
            {borrower.name}
          </h1>
          <div data-demo="status-why" className="mt-3 flex items-start gap-3">
            <StatusBadge status={borrower.status} lastRefreshed={borrower.last_refreshed} size="lg" />
            <p className="max-w-[68ch] pt-0.5 text-[15px] leading-snug text-ew-ink-soft">
              {borrower.last_refreshed
                ? reasonText(borrower.why) || "No warning signs in the last 90 days."
                : running
                  ? "First check in progress. Status is set when it finishes."
                  : "Not checked yet. Refresh to run the first check."}
            </p>
          </div>
        </div>
        <RefreshControl sourceStates={sourceStates} running={running} error={refreshError} onRefresh={onRefresh} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3 border-t border-ew-rule-soft pt-4 xl:grid-cols-6">
        {facts.map((f) => (
          <div key={f.term} className="min-w-0">
            <dt className="text-xs text-ew-muted">{f.term}</dt>
            <dd title={typeof f.value === "string" ? f.value : undefined} className={`mt-0.5 truncate text-sm font-medium text-ew-ink ${f.numeric ? "tabular-nums" : ""}`}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LastRefreshed({ value }) {
  if (!value) return "Never";
  return (
    <time dateTime={value} title={formatRelative(value)}>
      {formatDistanceToNowStrict(new Date(value), { addSuffix: true })}
    </time>
  );
}

function RefreshControl({ sourceStates, running, error, onRefresh }) {
  const answered = SOURCES.filter((s) => sourceStates[s] !== "checking").length;
  return (
    <div className="flex w-[220px] shrink-0 flex-col items-stretch gap-2">
      <Button
        onClick={onRefresh}
        disabled={running}
        className="h-9 rounded-sm bg-ew-ink hover:bg-ew-ink-soft disabled:opacity-100 disabled:bg-ew-ink-soft"
      >
        <RefreshCw aria-hidden="true" className={running ? "animate-spin" : ""} />
        {running ? "Checking sources…" : "Refresh"}
      </Button>
      {running && (
        <div>
          <div
            className="flex gap-0.5"
            role="progressbar"
            aria-label="Sources answered"
            aria-valuemin={0}
            aria-valuemax={SOURCES.length}
            aria-valuenow={answered}
          >
            {SOURCES.map((s) => (
              <span
                key={s}
                title={`${s}: ${sourceStates[s]}`}
                className={`h-1 flex-1 ${sourceStates[s] === "checking" ? "animate-pulse bg-ew-rule" : "bg-ew-ink"}`}
              />
            ))}
          </div>
          <p className="mt-1 text-right text-[11px] tabular-nums text-ew-muted">
            {answered} of {SOURCES.length} sources answered
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="border-l-2 border-ew-red bg-ew-red-bg px-2 py-1 text-xs text-ew-red">
          {error}
        </p>
      )}
    </div>
  );
}
