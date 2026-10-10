import React from "react";
import { Check, CircleSlash, Loader2, Minus } from "lucide-react";

// One cell in the source-status row (News, Legal, Jobs, Reviews).
// state: "ok" | "unavailable" | "checking" | "not_checked"
const STATES = {
  ok: {
    label: "Checked",
    Icon: Check,
    cell: "bg-ew-surface",
    text: "text-ew-ink",
  },
  unavailable: {
    label: "Unavailable",
    Icon: CircleSlash,
    cell: "bg-ew-none-bg",
    text: "text-ew-muted",
  },
  checking: {
    label: "Checking",
    Icon: Loader2,
    cell: "bg-ew-surface",
    text: "text-ew-focus",
    spin: true,
  },
  not_checked: {
    label: "Not checked",
    Icon: Minus,
    cell: "bg-ew-surface",
    text: "text-ew-muted",
  },
};

const DETAIL = {
  ok: (n) => (n === 0 ? "No signals in 90 days" : `${n} signal${n === 1 ? "" : "s"} in 90 days`),
  unavailable: () => "Source did not answer. Earlier signals kept.",
  checking: () => "Waiting for results",
  not_checked: () => "Runs on first check",
};

export default function SourceChip({ source, description, state = "not_checked", recentCount = 0 }) {
  const s = STATES[state] || STATES.not_checked;
  const { Icon } = s;
  return (
    <li className={`flex min-w-0 flex-col gap-0.5 px-4 py-3 ${s.cell}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-sm font-bold text-ew-ink">{source}</span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.text}`}>
          <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${s.spin ? "animate-spin" : ""}`} />
          {s.label}
        </span>
      </div>
      <span className="text-xs text-ew-muted">{description}</span>
      <span className={`text-xs ${state === "ok" && recentCount > 0 ? "font-medium text-ew-ink-soft" : "text-ew-muted"}`}>
        {DETAIL[state](recentCount)}
      </span>
    </li>
  );
}
