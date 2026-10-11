// A company checked or attempted more recently than this is not checked again.
export const COOLDOWN_MS = 2 * 60_000;

/** Ms until this company may be checked again (0 = now). Counts from the later of the last success and the last attempt. */
export function cooldownLeft(borrower: { last_refreshed?: string | null; last_attempted?: string | null }, now: number): number {
  const times = [borrower?.last_refreshed, borrower?.last_attempted]
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return 0;
  const left = Math.max(...times) + COOLDOWN_MS - now;
  return left > 0 ? Math.min(left, COOLDOWN_MS) : 0;
}
