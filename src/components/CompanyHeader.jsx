import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { StatusLegendPopover } from "@/components/StatusLegend";
import { countForRules, ruleLine } from "@/lib/statusRules.ts";
import { SOURCES } from "@/lib/signalTypes";
import { formatRelative, formatUsdFull, isSampleCompany, reasonText } from "@/lib/borrowerUtils";
import { coverageText, sourceCoverage } from "@/lib/sourceCoverage";

// Detail header: identity, status with the reason, key facts, the Refresh
// control with per-source progress, and Edit / Delete.
export default function CompanyHeader({ borrower, signals = [], sourceStates, running, refreshError, onRefresh, onEdit, onDelete }) {
  const hq = [borrower.hq_city, borrower.hq_state].filter(Boolean).join(", ");
  const isApplicant = borrower.stage === "applicant";
  // Partial check: say how many of the four sources the status rests on.
  // Not for samples (never checked live) or while a check is running.
  const coverage = !running && !isSampleCompany(borrower) ? coverageText(sourceCoverage(borrower)) : null;
  // The rule behind the status, counted as of the last check (same 90-day rule as scoreBorrower).
  // Shown only when it matches the stored status (e.g. not after evidence was edited by hand).
  const counts = !running && borrower.last_refreshed ? countForRules(signals, borrower.last_refreshed) : null;
  const rule = counts && counts.status === borrower.status ? ruleLine(counts) : null;
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="min-w-0">
          <h1 className="break-words font-heading text-[28px] font-bold leading-[1.05] tracking-tight text-ew-ink md:text-[32px]">
            {borrower.name}
          </h1>
          {isSampleCompany(borrower) && (
            <p className="mt-2 flex items-center gap-2 text-xs text-ew-muted">
              <span className="rounded-sm border border-ew-rule bg-ew-surface px-1.5 text-[11px] font-semibold leading-[18px] text-ew-muted">Sample</span>
              Made-up company and signals, shown so the screens have something in them. It is not checked live.
            </p>
          )}
          <div data-demo="status-why" className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:gap-3">
            <div className="flex shrink-0 items-center gap-1.5">
              <StatusBadge status={borrower.status} lastRefreshed={borrower.last_refreshed} size="lg" />
              <StatusLegendPopover iconOnly />
            </div>
            <p className="max-w-[68ch] pt-0.5 text-[15px] leading-snug text-ew-ink-soft">
              {borrower.last_refreshed
                ? reasonText(borrower.why) || "No warning signs in the last 90 days."
                : running
                  ? "First check in progress. Status is set when it finishes."
                  : "Not checked yet. Refresh to run the first check."}
            </p>
          </div>
          {rule && (
            <p className="mt-1.5 text-xs font-medium tabular-nums text-ew-ink-soft">
              Rule: {rule}
            </p>
          )}
          {coverage && (
            <p className="mt-1.5 text-xs text-ew-muted">{coverage}</p>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 md:w-[220px]">
          <RefreshControl sourceStates={sourceStates} running={running} error={refreshError} onRefresh={onRefresh} sample={isSampleCompany(borrower)} />
          {(onEdit || onDelete) && (
            <div className="flex justify-end gap-1">
              {/* Disabled during a check: the refresh is still writing this company's evidence. */}
              {onEdit && (
                <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={running} className="h-8 rounded-sm px-2 text-ew-ink-soft hover:text-ew-ink">
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
              )}
              {onDelete && (
                <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={running} className="h-8 rounded-sm px-2 text-ew-ink-soft hover:text-ew-red">
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ew-rule-soft pt-4 sm:grid-cols-3 xl:grid-cols-6">
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

function RefreshControl({ sourceStates, running, error, onRefresh, sample }) {
  const answered = SOURCES.filter((s) => sourceStates[s] !== "checking").length;
  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        onClick={onRefresh}
        disabled={running || sample}
        title={sample ? "Sample companies are not checked live" : undefined}
        className={
          sample
            ? "h-9 rounded-sm border border-ew-rule bg-ew-surface text-ew-muted disabled:opacity-100"
            : "h-9 rounded-sm bg-ew-ink hover:bg-ew-ink-soft disabled:opacity-100 disabled:bg-ew-ink-soft"
        }
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
