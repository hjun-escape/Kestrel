// Pure helpers for the company detail page: which sources are still being
// collected, whether to check again automatically, and how many of the four
// sources the last check covered. No React, no SDK, so node tests can import it.
import { SOURCES } from "./signalTypes.js";

// Which signal function feeds each source (matches refreshBorrower).
export const SOURCE_FUNCTION = { News: "newsSignals", Legal: "newsSignals", Jobs: "hiringSignal", Reviews: "reviewSignals" };

// Automatic re-checks while Bright Data is still building a snapshot.
export const AUTO_RESUME_DELAY_MS = 30_000;
export const AUTO_RESUME_MAX = 8;

/** Sources whose Bright Data snapshot is still building (pending_snapshots holds a non-empty id), in display order. */
export function pendingSources(borrower) {
  const pending = borrower?.pending_snapshots || {};
  return SOURCES.filter((src) => {
    const id = pending[SOURCE_FUNCTION[src]];
    return typeof id === "string" && id !== "";
  });
}

/**
 * Whether to start another refresh automatically after a run finished.
 * borrower: the company as reloaded after the run; attempts: automatic re-checks
 * already made on this page visit; lastResult: { ok } from the finished run;
 * stopped: the officer pressed Stop.
 */
export function shouldAutoResume({ borrower, attempts = 0, lastResult, stopped = false }) {
  if (stopped || !borrower) return false;
  if (!lastResult?.ok) return false;
  if (attempts >= AUTO_RESUME_MAX) return false;
  return pendingSources(borrower).length > 0;
}

/** "Jobs", "Jobs and Reviews", "News, Jobs and Reviews". */
export function joinList(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * How much of the last check answered. null before the first check.
 * A source counts as missing when it is in sources_unavailable or still collecting.
 */
export function sourceCoverage(borrower) {
  if (!borrower?.last_refreshed) return null;
  const unavailable = new Set(borrower.sources_unavailable || []);
  const collecting = new Set(pendingSources(borrower));
  const missing = SOURCES.filter((s) => unavailable.has(s) || collecting.has(s));
  return {
    checked: SOURCES.length - missing.length,
    total: SOURCES.length,
    collecting: missing.filter((s) => collecting.has(s)),
    unavailable: missing.filter((s) => !collecting.has(s)),
  };
}

/** "Checked 2 of 4 sources (Jobs and Reviews unavailable)", or null when all four answered or nothing was checked. */
export function coverageText(coverage) {
  if (!coverage || coverage.checked >= coverage.total) return null;
  const parts = [];
  if (coverage.unavailable.length) parts.push(`${joinList(coverage.unavailable)} unavailable`);
  if (coverage.collecting.length) parts.push(`${joinList(coverage.collecting)} still collecting`);
  return `Checked ${coverage.checked} of ${coverage.total} sources (${parts.join("; ")})`;
}
