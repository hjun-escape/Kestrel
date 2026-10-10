import React from "react";
import { Check, CircleSlash, Loader2, Minus } from "lucide-react";
import { SOURCES } from "@/lib/signalTypes";

// Compact News / Legal / Jobs / Reviews progress. states from
// deriveSourceStates: "ok" | "unavailable" | "checking" | "not_checked".
const STATES = {
  ok: { label: "Checked", Icon: Check, tone: "text-ew-green" },
  unavailable: { label: "Unavailable", Icon: CircleSlash, tone: "text-ew-muted" },
  checking: { label: "Checking", Icon: Loader2, tone: "text-ew-focus", spin: true },
  not_checked: { label: "Not checked", Icon: Minus, tone: "text-ew-muted" },
};

export default function SourceProgress({ states, running, label = null, ariaLabel = "Source progress" }) {
  const answered = SOURCES.filter((s) => states[s] && states[s] !== "checking").length;
  return (
    <div>
      <div className={`flex items-baseline justify-between ${label || running ? "mb-1.5" : ""}`}>
        {label ? <span className="text-xs font-semibold text-ew-muted">{label}</span> : <span />}
        {running && (
          <span className="font-mono text-[11px] text-ew-ink-soft">
            {answered} of {SOURCES.length} answered
          </span>
        )}
      </div>
      <div
        className="mb-2 grid grid-cols-4 gap-0.5"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={SOURCES.length}
        aria-valuenow={answered}
      >
        {SOURCES.map((src) => (
          <span
            key={src}
            className={`h-1 rounded-[1px] transition-colors duration-500 ${
              states[src] === "ok" ? "bg-ew-ink" : states[src] === "unavailable" ? "bg-ew-rule" : "bg-ew-rule-soft"
            }`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-4 gap-0.5">
        {SOURCES.map((src) => {
          const s = STATES[states[src]] || STATES.not_checked;
          const { Icon } = s;
          return (
            <li key={src} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-semibold text-ew-ink">{src}</span>
              <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold ${s.tone}`}>
                <Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${s.spin ? "animate-spin" : ""}`} />
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="sr-only">
        {running ? `${answered} of ${SOURCES.length} sources answered` : ""}
      </p>
    </div>
  );
}
