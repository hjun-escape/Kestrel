// Pure helpers for the Devin double-check panel and the assistant card.

export const POLL_INTERVAL_MS = 10_000;
export const POLL_LIMIT_MS = 20 * 60_000;

export const VERDICTS = {
  supported: { label: 'Confirmed', tone: 'text-ew-green' },
  contradicted: { label: 'Contradicted', tone: 'text-ew-red' },
  unresolved: { label: 'Could not confirm', tone: 'text-ew-amber' },
};

export function verdictInfo(value) {
  return VERDICTS[value] || VERDICTS.unresolved;
}

export function isActiveRun(run) {
  return !!run && ['queued', 'running', 'blocked'].includes(run.status);
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function countVerdicts(findings = []) {
  const counts = { supported: 0, contradicted: 0, unresolved: 0 };
  for (const f of findings) counts[f?.verdict in counts ? f.verdict : 'unresolved'] += 1;
  return counts;
}

export function devinErrorMessage(error) {
  const status = error?.response?.status ?? error?.status;
  if (status === 503) return 'Devin is not connected.';
  if (status === 429) return 'Devin has reached its hourly limit for this company. Try again in a little while.';
  if (status === 401 || status === 403) return 'Sign in with access to this company to ask Devin.';
  const fromBody = error?.response?.data?.error || error?.data?.error;
  if (typeof fromBody === 'string' && fromBody) return fromBody;
  return error?.message || 'Devin could not complete the double-check.';
}

// A run is "stale" for polling once it has been active longer than the limit.
export function pollExpired(run, now = Date.now()) {
  const started = Date.parse(run?.started_at || '');
  return Number.isFinite(started) && now - started > POLL_LIMIT_MS;
}
