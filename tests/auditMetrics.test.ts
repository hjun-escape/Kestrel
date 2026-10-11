import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfidence, reviewerAccuracy } from '../src/lib/auditMetrics.js';

test('check-based confidence excludes unresolved checks from passes, but not the denominator', () => {
  const tests = [...Array(11).fill({ verdict: 'pass' }), ...Array(10).fill({ verdict: 'needs_review' })];
  assert.deepEqual(checkConfidence(tests), { percent: 52, passed: 11, failed: 0, unresolved: 10, total: 21 });
  assert.equal(checkConfidence([]).percent, null);
  assert.equal(checkConfidence([{ verdict: 'fail' }]).percent, 0);
});

const signals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
test('accuracy stays unassessed without confirmed or incorrect decisions', () => {
  const result = reviewerAccuracy([{ signal_id: 'a', decision: 'uncertain' }], signals);
  assert.equal(result.percent, null);
  assert.equal(result.unassessed, 3);
});
test('accuracy measures assessed findings, not unknown findings or test passes', () => {
  const result = reviewerAccuracy([
    { signal_id: 'a', decision: 'confirmed' },
    { signal_id: 'b', decision: 'incorrect' },
  ], signals);
  assert.equal(result.percent, 50);
  assert.equal(result.assessed, 2);
  assert.equal(result.unassessed, 1);
});
test('foreign IDs are ignored and duplicate decisions count only once', () => {
  const result = reviewerAccuracy([
    { signal_id: 'a', decision: 'incorrect' },
    { signal_id: 'a', decision: 'confirmed' },
    { signal_id: 'foreign', decision: 'confirmed' },
  ], signals);
  assert.equal(result.percent, 100);
  assert.equal(result.assessed, 1);
});
