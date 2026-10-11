import React, { useEffect, useState } from "react";
import SourceCard from "@/components/company/SourceCard";
import { SOURCES } from "@/lib/signalTypes";
import { sourceNote, sourceOfSignal } from "@/lib/borrowerUtils";

// Elapsed seconds since startedAt, ticking once a second while a check runs.
function useElapsed(startedAt, running) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : null;
}

// Four sources side by side, named by what was searched with their state. While a check runs, a progress
// bar shows how many sources have answered and how long the check has run.
export default function SourceStatusRow({ borrower, states, recentSignals, running, startedAt }) {
  const answered = SOURCES.filter((s) => states[s] !== "checking").length;
  const elapsed = useElapsed(startedAt, running);
  const pct = Math.round((answered / SOURCES.length) * 100);
  return (
    <section data-demo="sources" aria-labelledby="sources-heading">
      <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
        <h3 id="sources-heading" className="text-xs font-semibold text-ew-muted">
          Four sources, searched for the last 90 days
        </h3>
        <p aria-live="polite" className="sr-only">
          {running ? `${answered} of ${SOURCES.length} answered` : ""}
        </p>
      </div>
      {running && (
        <div className="px-5 pb-3">
          <div className="mb-1 flex justify-between text-xs tabular-nums text-ew-ink-soft">
            <span>
              Checking sources: {answered} of {SOURCES.length} answered
            </span>
            {elapsed !== null && <span>{elapsed} s</span>}
          </div>
          <div
            role="progressbar"
            aria-label="Sources answered"
            aria-valuemin={0}
            aria-valuemax={SOURCES.length}
            aria-valuenow={answered}
            className="h-1.5 w-full overflow-hidden rounded-sm bg-ew-rule"
          >
            <div
              className="h-full bg-ew-ink transition-all duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </div>
        </div>
      )}
      <ul className="grid grid-cols-2 gap-px border-t border-ew-rule bg-ew-rule md:grid-cols-4">
        {SOURCES.map((src) => (
          <SourceCard
            key={src}
            source={src}
            state={states[src]}
            recentCount={recentSignals.filter((s) => sourceOfSignal(s) === src).length}
            note={sourceNote(borrower, src)?.note}
          />
        ))}
      </ul>
    </section>
  );
}
