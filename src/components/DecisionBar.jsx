import React, { useState } from "react";
import { Check } from "lucide-react";

const OPTIONS = [
  { value: "request_docs", label: "Request cash-flow documents" },
  { value: "decline", label: "Decline" },
  { value: "proceed", label: "Proceed" },
];

// Decision note for an applicant flagged red or yellow. Local state only:
// nothing is saved, and the panel says so.
export default function DecisionBar({ companyName }) {
  const [choice, setChoice] = useState(null);
  const selected = OPTIONS.find((o) => o.value === choice);

  return (
    <section aria-labelledby="decision-heading" className="border border-ew-rule bg-ew-surface">
      <div className="border-b border-ew-rule-soft px-4 py-3">
        <h2 id="decision-heading" className="font-heading text-sm font-bold text-ew-ink">
          Decision note
        </h2>
        <p className="mt-0.5 text-xs text-ew-muted">
          A working note for this review. It is not saved or sent.
        </p>
      </div>
      <div className="flex flex-col gap-1.5 p-3" role="group" aria-label={`Decision note for ${companyName}`}>
        {OPTIONS.map((o) => {
          const active = choice === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => setChoice(active ? null : o.value)}
              className={`flex h-9 items-center justify-between rounded-sm border px-3 text-left text-sm transition-colors ${
                active
                  ? "border-ew-ink bg-ew-ink font-semibold text-white"
                  : "border-ew-rule bg-ew-surface text-ew-ink hover:border-ew-ink-soft hover:bg-ew-hover"
              }`}
            >
              {o.label}
              {active && <Check aria-hidden="true" className="h-4 w-4" />}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-[2.25rem] border-t border-ew-rule-soft px-4 py-2 text-xs text-ew-ink-soft">
        {selected ? `Noted: ${selected.label}. Local to this screen.` : "No decision noted yet."}
      </p>
    </section>
  );
}
