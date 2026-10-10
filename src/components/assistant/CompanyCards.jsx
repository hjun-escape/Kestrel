import React from "react";
import { Pin } from "lucide-react";
import StatusBadge, { STATUS_STYLES } from "@/components/StatusBadge";
import { formatUsd, statusKey, summarizeBook, formatUsdFull } from "@/lib/borrowerUtils";
import { useAssistantPage } from "./AssistantContext";

// Cards for the companies an answer is about. Clicking one pins it as the
// chat's context and opens it in the context panel.
export function CompanyCards({ data }) {
  const { byId, pinnedId, setPinned } = useAssistantPage();
  const companies = (data?.ids || []).map((id) => byId[id]).filter(Boolean);
  if (!companies.length) return null;
  return (
    <section aria-label="Companies in this answer" className="mt-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {companies.map((c) => {
          const key = statusKey(c);
          const pinned = pinnedId === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setPinned(pinned ? null : c.id)}
                aria-pressed={pinned}
                aria-label={`${c.name}, ${STATUS_STYLES[key].label}. ${pinned ? "Pinned. Select to unpin." : "Select to pin as chat context."}`}
                className={`group relative flex h-full w-full flex-col gap-1.5 overflow-hidden rounded-sm border bg-ew-surface py-2.5 pl-4 pr-3 text-left transition-[border-color,box-shadow] hover:border-ew-ink-soft hover:shadow-[0_1px_0_var(--ew-rule)] ${
                  pinned ? "border-ew-ink" : "border-ew-rule"
                }`}
              >
                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${STATUS_STYLES[key].rail}`} />
                <span className="flex items-start justify-between gap-2">
                  <span className="font-heading text-[15px] font-bold leading-tight text-ew-ink">{c.name}</span>
                  <StatusBadge status={c.status} lastRefreshed={c.last_refreshed} />
                </span>
                {c.why && <span className="line-clamp-2 text-[13px] leading-snug text-ew-ink-soft">{c.why}</span>}
                <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-ew-muted">
                  <span>
                    <span className="capitalize">{c.stage}</span>
                    {c.loan_amount_usd ? <span className="ml-2 font-mono text-ew-ink">{formatUsd(c.loan_amount_usd)}</span> : null}
                  </span>
                  <span className={`inline-flex items-center gap-1 font-medium ${pinned ? "text-ew-ink" : "text-ew-muted group-hover:text-ew-ink"}`}>
                    <Pin aria-hidden="true" className="h-3 w-3" />
                    {pinned ? "Pinned" : "Pin"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ORDER = ["red", "yellow", "green", "not_checked"];

// Counts by status plus exposure at risk, computed from the live book.
export function PortfolioSummaryCard() {
  const { companies } = useAssistantPage();
  if (!companies?.length) return null;
  const { counts, exposure, total, atRisk } = summarizeBook(companies);
  return (
    <section aria-label="Portfolio summary" className="mt-4 rounded-sm border border-ew-rule bg-ew-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-ew-rule-soft px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-ew-muted">Exposure at risk</p>
          <p className="font-mono text-2xl font-semibold tracking-tight text-ew-ink">{formatUsdFull(atRisk)}</p>
        </div>
        <p className="text-right text-xs text-ew-muted">
          of <span className="font-mono text-ew-ink">{formatUsdFull(total)}</span>
          <br />
          Red and yellow loans, as of now
        </p>
      </div>
      <div className="flex h-1.5 w-full" aria-hidden="true">
        {ORDER.map((k) =>
          exposure[k] > 0 ? (
            <span key={k} className={STATUS_STYLES[k].rail} style={{ flexGrow: exposure[k] }} />
          ) : null
        )}
      </div>
      <dl className="grid grid-cols-4 divide-x divide-ew-rule-soft">
        {ORDER.map((k) => (
          <div key={k} className="px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-ew-ink-soft">
              <span aria-hidden="true" className={`inline-block shrink-0 ${STATUS_STYLES[k].glyph}`} />
              {STATUS_STYLES[k].label}
            </dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold text-ew-ink">{counts[k]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
