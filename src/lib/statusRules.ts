// Plain-English status rules, shared by the status legend and the company page's rule line.
// Counting reuses scoreBorrower's own helpers (same 90-day window, same duplicate removal), so the
// line shown under the status always matches what the rules decided. Display only.
import { dedupeSignals, recentSignals, scoreBorrower, WINDOW_DAYS } from "../../base44/functions/scoreBorrower/entry.ts";
import type { Signal, Status } from "../../base44/functions/scoreBorrower/entry.ts";

export const STATUS_RULES: { status: Status; label: string; rule: string }[] = [
  { status: "red", label: "Red", rule: `2 or more strong warning signs in the last ${WINDOW_DAYS} days, or 1 strong + 2 weak.` },
  { status: "yellow", label: "Yellow", rule: "1 strong sign, or 2 or more weak." },
  { status: "green", label: "Green", rule: "No warning signs that count." },
];

export const STRONG_EXAMPLES =
  "CEO or CFO exit, WARN notice, bankruptcy, lender or supplier lawsuit, employee reviews mentioning layoffs, furloughs, late or missed pay, job postings 75% or more below normal for the company's size.";
export const WEAK_EXAMPLES =
  "Other senior exits, other lawsuits, liens or layoff news, a 90-day review rating 0.5 or more below the company's overall rating, job postings 50-75% below normal.";

export const NOT_AI_TEXT =
  "Status is set by fixed rules, not by AI. The same evidence always gives the same status. AI only reads articles and reviews; every quote is checked word for word against its source.";

export interface RuleCount {
  strong: number;
  weak: number;
  status: Status;
}

const STATUS_LABEL: Record<Status, string> = { red: "Red", yellow: "Yellow", green: "Green" };

// Counts what the rules count: signals in the 90 days up to `today`, duplicates once.
export function countForRules(signals: Signal[], today?: string): RuleCount {
  const day = /^\d{4}-\d{2}-\d{2}/.test(String(today ?? "")) ? String(today).slice(0, 10) : undefined;
  const recent = dedupeSignals(recentSignals(signals ?? [], day));
  const strong = recent.filter((s) => s.severity === "strong").length;
  const { status } = scoreBorrower(signals ?? [], day);
  return { strong, weak: recent.length - strong, status };
}

// "2 strong, 1 weak in the last 90 days → Red"
export function ruleLine({ strong, weak, status }: RuleCount): string {
  if (strong === 0 && weak === 0) return `No warning signs in the last ${WINDOW_DAYS} days → ${STATUS_LABEL[status]}`;
  return `${strong} strong, ${weak} weak in the last ${WINDOW_DAYS} days → ${STATUS_LABEL[status]}`;
}
