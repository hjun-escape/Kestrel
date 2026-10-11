import React from "react";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { StatusLegendPopover } from "@/components/StatusLegend";

export const STATUS_MEANING = {
  red: "Act now",
  yellow: "Ask questions",
  green: "No warning signs",
};

const KEY_ITEMS = [
  { key: "red", detail: "2 or more serious warning signs in 90 days" },
  { key: "yellow", detail: "1 serious sign, or several minor ones" },
  { key: "green", detail: "none in 90 days" },
];

// Compact colour key, visible at every width (wraps instead of hiding).
export default function ColourKey() {
  return (
    <div data-demo="status-legend" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ew-muted">
      <ul aria-label="Colour key" className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {KEY_ITEMS.map(({ key, detail }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block shrink-0 ${STATUS_STYLES[key].glyph}`} />
            <span className="font-semibold text-ew-ink">{STATUS_STYLES[key].label}</span>
            <span>
              {STATUS_MEANING[key].toLowerCase()}: {detail}
            </span>
          </li>
        ))}
      </ul>
      <StatusLegendPopover align="start" label="How status is set" />
    </div>
  );
}
