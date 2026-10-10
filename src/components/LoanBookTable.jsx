import React, { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import StatusBadge, { STATUS_STYLES } from "@/components/StatusBadge";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import { formatRelative, formatUsd, parseSignalDate, statusKey } from "@/lib/borrowerUtils";

const COLUMNS = [
  { key: "status", label: "Status", className: "w-[120px]" },
  { key: "company", label: "Company", className: "w-[21%]" },
  { key: "stage", label: "Stage", className: "w-[92px]" },
  { key: null, label: "Why", className: "" },
  { key: "signal", label: "Top signal", className: "w-[18%]" },
  { key: "amount", label: "Amount", className: "w-[96px]", align: "right" },
  { key: "checked", label: "Last checked", className: "w-[132px]" },
];

const SKELETON_ROWS = 6;

// Dense, sortable loan book table. Rows open the detail page on click; the
// company link is the keyboard target and Arrow Up / Down moves between rows.
export default function LoanBookTable({ rows, sort, onSort, loading }) {
  const navigate = useNavigate();
  const bodyRef = useRef(null);

  function handleKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = Array.from(bodyRef.current?.querySelectorAll("a[data-row-link]") || []);
    const idx = links.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowDown" ? Math.min(idx + 1, links.length - 1) : Math.max(idx - 1, 0);
    links[next].focus();
  }

  return (
    <div className="border border-ew-rule bg-ew-surface">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <caption className="sr-only">
          Companies in the loan book. Use the column buttons to sort; use Arrow Up and Down to move between rows.
        </caption>
        <thead>
          <tr className="border-b border-ew-rule bg-ew-hover text-left">
            {COLUMNS.map((col) => (
              <HeaderCell key={col.label} col={col} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef} onKeyDown={handleKeyDown}>
          {loading &&
            Array.from({ length: SKELETON_ROWS }).map((_, i) => <SkeletonRow key={i} />)}
          {!loading &&
            rows.map(({ borrower: b, topSignal }) => (
              <BookRow
                key={b.id}
                borrower={b}
                topSignal={topSignal}
                onOpen={() => navigate(`/borrower/${b.id}`)}
              />
            ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell({ col, sort, onSort }) {
  const alignRight = col.align === "right";
  if (!col.key) {
    return (
      <th scope="col" className={`px-3 py-2 text-xs font-semibold text-ew-muted ${col.className}`}>
        {col.label}
      </th>
    );
  }
  const active = sort.key === col.key;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={`p-0 ${col.className}`}>
      <button
        type="button"
        onClick={() => onSort(col.key)}
        className={`flex w-full items-center gap-1 whitespace-nowrap px-3 py-2 text-xs font-semibold focus-visible:-outline-offset-2 ${
          alignRight ? "justify-end" : ""
        } ${active ? "text-ew-ink" : "text-ew-muted hover:text-ew-ink"}`}
      >
        {col.label}
        <Icon aria-hidden="true" className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
      </button>
    </th>
  );
}

function BookRow({ borrower: b, topSignal, onOpen }) {
  const key = statusKey(b);
  const typeLabel = topSignal ? SIGNAL_TYPES[topSignal.type]?.label || topSignal.type : null;
  return (
    <tr
      onClick={onOpen}
      className="group cursor-pointer border-b border-ew-rule-soft align-top last:border-0 hover:bg-ew-hover focus-within:bg-ew-hover"
    >
      <td className="relative px-3 py-2.5">
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STYLES[key].rail}`}
        />
        <StatusBadge status={b.status} lastRefreshed={b.last_refreshed} />
      </td>
      <td className="px-3 py-2.5">
        <Link
          to={`/borrower/${b.id}`}
          data-row-link
          onClick={(e) => e.stopPropagation()}
          className="block truncate rounded-sm font-semibold text-ew-ink underline-offset-2 group-hover:underline"
        >
          {b.name}
        </Link>
        <div className="truncate font-mono text-[11px] text-ew-muted">{b.website_domain}</div>
      </td>
      <td className="px-3 py-2.5 capitalize text-ew-ink-soft">{b.stage}</td>
      <td className="px-3 py-2.5 text-ew-ink-soft">
        <span className="line-clamp-2">
          {b.why || <span className="text-ew-muted">{b.last_refreshed ? "No reason recorded" : "Awaiting first check"}</span>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {topSignal ? (
          <div className="min-w-0">
            <div className="truncate font-medium text-ew-ink">{typeLabel}</div>
            <div className="font-mono text-[11px] text-ew-muted">
              {format(parseSignalDate(topSignal.date), "dd MMM yyyy")}
              {topSignal.severity === "strong" ? ", strong" : ", weak"}
            </div>
          </div>
        ) : (
          <span className="text-ew-muted">None in 90 days</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono font-medium text-ew-ink">
        {formatUsd(b.loan_amount_usd)}
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-ew-muted">
        {b.last_refreshed ? (
          <time dateTime={b.last_refreshed} title={formatRelative(b.last_refreshed)}>
            {formatDistanceToNowStrict(new Date(b.last_refreshed), { addSuffix: true })}
          </time>
        ) : (
          "Never"
        )}
      </td>
    </tr>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-ew-rule-soft last:border-0" aria-hidden="true">
      {COLUMNS.map((col) => (
        <td key={col.label} className="px-3 py-3">
          <div className="h-3 w-3/4 animate-pulse rounded-sm bg-ew-rule-soft" />
        </td>
      ))}
    </tr>
  );
}
