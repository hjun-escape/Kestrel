import React from "react";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { STATUS_MEANING } from "@/components/loanbook/ColourKey";
import { formatUsd, summarizeBook } from "@/lib/borrowerUtils";

const TILE_ORDER = ["red", "yellow", "green"];

// Three status tiles (count + one-line meaning, each also filters the table), a plain
// "Amount in Red or Yellow" figure, and a neutral not-checked count.
export default function SummaryStrip({ borrowers, statusFilter, onStatusFilter, loading }) {
  const { counts, total, atRisk } = summarizeBook(borrowers);
  const share = total > 0 ? Math.round((atRisk / total) * 100) : 0;
  const notChecked = counts.not_checked;
  const notCheckedActive = statusFilter === "not_checked";

  return (
    <section aria-label="Loan book summary" className="border border-ew-rule bg-ew-surface">
      <div className="grid grid-cols-1 divide-y divide-ew-rule-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
        {TILE_ORDER.map((key) => {
          const style = STATUS_STYLES[key];
          const active = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusFilter(active ? null : key)}
              className={`relative flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus-visible:-outline-offset-2 sm:block ${
                active ? "bg-ew-paper" : "hover:bg-ew-hover"
              }`}
            >
              <span aria-hidden="true" className={`absolute inset-x-0 top-0 hidden h-[3px] sm:block ${style.rail}`} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-ew-ink">
                  <span aria-hidden="true" className={`inline-block shrink-0 ${style.glyph}`} />
                  {style.label}
                  {active && <span className="text-xs font-normal text-ew-muted">(showing only these)</span>}
                </span>
                <span className="mt-0.5 block text-xs text-ew-muted">{STATUS_MEANING[key]}</span>
              </span>
              <span className="font-mono text-3xl font-medium leading-none text-ew-ink sm:mt-2 sm:block">
                {loading ? "–" : counts[key]}
              </span>
            </button>
          );
        })}
        <div className="flex flex-col justify-center bg-ew-hover px-4 py-3 sm:col-span-3 lg:col-span-1">
          <span className="text-sm font-semibold text-ew-ink">Amount in Red or Yellow</span>
          <span className="font-mono text-[26px] font-semibold leading-tight text-ew-ink">
            {loading ? "–" : formatUsd(atRisk)}
          </span>
          <span className="text-xs text-ew-muted">
            {loading ? " " : `${share}% of the ${formatUsd(total)} shown`}
          </span>
        </div>
      </div>
      {!loading && notChecked > 0 && (
        <div className="border-t border-ew-rule-soft px-4 py-2 text-xs text-ew-muted">
          <button
            type="button"
            aria-pressed={notCheckedActive}
            onClick={() => onStatusFilter(notCheckedActive ? null : "not_checked")}
            className="rounded-sm underline-offset-2 hover:text-ew-ink hover:underline"
          >
            {notChecked} {notChecked === 1 ? "company has" : "companies have"} not been checked yet
            {notCheckedActive && " (showing only these)"}
          </button>
        </div>
      )}
    </section>
  );
}
