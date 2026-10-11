import React from "react";
import { Check, CircleSlash, Clock, Loader2, Minus } from "lucide-react";
import { SOURCE_LABELS } from "@/components/company/plainLabels";

// One source in "Sources searched": what was searched, whether it answered, and what it found, in plain words.
// state: "ok" | "unavailable" | "collecting" | "checking" | "not_checked"
const STATES = {
  ok: { label: "Checked", Icon: Check, cell: "bg-ew-surface", text: "text-ew-green" },
  unavailable: { label: "Could not reach", Icon: CircleSlash, cell: "bg-ew-none-bg", text: "text-ew-amber" },
  collecting: { label: "Still collecting", Icon: Clock, cell: "bg-ew-surface", text: "text-ew-ink-soft" },
  checking: { label: "Checking", Icon: Loader2, cell: "bg-ew-surface", text: "text-ew-focus", spin: true },
  not_checked: { label: "Not checked", Icon: Minus, cell: "bg-ew-surface", text: "text-ew-muted" },
};

const DETAIL = {
  ok: (n) => (n === 0 ? "No warning signs found" : `${n} warning sign${n === 1 ? "" : "s"} found`),
  unavailable: () => "Did not answer on the last check. Status may be understated.",
  collecting: () => "Results are still coming in. Re-check in a minute.",
  checking: () => "Waiting for results",
  not_checked: () => "Searched on the first check",
};

export default function SourceCard({ source, state = "not_checked", recentCount = 0, note }) {
  const s = STATES[state] || STATES.not_checked;
  const { Icon } = s;
  const label = SOURCE_LABELS[source] || { title: source, description: "" };
  return (
    <li className={`flex min-w-0 flex-col gap-0.5 px-4 py-3 ${s.cell}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-semibold text-ew-ink">{label.title}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.text}`}>
          <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${s.spin ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {s.label}
        </span>
      </div>
      <span className="text-xs text-ew-muted">{label.description}</span>
      <span className={`text-xs ${state === "ok" && recentCount > 0 ? "font-medium text-ew-ink-soft" : "text-ew-muted"}`}>
        {state === "unavailable" && note ? note : DETAIL[state](recentCount)}
        {state === "ok" && <span className="text-ew-muted"> in the last 90 days</span>}
      </span>
    </li>
  );
}
