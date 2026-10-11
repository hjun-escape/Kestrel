// Evidence checks are deterministic. A check passing is not a measured accuracy percentage.
export const CHECKS = ['identity', 'quote', 'support', 'freshness', 'duplicates', 'score'] as const;
export type Verdict = 'pass' | 'fail' | 'needs_review';
export type Signal = { id: string; type: string; severity: string; date: string; title: string; snippet?: string; source_url?: string; source_name?: string };
export type Consideration = { id: string; text: string; enabled: boolean; mode: 'consider' | 'exclude'; check: string; signal_ids: string[] };
export type Decision = { signal_id: string; decision: 'confirmed' | 'incorrect' | 'uncertain'; note: string };
type Test = { id: string; check: string; signal_id: string; title: string; verdict: Verdict; expected: string; actual: string; reason: string; source_url: string };
export type Payload = {
  version: number; identity: string; snapshot: { refreshed_at: string; status: string; signals: Signal[] };
  tests: Test[]; considerations: (Consideration & { outcome: string; reason: string; affected_signal_ids: string[] })[];
  decisions: Decision[]; excluded_signal_ids: string[];
  result: { status: string; why: string }; baseline: { status: string; why: string };
  comparison: { previous_status: string; added: string[]; removed: string[]; changed: string[]; tests_changed: number } | null;
};
export class InputError extends Error {}
const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
export function safeUrl(value: unknown): string {
  try { const u = new URL(String(value)); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function urlKey(value: unknown): string {
  const url = safeUrl(value);
  if (!url) return '';
  const u = new URL(url); u.hash = ''; return u.href.replace(/\/$/, '');
}
export function identityKey(borrower: any): string {
  return [borrower.name, borrower.website_domain, borrower.hq_city, borrower.hq_state].map(norm).join('|');
}
export function validateConsiderations(raw: unknown, signals: Signal[]): Consideration[] {
  if (!Array.isArray(raw) || raw.length > 20) throw new InputError('Provide at most 20 considerations.');
  const ids = new Set(signals.map(s => s.id));
  const seen = new Set<string>();
  return raw.map((c: any) => {
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 100 || seen.has(c.id) ||
      typeof c.text !== 'string' || !c.text.trim() || c.text.length > 600 || typeof c.enabled !== 'boolean' ||
      !['consider', 'exclude'].includes(c.mode) || !CHECKS.includes(c.check) ||
      !Array.isArray(c.signal_ids) || c.signal_ids.length > 200 || c.signal_ids.some((id: any) => typeof id !== 'string' || !ids.has(id))) {
      throw new InputError('Each consideration needs unique ID, text, a check, and valid evidence selections.');
    }
    seen.add(c.id);
    if (c.enabled && c.mode === 'exclude' && c.signal_ids.length === 0) throw new InputError('Select the evidence to exclude.');
    return { id: c.id, text: c.text.trim(), enabled: c.enabled, mode: c.mode, check: c.check, signal_ids: [...new Set<string>(c.signal_ids)] };
  });
}
export function validateDecisions(raw: unknown, signals: Signal[]): Decision[] {
  if (!Array.isArray(raw) || raw.length > 200) throw new InputError('Invalid reviewer decisions.');
  const ids = new Set(signals.map(s => s.id)); const seen = new Set();
  return raw.map((d: any) => {
    if (!d || !ids.has(d.signal_id) || seen.has(d.signal_id) || !['confirmed', 'incorrect', 'uncertain'].includes(d.decision) || typeof d.note !== 'string' || d.note.length > 1000) throw new InputError('Invalid reviewer decision or note.');
    seen.add(d.signal_id);
    return { signal_id: d.signal_id, decision: d.decision, note: d.note.trim() };
  });
}
function ageDays(date: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return null;
  return (Date.parse(`${today}T00:00:00Z`) - ms) / 86400000;
}
export function evidenceTests(signals: Signal[], trace: any, today: string): Test[] {
  const tests: Test[] = [];
  for (const s of signals) {
    const article = (trace?.articles || []).find((a: any) => urlKey(a.url) && urlKey(a.url) === urlKey(s.source_url) && norm(a.snippet) === norm(s.snippet));
    const add = (check: string, title: string, verdict: Verdict, expected: string, actual: string, reason: string) => tests.push({ id: `${s.id}:${check}`, check, signal_id: s.id, title, verdict, expected, actual, reason, source_url: safeUrl(s.source_url) });
    add('identity', 'Company identity', article?.same_company === true ? 'pass' : article?.same_company === false ? 'fail' : 'needs_review', 'A recorded check identifies this exact company.', article ? `Recorded same-company check: ${String(article.same_company ?? 'unknown')}` : 'No matching identity check recorded.', article ? (article.why || article.reason || 'Verdict comes from the recorded collection check; independent identity confirmation is still a reviewer responsibility.') : 'A matching name alone does not establish identity. Check domain, location and company relationship.');
    const usableQuote = !!norm(s.snippet) && !String(s.snippet).startsWith('[placeholder]');
    add('quote', 'Source evidence', !safeUrl(s.source_url) || !usableQuote ? 'fail' : 'needs_review', 'The quote or computed fact is supported by original source material.', usableQuote && safeUrl(s.source_url) ? 'Source link and evidence text recorded.' : 'Missing valid source or usable evidence text.', usableQuote && safeUrl(s.source_url) ? 'The collection trace does not retain the full source document. Open the source to verify the quote; stored snippets alone cannot prove a match.' : 'A missing source, empty quote or placeholder cannot support the finding.');
    add('support', 'Claim support', 'needs_review', 'The evidence supports this precise claim and severity.', s.title, 'Read the quoted evidence in context. An automated tag is not an independent confirmation that the claim is justified.');
    const age = ageDays(s.date, today);
    add('freshness', 'Dates and freshness', age === null || age < 0 ? 'fail' : age <= 90 ? 'pass' : 'needs_review', 'A valid, non-future date within the 90-day scoring window.', age === null ? `Invalid date: ${s.date}` : `${age} days old (${s.date}).`, age === null || age < 0 ? 'Invalid or future dates must not count toward current risk.' : age > 90 ? 'This evidence is historical and does not count toward current risk. Confirm the event date against the source.' : 'The recorded date is in the scoring window; confirm that it is the event date rather than a publication update.');
    const duplicates = signals.filter(other => other.id !== s.id && other.type === s.type &&
      ((norm(other.title) === norm(s.title) && other.date === s.date) || (urlKey(s.source_url) && urlKey(other.source_url) === urlKey(s.source_url) && norm(other.title) === norm(s.title))));
    add('duplicates', 'Duplicate signals', duplicates.length ? 'fail' : 'pass', 'No other signal matches the same event fingerprint.', duplicates.length ? `Possible duplicate IDs: ${duplicates.map(d => d.id).join(', ')}` : 'No exact event duplicates found.', duplicates.length ? 'Matching type and title with the same date or URL identifies a duplicate. The scoring rules deduplicate these matches.' : 'No exact duplicates found. Different headlines about the same event still require manual review.');
  }
  return tests;
}
export async function buildAudit({ borrower, signals, trace, considerations, decisions, previous, today, calculateScore }: {
  borrower: any; signals: Signal[]; trace: any; considerations: Consideration[]; decisions: Decision[]; previous?: Payload | null; today: string;
  calculateScore: (signals: Signal[], today: string) => Promise<{ status: string; why: string }>;
}): Promise<Payload> {
  const baseline = await calculateScore(signals, today);
  const excluded = new Set(considerations.filter(c => c.enabled && c.mode === 'exclude').flatMap(c => c.signal_ids));
  decisions.filter(d => d.decision === 'incorrect').forEach(d => excluded.add(d.signal_id));
  const result = excluded.size ? await calculateScore(signals.filter(s => !excluded.has(s.id)), today) : baseline;
  if (!borrower.last_refreshed) { baseline.status = 'not_checked'; result.status = 'not_checked'; baseline.why = result.why = 'No completed source check; current risk cannot be established.'; }
  const tests = evidenceTests(signals, trace, today);
  tests.push({ id: 'report:score', check: 'score', signal_id: '', title: 'Score consistency',
    verdict: !borrower.last_refreshed || (borrower.sources_unavailable || []).length ? 'needs_review' : baseline.status === borrower.status ? 'pass' : 'fail',
    expected: 'Stored status matches the current deterministic 90-day scoring rules.', actual: `Stored: ${borrower.last_refreshed ? borrower.status : 'not_checked'}. Recomputed: ${baseline.status}.`,
    reason: !borrower.last_refreshed ? 'The company has not completed a source check.' : (borrower.sources_unavailable || []).length ? 'Some sources are unavailable. A consistent score would not establish complete coverage.' : baseline.status === borrower.status ? baseline.why : 'Stored status differs from the current evidence and rules, possibly because evidence aged out. Refresh the company.', source_url: '' });
  const evaluated = considerations.map(c => {
    const selected = tests.filter(t => t.check === c.check && (!c.signal_ids.length || c.signal_ids.includes(t.signal_id)));
    const outcome = !c.enabled ? 'not_applied' : c.mode === 'exclude' ? 'applied' : !selected.length || selected.some(t => t.verdict === 'needs_review') ? 'unresolved' : selected.some(t => t.verdict === 'fail') ? 'unsupported' : 'supported';
    return { ...c, outcome, affected_signal_ids: c.mode === 'exclude' && c.enabled ? c.signal_ids : [...new Set(selected.map(t => t.signal_id).filter(Boolean))],
      reason: !c.enabled ? 'Disabled for this run.' : c.mode === 'exclude' ? 'User-directed exclusion from the review risk preview. The original evidence is retained.' : `Applied the ${c.check} check to ${selected.length} result(s). ${selected.filter(t => t.verdict === 'pass').length} passed, ${selected.filter(t => t.verdict === 'fail').length} failed, ${selected.filter(t => t.verdict === 'needs_review').length} need review. The note is a review instruction, not proof of its factual premise.` };
  });
  const old = previous?.snapshot.signals || [];
  const comparable = previous && previous.identity === identityKey(borrower);
  return { version: 1, identity: identityKey(borrower), snapshot: { refreshed_at: borrower.last_refreshed || '', status: borrower.status, signals }, tests, considerations: evaluated, decisions, excluded_signal_ids: [...excluded], result, baseline,
    comparison: comparable ? { previous_status: previous.result.status,
      added: signals.filter(s => !old.some(o => o.id === s.id)).map(s => s.id), removed: old.filter(o => !signals.some(s => s.id === o.id)).map(s => s.id),
      changed: signals.filter(s => { const o = old.find(o => o.id === s.id); return o && JSON.stringify(o) !== JSON.stringify(s); }).map(s => s.id),
      tests_changed: tests.filter(t => previous.tests.find(p => p.id === t.id)?.verdict !== t.verdict).length } : null };
}
export function suggestConsiderations(runs: any[], borrower: any) {
  const seen = new Set<string>(); const suggestions: any[] = [];
  for (const run of runs) {
    const payload: Payload = typeof run.payload === 'string' ? JSON.parse(run.payload) : run.payload;
    if (payload.identity !== identityKey(borrower)) continue;
    for (const c of payload.considerations) {
      const key = `${norm(c.text)}|${c.mode}|${c.check}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!c.enabled || c.outcome === 'not_applied') continue;
      suggestions.push({ ...c, enabled: false, run_id: run.id, tested_at: run.created_at, tested_by: run.reviewed_by });
    }
  }
  return suggestions.slice(0, 20);
}
