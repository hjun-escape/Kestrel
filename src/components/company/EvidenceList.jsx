import React from "react";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import { parseSignalDate } from "@/lib/borrowerUtils";
import { TYPE_LABELS, safeUrl, sourceLabelOf } from "@/components/company/plainLabels";

// The top warning signs in the verdict card: what happened, when, the exact quote and where it came from.
export default function EvidenceList({ signals }) {
  return (
    <ol className="mt-2 divide-y divide-ew-rule-soft">
      {signals.map((s, i) => (
        <EvidenceItem key={s.id || `${s.type}-${s.date}-${i}`} signal={s} />
      ))}
    </ol>
  );
}

function EvidenceItem({ signal: s }) {
  const date = s.date ? parseSignalDate(s.date) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  const url = safeUrl(s.source_url);
  const source = sourceLabelOf(s);
  const typeLabel = TYPE_LABELS[s.type] || SIGNAL_TYPES[s.type]?.label || s.type;
  const strong = s.severity === "strong";
  return (
    <li className="py-3 first:pt-1 last:pb-0">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ew-muted">
        {validDate && (
          <time dateTime={s.date} className="font-medium text-ew-ink-soft">
            {s.date_approx ? "around " : ""}
            {format(date, "MMM d, yyyy")}
          </time>
        )}
        <span>{typeLabel}</span>
        <span className={`rounded-sm border px-1 text-[11px] font-semibold leading-[16px] ${strong ? "border-ew-ink bg-ew-ink text-white" : "border-ew-rule text-ew-ink-soft"}`}>
          {strong ? "Strong" : "Weak"}
          <span className="sr-only"> warning sign</span>
        </span>
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-snug text-ew-ink">{s.title}</p>
      {s.snippet && (
        <blockquote className="mt-1 border-l-2 border-ew-rule pl-3 text-sm leading-relaxed text-ew-ink-soft">
          &ldquo;{s.snippet}&rdquo;
        </blockquote>
      )}
      {url ? (
        <a
          href={url.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-sm text-xs font-medium text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink"
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{source}</span>
          <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <span className="mt-1.5 inline-block text-xs text-ew-muted">{source}: link missing</span>
      )}
    </li>
  );
}
