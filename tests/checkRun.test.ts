import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { applyEvent, createTracker, newCheckRun, type CheckRun } from '../base44/functions/newsSignals/trace.ts';

const t0 = new Date('2026-10-10T20:00:00Z');

describe('CheckRun trace', () => {
  test('events build searches and articles with the model reason and the code verdict', () => {
    const run = newCheckRun('b1', t0, true);
    applyEvent(run, { kind: 'search', query_type: 'legal_layoffs', query: 'q', ok: true, count: 2 });
    applyEvent(run, { kind: 'read', url: 'u1', title: 'A', source: 'S', date: '2026-10-01', query: 'legal_layoffs', read: true });
    applyEvent(run, { kind: 'read', url: 'u2', title: 'B', source: 'S', date: '2026-10-02', query: 'legal_layoffs', read: false });
    applyEvent(run, {
      kind: 'tag', url: 'u1', decision: 'kept', why: 'kept', snippet: 'Acme filed for bankruptcy',
      tag: { relevant: true, same_company: true, signal_type: 'legal_layoffs', severity: 'strong', snippet: 'x', reason: 'new filing' },
    });
    applyEvent(run, { kind: 'tag', url: 'u2', decision: 'failed', why: 'tagging failed: timeout', tag: null });
    assert.equal(run.searches[0].count, 2);
    assert.deepEqual(run.articles.map((a) => [a.decision, a.read]), [['kept', true], ['failed', false]]);
    assert.equal(run.articles[0].reason, 'new filing');
    assert.equal(run.articles[0].snippet, 'Acme filed for bankruptcy');
    assert.equal(run.linkedin_status, 'running');
  });

  test('tracker creates once, throttles updates, and always saves the final state', async () => {
    let now = 0;
    const saves: { op: string; status: string; articles: number }[] = [];
    const tr = createTracker(newCheckRun('b1', t0, false), {
      create: async (r: CheckRun) => (saves.push({ op: 'create', status: r.status, articles: r.articles.length }), { id: 'r1' }),
      update: async (_id: string, r: CheckRun) => saves.push({ op: 'update', status: r.status, articles: r.articles.length }),
      now: () => now,
      warn: () => {},
    });
    now = 5_000;
    tr.log('1. Search');
    tr.event({ kind: 'read', url: 'u1', title: 'A', source: 'S', date: '2026-10-01', query: 'exec_departure', read: true });
    now = 5_400;
    tr.event({ kind: 'read', url: 'u2', title: 'B', source: 'S', date: '2026-10-01', query: 'exec_departure', read: true });
    await tr.finish({ ok: true, signalCount: 1 });
    assert.deepEqual(saves.map((s) => s.op), ['create', 'update']);
    assert.deepEqual(saves.at(-1), { op: 'update', status: 'done', articles: 2 });
    assert.equal(tr.run.signal_count, 1);
  });

  test('a failed save never throws into the check', async () => {
    const warnings: string[] = [];
    const tr = createTracker(newCheckRun('b1', t0, false), {
      create: async () => { throw new Error('entity missing'); },
      update: async () => {},
      now: () => 0,
      warn: (m) => warnings.push(m),
    });
    await tr.finish({ ok: false, error: 'News: both searches failed' });
    assert.equal(tr.run.status, 'failed');
    assert.match(warnings[0], /entity missing/);
  });
});
