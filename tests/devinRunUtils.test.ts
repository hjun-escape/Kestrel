import test from 'node:test';
import assert from 'node:assert/strict';
import { countVerdicts, devinErrorMessage, formatElapsed, isActiveRun, pollExpired, verdictInfo } from '../src/components/devin/devinRunUtils.js';

test('verdict labels use banker language', () => {
  assert.equal(verdictInfo('supported').label, 'Confirmed');
  assert.equal(verdictInfo('contradicted').label, 'Contradicted');
  assert.equal(verdictInfo('anything').label, 'Could not confirm');
});

test('countVerdicts and elapsed formatting', () => {
  assert.deepEqual(countVerdicts([{ verdict: 'supported' }, { verdict: 'x' }, { verdict: 'contradicted' }]), { supported: 1, contradicted: 1, unresolved: 1 });
  assert.equal(formatElapsed(125_000), '2:05');
});

test('errors map by status', () => {
  assert.equal(devinErrorMessage({ response: { status: 503 } }), 'Devin is not connected.');
  assert.match(devinErrorMessage({ response: { status: 429 } }), /hourly limit/);
  assert.equal(devinErrorMessage({ response: { status: 400, data: { error: 'bad' } } }), 'bad');
});

test('active runs and the 20 minute poll limit', () => {
  assert.equal(isActiveRun({ status: 'blocked' }), true);
  assert.equal(isActiveRun({ status: 'finished' }), false);
  const now = Date.now();
  assert.equal(pollExpired({ started_at: new Date(now - 21 * 60_000).toISOString() }, now), true);
  assert.equal(pollExpired({ started_at: new Date(now - 5 * 60_000).toISOString() }, now), false);
});
