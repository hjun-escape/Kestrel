import React, { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import StatusBadge, { STATUS_STYLES } from "@/components/StatusBadge";
import SourcesNote from "@/components/loanbook/SourcesNote";
import { formatAgoShort, formatRelative, formatUsd, isSampleCompany, reasonText, statusKey } from "@/lib/borrowerUtils";

const COLUMNS = [
  { key: "company", label: "Company", className: "w-[22%]" },
  { key: "status", label: "Status", className: "w-[150px]" },
  { key: null, label: "Why", className: "" },
  { key: "amount", label: "Amount", className: "w-[104px]", align: "right" },
  { key: "checked", label: "Last checked", className: "w-[128px]" },
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
    <div data-demo="loanbook-table" className="border border-ew-rule bg-ew-surface">
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
            rows.map(({ borrower: b }) => (
              <BookRow
                key={b.id}
                borrower={b}
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
      <th scope="col" className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ew-muted ${col.className}`}>
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
        className={`flex w-full items-center gap-1 whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] focus-visible:-outline-offset-2 ${
          alignRight ? "justify-end" : ""
        } ${active ? "text-ew-ink" : "text-ew-muted hover:text-ew-ink"}`}
      >
        {col.label}
        <Icon aria-hidden="true" className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
      </button>
    </th>
  );
}

function BookRow({ borrower: b, onOpen }) {
  const key = statusKey(b);
  return (
    <tr
      data-demo={`row-${b.id}`}
      onClick={onOpen}
      className="group cursor-pointer border-b border-ew-rule-soft align-top last:border-0 hover:bg-ew-hover focus-within:bg-ew-hover"
    >
      <td className="relative px-3 py-3">
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${STATUS_STYLES[key].rail}`} />
        <Link
          to={`/borrower/${b.id}`}
          data-row-link
          onClick={(e) => e.stopPropagation()}
          className="block truncate rounded-sm font-semibold text-ew-ink underline-offset-2 group-hover:underline"
        >
          {b.name}
        </Link>
        <div className="flex min-w-0 items-center gap-1.5">
          {isSampleCompany(b) && <SampleTag />}
          <span className="truncate text-xs text-ew-muted">{b.website_domain}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={b.status} lastRefreshed={b.last_refreshed} />
        <SourcesNote borrower={b} />
      </td>
      <td className="px-3 py-3 text-sm leading-snug text-ew-ink-soft">
        {reasonText(b.why) || <span className="text-ew-muted">{b.last_refreshed ? "No reason recorded" : "Awaiting first check"}</span>}
      </td>
      <td className="px-3 py-3 text-right font-mono font-medium text-ew-ink">{formatUsd(b.loan_amount_usd)}</td>
      <td className="px-3 py-3 font-mono text-xs text-ew-muted">
        <LastChecked value={b.last_refreshed} />
      </td>
    </tr>
  );
}

// "57 min ago" with the full timestamp on hover, or "Never". Shared with the phone cards.
export function LastChecked({ value }) {
  if (!value) return "Never";
  return (
    <time dateTime={value} title={formatRelative(value)}>
      {formatAgoShort(value)}
    </time>
  );
}

// Sample tag for seeded .example companies. Shared with the phone cards.
export function SampleTag() {
  return (
    <span title="Sample company with made-up data. It is not checked live." className="shrink-0 rounded-sm border border-ew-rule bg-ew-surface px-1.5 text-[11px] font-semibold leading-[18px] text-ew-muted">
      Sample
    </span>
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
