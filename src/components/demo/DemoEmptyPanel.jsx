import React from "react";
import LoadDemoButton from "./LoadDemoButton";

// Shown on the signed-out shared book while it holds only the seeded sample companies (.example, made-up data).
export default function DemoEmptyPanel({ running, onLoad }) {
  return (
    <section
      aria-label="Load real demo companies"
      className="mb-5 flex flex-col gap-3 border border-dashed border-ew-rule bg-ew-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-heading text-base font-semibold text-ew-ink">These are sample companies with made-up data</p>
        <p className="mt-0.5 max-w-[640px] text-sm text-ew-muted">
          Load six real mid-size companies, some with recent public warning signs and some clean, and watch the live
          checks run. Loan amounts are fictional. No account needed.
        </p>
      </div>
      <LoadDemoButton signedIn={false} running={running} onClick={onLoad} variant="default" className="shrink-0 bg-ew-ink hover:bg-ew-ink-soft" />
    </section>
  );
}
