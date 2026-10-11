import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudit, evidenceTests, suggestConsiderations, validateConsiderations, validateDecisions } from '../base44/functions/auditReport/logic.ts';
import { scoreBorrower } from '../base44/functions/scoreBorrower/entry.ts';
const today = '2026-10-10';
const borrower = { name: 'Acme', website_domain: 'acme.example', hq_city: 'Chicago', status: 'red', last_refreshed: '2026-10-10T00:00:00Z' };
const signals = [
  { id: 'a', type: 'exec_departure' as const, severity: 'strong' as const, date: today, title: 'CFO departs', snippet: 'CFO departs.', source_url: 'https://example.com/a' },
  { id: 'b', type: 'legal_layoffs' as const, severity: 'strong' as const, date: today, title: 'Supplier lawsuit', snippet: 'A different Acme is sued.', source_url: 'https://example.com/b' },
];
const calculateScore = async (ss: typeof signals) => scoreBorrower(ss, today);
const base = { borrower, signals, trace: null, considerations: [], decisions: [], today, calculateScore };

test('a stored quote never proves independent source verification', () => {
  const tests = evidenceTests(signals, { articles: [{ url: signals[0].source_url, snippet: signals[0].snippet, same_company: true }] }, today);
  assert.equal(tests.find(t => t.id === 'a:quote')?.verdict, 'needs_review');
  assert.equal(tests.find(t => t.id === 'a:identity')?.verdict, 'pass');
  assert.equal(tests.find(t => t.id === 'b:identity')?.verdict, 'needs_review');
});
test('wrong-company trace fails identity, unsafe source URL fails evidence', () => {
  const tests = evidenceTests([{ ...signals[0], source_url: 'javascript:alert(1)' }, signals[1]], { articles: [{ url: signals[1].source_url, snippet: signals[1].snippet, same_company: false }] }, today);
  assert.equal(tests.find(t => t.id === 'a:quote')?.verdict, 'fail');
  assert.equal(tests.find(t => t.id === 'b:identity')?.verdict, 'fail');
});
test('exclusion changes risk preview while preserving source snapshot and original score', async () => {
  const previous = await buildAudit(base);
  const run = await buildAudit({ ...base, previous, considerations: [{ id: 'c', text: 'Wrong company', enabled: true, mode: 'exclude', check: 'identity', signal_ids: ['b'] }] });
  assert.equal(previous.result.status, 'red');
  assert.equal(run.result.status, 'yellow');
  assert.equal(run.baseline.status, 'red');
  assert.equal(run.snapshot.signals.length, 2);
  assert.equal(run.comparison?.previous_status, 'red');
  assert.equal(borrower.status, 'red');
});
test('disabled exclusions and uncertain reviews never remove evidence', async () => {
  const run = await buildAudit({ ...base, considerations: [{ id: 'c', text: 'Wrong company?', enabled: false, mode: 'exclude', check: 'identity', signal_ids: ['b'] }], decisions: [{ signal_id: 'b', decision: 'uncertain', note: 'Investigate' }] });
  assert.equal(run.result.status, 'red');
  assert.deepEqual(run.excluded_signal_ids, []);
  assert.equal(run.considerations[0].outcome, 'not_applied');
});
test('incorrect reviewer decision excludes only the identified item', async () => {
  const run = await buildAudit({ ...base, decisions: [{ signal_id: 'b', decision: 'incorrect', note: 'Domain does not match' }] });
  assert.equal(run.result.status, 'yellow');
  assert.deepEqual(run.excluded_signal_ids, ['b']);
});
test('impossible/future dates fail and historical evidence requires review', () => {
  const ss = ['2026-02-30', '2026-10-11', '2026-01-01'].map((date, i) => ({ ...signals[0], id: String(i), date }));
  assert.deepEqual(evidenceTests(ss, null, today).filter(t => t.check === 'freshness').map(t => t.verdict), ['fail', 'fail', 'needs_review']);
});
test('unchecked companies cannot acquire a reassuring green preview', async () => {
  const run = await buildAudit({ ...base, borrower: { ...borrower, last_refreshed: '' }, signals: [] });
  assert.equal(run.result.status, 'not_checked');
  assert.equal(run.tests[0].verdict, 'needs_review');
});
test('considerations reject foreign evidence, empty exclusions, duplicates and oversized text', () => {
  const c = { id: 'c', text: 'Review', enabled: true, mode: 'exclude', check: 'identity', signal_ids: ['b'] };
  assert.throws(() => validateConsiderations([{ ...c, signal_ids: ['foreign'] }], signals));
  assert.throws(() => validateConsiderations([{ ...c, signal_ids: [] }], signals));
  assert.throws(() => validateConsiderations([c, c], signals));
  assert.throws(() => validateConsiderations([{ ...c, text: 'x'.repeat(601) }], signals));
  assert.throws(() => validateDecisions([{ signal_id: 'foreign', decision: 'incorrect', note: '' }], signals));
});
test('suggestions reuse only prior applied considerations for the same company identity', async () => {
  const payload = await buildAudit({ ...base, considerations: [{ id: 'c', text: 'Check identity', enabled: true, mode: 'consider', check: 'identity', signal_ids: ['b'] }] });
  const runs = [{ id: '1', payload, created_at: '2026-10-10', reviewed_by: 'Analyst' }];
  assert.equal(suggestConsiderations(runs, borrower)[0].enabled, false);
  assert.equal(suggestConsiderations(runs, borrower)[0].outcome, 'unresolved');
  assert.deepEqual(suggestConsiderations(runs, { ...borrower, website_domain: 'different.example' }), []);
});
