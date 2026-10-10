import { format, parseISO } from "date-fns";
import { base44 } from "@/api/base44Client";
import { SIGNAL_TYPES, SOURCES } from "@/lib/signalTypes";

// Signal dates are "YYYY-MM-DD". new Date("2026-09-12") is UTC midnight, which
// shows as Sep 11 in US time zones, so parse them as local dates instead.
// The stored why line starts with the status ("Red: CFO departure ..."). Screens
// show it next to the status badge, so drop the repeated word there.
export function reasonText(why) {
  const text = (why || "").replace(/^(red|yellow|green)\s*:\s*/i, "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

// Seeded sample companies use the reserved .example domain (src/lib/seedData.js).
// refreshBorrower refuses to check them live; screens tag them "Sample".
export function isSampleCompany(borrower) {
  return /\.example$/i.test(String(borrower?.website_domain || "").trim());
}

export function parseSignalDate(dateStr) {
  return parseISO(dateStr);
}

// Sort order for the loan book: Red, Yellow, Green, then Not checked.
// Within each group, larger loan first.
const STATUS_ORDER = { red: 0, yellow: 1, green: 2 };

export function sortBorrowers(borrowers) {
  return [...borrowers].sort((a, b) => {
    const aNotChecked = !a.last_refreshed;
    const bNotChecked = !b.last_refreshed;
    if (aNotChecked && !bNotChecked) return 1;
    if (!aNotChecked && bNotChecked) return -1;
    if (aNotChecked && bNotChecked) {
      return (b.loan_amount_usd || 0) - (a.loan_amount_usd || 0);
    }
    const aOrder = STATUS_ORDER[a.status] ?? 3;
    const bOrder = STATUS_ORDER[b.status] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (b.loan_amount_usd || 0) - (a.loan_amount_usd || 0);
  });
}

// Top signal = newest strong signal; if none, newest weak signal; if none, null.
export function getTopSignal(signals) {
  if (!signals || signals.length === 0) return null;
  const byDate = (a, b) => new Date(b.date) - new Date(a.date);
  const strong = signals.filter((s) => s.severity === "strong").sort(byDate);
  if (strong.length > 0) return strong[0];
  const weak = signals.filter((s) => s.severity === "weak").sort(byDate);
  return weak[0] || null;
}

// Keep only signals within the last N days (default 90).
export function filterRecentSignals(signals, days = 90) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  return (signals || []).filter((s) => s.date >= cutoffStr);
}

export function formatUsd(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  // Thresholds sit where rounding would carry into the next unit (999,500 is "$1.0M", not "$1000K").
  if (num >= 999_950_000) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 999_500) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num}`;
}

export function formatRelative(dateStr) {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), "MMM d, yyyy 'at' h:mm a O");
  } catch {
    return null;
  }
}
// ---------------------------------------------------------------------------
// UI helpers (loan book + detail).
// ---------------------------------------------------------------------------


export const RECENT_DAYS = 90;
export const POLL_INTERVAL_MS = 3000;

// Status key used for display: "not_checked" until the first refresh lands.
export function statusKey(borrower) {
  if (!borrower?.last_refreshed) return "not_checked";
  return borrower.status || "not_checked";
}

export function isAtRisk(borrower) {
  const key = statusKey(borrower);
  return key === "red" || key === "yellow";
}

// Counts per status and dollar totals for the summary strip.
export function summarizeBook(borrowers) {
  const counts = { red: 0, yellow: 0, green: 0, not_checked: 0 };
  const exposure = { red: 0, yellow: 0, green: 0, not_checked: 0 };
  (borrowers || []).forEach((b) => {
    const key = statusKey(b);
    counts[key] += 1;
    exposure[key] += Number(b.loan_amount_usd) || 0;
  });
  const total = Object.values(exposure).reduce((a, n) => a + n, 0);
  return { counts, exposure, total, atRisk: exposure.red + exposure.yellow };
}

export function formatUsdFull(n) {
  if (n === null || n === undefined || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Source (News / Legal / Jobs / Reviews) a signal came from.
export function sourceOfSignal(signal) {
  return SIGNAL_TYPES[signal?.type]?.source || null;
}

// Splits signals into the last N days (count toward status) and older ones.
export function splitByRecency(signals, days = RECENT_DAYS) {
  const recent = filterRecentSignals(signals, days);
  const recentIds = new Set(recent.map((s) => s.id ?? `${s.type}-${s.date}-${s.title}`));
  const older = (signals || []).filter(
    (s) => !recentIds.has(s.id ?? `${s.type}-${s.date}-${s.title}`)
  );
  return { recent, older };
}

// Groups signals newest first into [{ key: "2026-09", label: "September 2026", items }].
export function groupSignalsByMonth(signals) {
  const sorted = [...(signals || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const groups = [];
  sorted.forEach((s) => {
    const key = (s.date || "").slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(s);
    } else {
      let label = key || "Undated";
      try {
        label = format(parseSignalDate(s.date), "MMMM yyyy");
      } catch {
        // keep the raw key
      }
      groups.push({ key, label, items: [s] });
    }
  });
  return groups;
}

// --- Sorting for the loan book table -------------------------------------

const SORTERS = {
  company: (a, b) => (a.borrower.name || "").localeCompare(b.borrower.name || ""),
  stage: (a, b) => (a.borrower.stage || "").localeCompare(b.borrower.stage || ""),
  signal: (a, b) => (a.topSignal?.date || "").localeCompare(b.topSignal?.date || ""),
  amount: (a, b) => (Number(a.borrower.loan_amount_usd) || 0) - (Number(b.borrower.loan_amount_usd) || 0),
  checked: (a, b) => (a.borrower.last_refreshed || "").localeCompare(b.borrower.last_refreshed || ""),
};

// rows: [{ borrower, topSignal }]. Returns a new sorted array. "status" (or any
// unknown key) uses the loan book risk order: red, yellow, green, not checked,
// larger amounts first within each.
export function sortRows(rows, key, dir) {
  if (!SORTERS[key]) {
    const order = sortBorrowers(rows.map((r) => r.borrower));
    const byId = new Map(rows.map((r) => [r.borrower.id, r]));
    const sorted = order.map((b) => byId.get(b.id));
    return dir === "desc" ? sorted.reverse() : sorted;
  }
  const factor = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => factor * SORTERS[key](a, b));
}

// --- Refresh runs ----------------------------------------------------------
// refreshBorrower can take minutes and saves progressively. Runs live in a
// module-level registry so the "Screen new applicant" dialog can start one and
// the detail page can pick it up after navigation.

const activeRuns = new Map();

export function getActiveRefresh(borrowerId) {
  return activeRuns.get(borrowerId) || null;
}

// snapshot: { unavailableBefore: string[], signalIdsBefore: string[] }
export function startRefresh(borrowerId, snapshot) {
  const existing = activeRuns.get(borrowerId);
  if (existing) return existing;
  const run = {
    borrowerId,
    startedAt: Date.now(),
    snapshot: {
      unavailableBefore: snapshot?.unavailableBefore || [],
      signalIdsBefore: snapshot?.signalIdsBefore || [],
    },
    promise: null,
  };
  run.promise = base44.functions
    .invoke("refreshBorrower", { borrower_id: borrowerId })
    .then(
      (res) => ({ ok: true, data: res?.data }),
      (e) => ({
        ok: false,
        error:
          e?.response?.data?.error ||
          e?.data?.error ||
          e?.message ||
          "Refresh failed. Try again.",
      })
    )
    .finally(() => activeRuns.delete(borrowerId));
  activeRuns.set(borrowerId, run);
  return run;
}

// Per-source state for the source-status row:
// "ok" | "unavailable" | "checking" | "not_checked".
// While a run is active, a source counts as answered once a new signal from it
// arrives or its entry in sources_unavailable changes; otherwise it is checking.
// Which signal function feeds each source (matches refreshBorrower).
const SOURCE_FUNCTION = { News: "newsSignals", Legal: "newsSignals", Jobs: "hiringSignal", Reviews: "reviewSignals" };

// Why a source has no fresh result, from what the company record already holds.
// "collecting": Bright Data is still building a snapshot that the next refresh
// resumes (refreshBorrower keeps its id in pending_snapshots).
export function sourceNote(borrower, src) {
  if (borrower?.pending_snapshots?.[SOURCE_FUNCTION[src]]) return { collecting: true };
  // profile_search is written by findCompanyPages, the automatic page lookup.
  const lookup = borrower?.profile_search || {};
  const domain = lookup.domain || borrower?.website_domain;
  if (src === "Jobs" && !borrower?.linkedin_url) {
    if (lookup.linkedin === "not_found") return { note: `No LinkedIn page found that lists ${domain}` };
    if (lookup.linkedin === "error") return { note: "LinkedIn page lookup failed. Refresh to try again." };
    return { note: "Needs the company's LinkedIn page" };
  }
  if (src === "Reviews" && !borrower?.glassdoor_url) {
    if (lookup.glassdoor === "not_found") return { note: "No Glassdoor page could be confirmed for this company" };
    if (lookup.glassdoor === "error") return { note: "Glassdoor page lookup failed. Refresh to try again." };
    return { note: "Needs the company's Glassdoor page" };
  }
  return null;
}

export function deriveSourceStates(borrower, signals, run) {
  const unavailableNow = new Set(borrower?.sources_unavailable || []);
  const states = {};
  SOURCES.forEach((src) => {
    if (!run) {
      if (!borrower?.last_refreshed) states[src] = "not_checked";
      else if (!unavailableNow.has(src)) states[src] = "ok";
      else states[src] = sourceNote(borrower, src)?.collecting ? "collecting" : "unavailable";
      return;
    }
    const before = new Set(run.snapshot.signalIdsBefore);
    const wasUnavailable = run.snapshot.unavailableBefore.includes(src);
    const hasNewSignal = (signals || []).some(
      (s) => sourceOfSignal(s) === src && s.id && !before.has(s.id)
    );
    if (hasNewSignal) states[src] = "ok";
    else if (unavailableNow.has(src) !== wasUnavailable) {
      states[src] = unavailableNow.has(src) ? "unavailable" : "ok";
    } else states[src] = "checking";
  });
  return states;
}
