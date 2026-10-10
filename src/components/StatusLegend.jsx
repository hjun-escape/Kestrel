import React from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { NOT_AI_TEXT, STATUS_RULES, STRONG_EXAMPLES, WEAK_EXAMPLES } from "@/lib/statusRules.ts";

// What Red / Yellow / Green mean, in plain English (from user testing: testers asked
// what the colours mean and whether AI decides them). Same rules as scoreBorrower.
export default function StatusLegend({ compact = false }) {
  return (
    <div className="text-sm text-ew-ink-soft">
      <ul className="flex flex-col gap-1.5">
        {STATUS_RULES.map((r) => (
          <li key={r.status} className="flex items-start gap-2">
            <span
              className={`mt-px inline-flex w-[64px] shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[r.status].badge}`}
            >
              <span aria-hidden="true" className={`inline-block shrink-0 ${STATUS_STYLES[r.status].glyph}`} />
              {r.label}
            </span>
            <span className="leading-snug">{r.rule}</span>
          </li>
        ))}
      </ul>
      {!compact && (
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-ew-rule-soft pt-3 text-xs leading-snug">
          <div>
            <dt className="inline font-semibold text-ew-ink">Strong: </dt>
            <dd className="inline">{STRONG_EXAMPLES}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-ew-ink">Weak: </dt>
            <dd className="inline">{WEAK_EXAMPLES}</dd>
          </div>
        </dl>
      )}
      <p className="mt-3 border-l-2 border-ew-ink bg-ew-paper px-2 py-1.5 text-xs leading-snug text-ew-ink">{NOT_AI_TEXT}</p>
    </div>
  );
}

// "What do the colors mean?" button that opens the legend. Radix handles keyboard
// (Enter/Space opens, Escape closes and returns focus to the button).
export function StatusLegendPopover({ label = "What do the colors mean?", iconOnly = false, align = "start" }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={`inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-ew-ink-soft underline-offset-2 hover:text-ew-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-ink ${iconOnly ? "h-7 w-7 justify-center border border-ew-rule bg-ew-surface hover:bg-ew-hover hover:no-underline" : ""}`}
      >
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
        {!iconOnly && label}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[360px] max-w-[calc(100vw-32px)] rounded-sm border-ew-rule bg-ew-surface p-4">
        <p className="mb-2 font-heading text-sm font-bold text-ew-ink">What the colors mean</p>
        <StatusLegend />
      </PopoverContent>
    </Popover>
  );
}
