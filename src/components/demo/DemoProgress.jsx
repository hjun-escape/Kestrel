import React from "react";
import { X } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

const STATE_LABEL = {
  queued: { text: "Waiting", tone: "text-ew-muted", glyph: "h-2 w-2 rounded-full border border-ew-none" },
  checking: { text: "Checking", tone: "text-ew-ink", glyph: "h-2 w-2 animate-pulse rounded-full bg-ew-ink" },
  unavailable: { text: "Unavailable", tone: "text-ew-red", glyph: "h-2 w-2 bg-ew-red" },
  not_started: { text: "Not started", tone: "text-ew-muted", glyph: "h-2 w-2 rounded-full border border-ew-none" },
};

function headline(phase, items) {
  if (phase === "loading") return "Adding the demo companies";
  if (phase === "checking") {
    const finished = items.filter((i) => i.state === "done" || i.state === "unavailable").length;
    return `Checking public sources: ${finished} of ${items.length} done`;
  }
  if (phase === "cancelled") return "Checks stopped";
  if (phase === "error") return "The demo could not load";
  return "Demo companies loaded";
}

function ItemState({ item }) {
  if (item.state === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-ew-ink-soft">
        Done
        <StatusBadge status={item.status} lastRefreshed="checked" />
      </span>
    );
  }
  const s = STATE_LABEL[item.state] || STATE_LABEL.queued;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium ${s.tone}`} title={item.detail || undefined}>
      <span aria-hidden="true" className={`inline-block ${s.glyph}`} />
      {s.text}
    </span>
  );
}

// Compact live list for the demo loader: company and its state as text (plus the status badge once checked),
// then a one-line summary.
export default function DemoProgress({ phase, items, error, summary, onCancel, onDismiss }) {
  if (phase === "idle") return null;
  const running = phase === "loading" || phase === "checking";
  return (
    <section aria-label="Demo progress" className="mb-5 border border-ew-rule bg-ew-surface">
      <div className="flex items-center justify-between gap-3 border-b border-ew-rule-soft px-4 py-2.5">
        <p role="status" aria-live="polite" className="text-sm font-semibold text-ew-ink">
          {headline(phase, items)}
        </p>
        {phase === "checking" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm text-xs font-medium text-ew-ink-soft underline underline-offset-2 hover:text-ew-ink"
          >
            Stop checking
          </button>
        )}
        {!running && (
          <button type="button" onClick={onDismiss} aria-label="Close demo progress" className="rounded-sm p-1 text-ew-muted hover:text-ew-ink">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {error && <p className="px-4 py-3 text-sm text-ew-red">{error}</p>}

      {items.length > 0 && (
        <ul className="grid gap-x-8 px-4 py-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 border-b border-ew-rule-soft py-1.5 text-sm">
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-ew-ink">{it.name}</span>
              <ItemState item={it} />
            </li>
          ))}
        </ul>
      )}

      {!running && !error && summary && <p className="px-4 py-2.5 text-sm text-ew-ink-soft">{summary}</p>}
    </section>
  );
}
