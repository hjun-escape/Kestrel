import React from "react";
import SourceChip from "@/components/SourceChip";
import { SOURCES } from "@/lib/signalTypes";
import { sourceOfSignal } from "@/lib/borrowerUtils";

const DESCRIPTIONS = {
  News: "Executive departures",
  Legal: "Lawsuits, layoffs, liens",
  Jobs: "Hiring activity",
  Reviews: "Employee reviews",
};

// Four sources side by side with their state. While a check runs, an
// aria-live line announces how many sources have answered.
export default function SourceStatusRow({ states, recentSignals, running }) {
  const answered = SOURCES.filter((s) => states[s] !== "checking").length;
  return (
    <section aria-labelledby="sources-heading">
      <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
        <h2 id="sources-heading" className="text-xs font-semibold text-ew-muted">
          Sources
        </h2>
        <p aria-live="polite" className="sr-only">
          {running ? `${answered} of ${SOURCES.length} answered` : ""}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-px border-t border-ew-rule bg-ew-rule md:grid-cols-4">
        {SOURCES.map((src) => (
          <SourceChip
            key={src}
            source={src}
            description={DESCRIPTIONS[src]}
            state={states[src]}
            recentCount={recentSignals.filter((s) => sourceOfSignal(s) === src).length}
          />
        ))}
      </ul>
    </section>
  );
}
