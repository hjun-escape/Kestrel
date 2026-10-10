import { format } from "date-fns";

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
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num}`;
}

export function formatRelative(dateStr) {
  if (!dateStr) return null;
  try {
    return format(new Date(dateStr), "MMM d, yyyy 'at' HH:mm 'UTC'");
  } catch {
    return null;
  }
}