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
      className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch border border-ew-rule bg-ew-surface"
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 divide-x divide-ew-rule-soft">
          {ORDER.map((key) => {
            const style = STATUS_STYLES[key];
            const active = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusFilter(active ? null : key)}
                className={`group flex min-w-0 flex-1 items-baseline justify-between gap-3 px-4 py-3 text-left transition-colors focus-visible:-outline-offset-2 ${
                  active ? "bg-ew-paper" : "hover:bg-ew-hover"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ew-ink-soft">
                  <span aria-hidden="true" className={`inline-block ${style.glyph}`} />
                  {style.label}
                  {active && <span className="text-xs font-normal text-ew-muted">(filter on)</span>}
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

      <div className="flex min-w-[220px] flex-col justify-center border-l border-ew-rule bg-ew-hover px-5 py-3">
        <span className="text-xs font-medium text-ew-muted">Exposure at risk</span>
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
