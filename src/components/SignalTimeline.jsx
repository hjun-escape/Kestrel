import React from "react";
import { ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import { groupSignalsByMonth, parseSignalDate, splitByRecency, RECENT_DAYS } from "@/lib/borrowerUtils";

// Evidence timeline, newest first, grouped by month. Signals from the last 90
// days count toward status; older, future-dated and undated ones sit dimmed under
// "Outside the last 90 days".
// Each item: type, severity, date, title, the exact snippet as a quote, a
// source link (new tab) and a follow-up question.
export default function SignalTimeline({ signals, neverRefreshed, checking, newIds }) {
  const { recent, older } = splitByRecency(signals);

  if (recent.length === 0 && older.length === 0) {
    return <EmptyTimeline neverRefreshed={neverRefreshed} checking={checking} />;
  }

  return (
    <div>
      {recent.length === 0 ? (
        <p className="border border-ew-rule bg-ew-surface px-4 py-4 text-sm text-ew-muted">
          No signals in the last {RECENT_DAYS} days.
        </p>
      ) : (
        <MonthGroups signals={recent} newIds={newIds} />
      )}

      {older.length > 0 && (
        <section aria-labelledby="older-heading" className="mt-8">
          <div className="mb-2 flex items-baseline justify-between border-b border-dashed border-ew-rule pb-1.5">
            <h3 id="older-heading" className="text-sm font-semibold text-ew-muted">
              Outside the last {RECENT_DAYS} days
            </h3>
            <span className="text-xs text-ew-muted">Not counted in status</span>
          </div>
          <MonthGroups signals={older} dimmed newIds={newIds} />
        </section>
      )}
    </div>
  );
}

function MonthGroups({ signals, dimmed = false, newIds }) {
  return groupSignalsByMonth(signals).map((group) => (
    <section key={group.key} aria-label={group.label} className="mb-5 last:mb-0">
      <h3 className={`mb-1.5 flex items-baseline gap-2 text-xs font-semibold ${dimmed ? "text-ew-muted" : "text-ew-ink-soft"}`}>
        {group.label}
        <span className="font-normal tabular-nums text-ew-muted">{group.items.length}</span>
      </h3>
      <ol className={`border ${dimmed ? "border-dashed border-ew-rule bg-ew-hover" : "border-ew-rule bg-ew-surface"}`}>
        {group.items.map((s, i) => (
          <SignalItem key={s.id || `${s.type}-${s.date}-${i}`} signal={s} dimmed={dimmed} isNew={!!newIds?.has(s.id)} />
        ))}
      </ol>
    </section>
  ));
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function SignalItem({ signal: s, dimmed, isNew }) {
  const type = SIGNAL_TYPES[s.type] || { label: s.type, whatToAsk: "" };
  const isStrong = s.severity === "strong";
  const date = parseSignalDate(s.date);
  const url = safeUrl(s.source_url);
  const sourceLabel = s.source_name || url?.hostname.replace(/^www\./, "") || "Source";

  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] border-b border-ew-rule-soft last:border-0">
      <time
        dateTime={s.date}
        title={format(date, "d MMMM yyyy")}
        className="block border-r border-ew-rule-soft px-3 py-3 text-right leading-tight tabular-nums"
      >
        <span className={`block text-[15px] font-semibold ${dimmed ? "text-ew-muted" : "text-ew-ink"}`}>{format(date, "d")}</span>
        <span className="block text-[11px] text-ew-muted">{format(date, "MMM")}</span>
      </time>
      <article className="min-w-0 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold text-ew-ink-soft">{type.label}</span>
          <span
            className={`rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${
              isStrong ? "border-ew-ink bg-ew-ink text-white" : "border-ew-rule text-ew-ink-soft"
            }`}
          >
            {isStrong ? "Strong" : "Weak"}
            <span className="sr-only"> signal</span>
          </span>
          {isNew && (
            <span className="rounded-sm border border-ew-focus px-1.5 text-[11px] font-semibold leading-[18px] text-ew-focus">
              New
            </span>
          )}
        </div>
        <p className={`mt-1 text-[15px] font-semibold leading-snug ${dimmed ? "text-ew-ink-soft" : "text-ew-ink"}`}>{s.title}</p>
        {s.snippet && (
          <blockquote className="mt-1.5 border-l-2 border-ew-rule pl-3 text-sm leading-relaxed text-ew-ink-soft">
            &ldquo;{s.snippet}&rdquo;
          </blockquote>
        )}
        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1.5">
          {url ? (
            <a
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source: ${sourceLabel} (opens in a new tab)`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-ew-rule bg-ew-hover px-2 py-0.5 text-xs font-medium text-ew-ink hover:border-ew-ink-soft hover:bg-ew-surface"
            >
              <span className="truncate">{sourceLabel}</span>
              <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="rounded-sm border border-dashed border-ew-rule px-2 py-0.5 text-xs text-ew-muted">
              {sourceLabel}: link missing
            </span>
          )}
          {type.whatToAsk && !dimmed && (
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-ew-muted">
              <span className="font-semibold text-ew-ink-soft">Ask: </span>
              {type.whatToAsk}
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

function EmptyTimeline({ neverRefreshed, checking }) {
  if (checking) {
    return (
      <div className="border border-ew-rule bg-ew-surface" aria-busy="true">
        <p className="border-b border-ew-rule-soft px-4 py-3 text-sm text-ew-ink-soft">
          Checking sources. Signals appear here as each source answers.
        </p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[64px_minmax(0,1fr)] border-b border-ew-rule-soft last:border-0" aria-hidden="true">
            <div className="border-r border-ew-rule-soft px-3 py-3">
              <div className="ml-auto h-4 w-6 animate-pulse rounded-sm bg-ew-rule-soft" />
            </div>
            <div className="space-y-2 px-4 py-3">
              <div className="h-3 w-1/4 animate-pulse rounded-sm bg-ew-rule-soft" />
              <div className="h-3 w-2/3 animate-pulse rounded-sm bg-ew-rule-soft" />
              <div className="h-3 w-1/2 animate-pulse rounded-sm bg-ew-rule-soft" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <p className="border border-ew-rule bg-ew-surface px-4 py-6 text-sm text-ew-muted">
      {neverRefreshed
        ? "Not checked yet. Run a refresh to look for warning signs."
        : "No warning signs found in any source."}
    </p>
  );
}
