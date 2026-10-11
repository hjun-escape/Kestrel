import React from "react";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { formatUsd, summarizeBook } from "@/lib/borrowerUtils";

const ORDER = ["red", "yellow", "green", "not_checked"];

// Counts per status (each doubles as a filter) and exposure at risk, with a
// bar showing how the dollars in view split across statuses.
export default function SummaryStrip({ borrowers, statusFilter, onStatusFilter, loading }) {
  const { counts, exposure, total, atRisk } = summarizeBook(borrowers);
  const share = total > 0 ? Math.round((atRisk / total) * 100) : 0;

  return (
    <section
      aria-label="Loan book summary"
      className="grid grid-cols-1 items-stretch border border-ew-rule bg-ew-surface md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="flex min-w-0 flex-col">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-px bg-ew-rule-soft md:flex md:gap-0 md:divide-x md:divide-ew-rule-soft md:bg-transparent">
          {ORDER.map((key) => {
            const style = STATUS_STYLES[key];
            const active = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusFilter(active ? null : key)}
                className={`group flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3 text-left transition-colors focus-visible:-outline-offset-2 md:px-4 md:py-4 ${
                  active ? "bg-ew-paper" : "bg-ew-surface hover:bg-ew-hover"
                }`}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ew-ink-soft">
                  <span aria-hidden="true" className={`inline-block ${style.glyph}`} />
                  {style.label}
                  {active && <span className="font-normal normal-case text-ew-muted">(filter on)</span>}
                </span>
                <span className="font-mono text-2xl font-medium leading-none text-ew-ink">
                  {loading ? "–" : counts[key]}
                </span>
              </button>
            );
          })}
        </div>
        <ExposureBar exposure={exposure} total={total} />
      </div>

      <div className="flex flex-col justify-center border-t border-ew-rule bg-ew-hover px-4 py-3 md:min-w-[220px] md:border-l md:border-t-0 md:px-5">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ew-muted">Exposure at risk</span>
        <span className="font-mono text-[28px] font-semibold leading-tight text-ew-ink">
          {loading ? "–" : formatUsd(atRisk)}
        </span>
        <span className="text-xs text-ew-muted">
          {loading ? " " : `${share}% of ${formatUsd(total)} in view, red and yellow`}
        </span>
      </div>
    </section>
  );
}

function ExposureBar({ exposure, total }) {
  if (total <= 0) return <div className="h-1.5 bg-ew-rule-soft" aria-hidden="true" />;
  const parts = ORDER.filter((k) => exposure[k] > 0);
  const label = parts
    .map((k) => `${STATUS_STYLES[k].label} ${formatUsd(exposure[k])}`)
    .join(", ");
  return (
    <div className="flex h-1.5 w-full gap-px bg-ew-surface" role="img" aria-label={`Exposure by status: ${label}`}>
      {parts.map((k) => (
        <div
          key={k}
          className={STATUS_STYLES[k].rail}
          style={{ flexGrow: exposure[k], flexBasis: 0 }}
          title={`${STATUS_STYLES[k].label}: ${formatUsd(exposure[k])}`}
        />
      ))}
    </div>
  );
}
