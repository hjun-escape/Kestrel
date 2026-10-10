// Time-to-flag: how long after an application was entered the first strong warning
// appeared, from a strong Signal or a CashflowReview with a strong flag.
// Pure and dependency-free so both the UI and Node tests can import it.

export interface DatedBorrower {
  created_date?: string;
}

export interface DatedSignal {
  severity?: string;
  created_date?: string;
}

export interface DatedReview {
  created_at?: string;
  created_date?: string;
  flags?: { severity?: string }[];
}

const MINUTE_MS = 60_000;

function time(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Minutes from Borrower.created_date to the earliest strong flag, or null if none. */
export function timeToFirstFlag(
  borrower: DatedBorrower | null | undefined,
  signals: DatedSignal[] | null | undefined,
  cashflowReviews: DatedReview[] | null | undefined,
): number | null {
  const start = time(borrower?.created_date);
  if (start === null) return null;
  const times: number[] = [];
  for (const s of signals ?? []) {
    const t = s?.severity === 'strong' ? time(s.created_date) : null;
    if (t !== null) times.push(t);
  }
  for (const r of cashflowReviews ?? []) {
    if (!r?.flags?.some((f) => f?.severity === 'strong')) continue;
    const t = time(r.created_at) ?? time(r.created_date);
    if (t !== null) times.push(t);
  }
  if (times.length === 0) return null;
  return Math.max(0, Math.round((Math.min(...times) - start) / MINUTE_MS));
}

/** "Flagged 6 min after application" and friends; null when there is no flag. */
export function formatTimeToFlag(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  if (minutes < 1) return 'Flagged within a minute of application';
  if (minutes < 60) return `Flagged ${minutes} min after application`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `Flagged ${h} h${m ? ` ${m} min` : ''} after application`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `Flagged ${days} day${days === 1 ? '' : 's'} after application`;
}
