import React, { useId } from "react";
import { Link } from "react-router-dom";
import StatusBadge, { STATUS_STYLES } from "@/components/StatusBadge";
import { LastChecked, SampleTag, TopSignalSummary } from "@/components/LoanBookTable";
import { formatUsd, isSampleCompany, reasonText, statusKey } from "@/lib/borrowerUtils";

// The sort keys the table's column headers offer, for the phone sort picker.
export const SORT_OPTIONS = [
  { key: "status", label: "Status" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
  { key: "signal", label: "Top signal" },
  { key: "amount", label: "Amount" },
  { key: "checked", label: "Last checked" },
];

const SKELETON_CARDS = 4;

// The loan book on phones (below 768 px): one card per company, in the same
// order and filter as the table. Each card is a single link to the company.
export default function LoanBookCards({ rows, sort, onSortSet, loading }) {
  const sortId = useId();
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2 text-xs text-ew-muted">
        <label htmlFor={sortId}>Sort by</label>
        <select
          id={sortId}
          value={sort.key}
          onChange={(e) => onSortSet(e.target.value)}
          className="h-8 rounded-sm border border-ew-rule bg-ew-surface px-2 text-sm text-ew-ink"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <ul data-demo="loanbook-table" aria-label="Companies in the loan book" className="border border-ew-rule bg-ew-surface">
        {loading &&
          Array.from({ length: SKELETON_CARDS }).map((_, i) => <SkeletonCard key={i} />)}
        {!loading &&
          rows.map(({ borrower, topSignal }) => <BookCard key={borrower.id} borrower={borrower} topSignal={topSignal} />)}
      </ul>
    </div>
  );
}

function BookCard({ borrower: b, topSignal }) {
  const key = statusKey(b);
  return (
    <li data-demo={`row-${b.id}`} className="border-b border-ew-rule-soft last:border-0">
      <Link
        to={`/borrower/${b.id}`}
        className="relative block px-4 py-3 hover:bg-ew-hover focus-visible:bg-ew-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ew-focus"
      >
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STYLES[key].rail}`} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ew-ink">{b.name}</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ew-muted">
              {isSampleCompany(b) && <SampleTag />}
              <span className="shrink-0 capitalize">{b.stage}</span>
              <span className="truncate">{b.website_domain}</span>
            </div>
          </div>
          <div className="shrink-0">
            <StatusBadge status={b.status} lastRefreshed={b.last_refreshed} />
          </div>
        </div>

        <p className="mt-2 line-clamp-3 text-sm leading-snug text-ew-ink-soft">
          {reasonText(b.why) || (
            <span className="text-ew-muted">{b.last_refreshed ? "No reason recorded" : "Awaiting first check"}</span>
          )}
        </p>

        <div className="mt-2.5 flex items-end justify-between gap-3 text-[13px]">
          <div className="min-w-0">
            <TopSignalSummary topSignal={topSignal} />
          </div>
          <div className="shrink-0 text-right">
            <div className="font-medium tabular-nums text-ew-ink">{formatUsd(b.loan_amount_usd)}</div>
            <div className="mt-0.5 text-xs text-ew-muted">
              <LastChecked value={b.last_refreshed} />
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function SkeletonCard() {
  return (
    <li className="border-b border-ew-rule-soft px-4 py-3 last:border-0" aria-hidden="true">
      <div className="h-4 w-1/2 animate-pulse rounded-sm bg-ew-rule-soft" />
      <div className="mt-2 h-3 w-5/6 animate-pulse rounded-sm bg-ew-rule-soft" />
      <div className="mt-2 h-3 w-2/3 animate-pulse rounded-sm bg-ew-rule-soft" />
    </li>
  );
}
