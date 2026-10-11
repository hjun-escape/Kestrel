import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTOR_AI,
  ACTOR_GUEST,
  ACTOR_SYSTEM,
  auditFileName,
  auditTrailCsv,
  buildAuditTrail,
  collapseRepeatedChecks,
  formatTrailDate,
  csvCell,
} from '../src/lib/auditTrail.ts';
import { countForRules, ruleLine } from '../src/lib/statusRules.ts';
import { scoreBorrower } from '../base44/functions/scoreBorrower/entry.ts';
import type { Signal } from '../base44/functions/scoreBorrower/entry.ts';

const borrower = {
  id: 'b1',
  name: 'Acme Freight, Inc.',
  status: 'red',
  why: 'Red: CFO departure (Sep 12) + Layoffs (Sep 30)',
  last_refreshed: '2026-10-09T15:00:00Z',
  sources_unavailable: ['Reviews'],
};

describe('buildAuditTrail', () => {
  test('reads Base44 timestamps without a zone as UTC, so they sort with the others', () => {
    const entries = buildAuditTrail({
      borrower: { ...borrower, last_refreshed: '2026-10-10T23:30:00Z' },
      // Base44 created_date: UTC, no zone. Two minutes before the status was set.
      signals: [{ type: 'hiring_drop', severity: 'strong', date: '2026-10-10', title: 'Job postings 81% below normal', snippet: 's', source_url: 'https://jobs.example/a', created_date: '2026-10-10T23:28:00.000000' }],
    });
    assert.deepEqual(entries.map((e) => e.kind), ['status', 'signal']);
    assert.equal(entries[1].at, '2026-10-10T23:28:00.000000Z');
    assert.equal(new Date(entries[1].at).toISOString(), '2026-10-10T23:28:00.000Z');
  });

  test('leaves times that already have a zone, and date-only values, unchanged', () => {
    const entries = buildAuditTrail({
      signals: [
        { type: 'legal_layoffs', severity: 'weak', date: '2026-09-10', title: 'a', snippet: 's', created_date: '2026-10-10T16:28:00-07:00' },
        { type: 'legal_layoffs', severity: 'weak', date: '2026-09-11', title: 'b', snippet: 's' },
      ],
    });
    assert.deepEqual(entries.map((e) => e.at), ['2026-10-10T16:28:00-07:00', '2026-09-11']);
  });

  test('merges every record type newest first with the right actors', () => {
    const entries = buildAuditTrail({
      borrower,
      signals: [{ type: 'exec_departure', severity: 'strong', date: '2026-09-12', title: 'CFO resigns', snippet: 'The CFO resigned.', source_url: 'https://news.example/a', created_date: '2026-10-09T14:59:00Z' }],
      checkRuns: [{ source: 'News', status: 'done', started_at: '2026-10-09T14:50:00Z', finished_at: '2026-10-09T14:58:00Z', searches: [{ ok: true }, { ok: false }], articles: [{ decision: 'kept' }, { decision: 'dropped', why: 'different company' }, { decision: 'dropped', why: 'different company' }], signal_count: 1 }],
      analyses: [{ created_at: '2026-10-09T16:00:00Z', summary: 'Two warning signs', recommended_action: 'escalate', findings: [{ quote: 'q', source_url: 'https://news.example/a' }], findings_dropped: 2 }],
      lenderChecks: [{ created_at: '2026-10-08T10:00:00Z', lender_count: 1, summary: 'One lien', lenders: [{ name: 'First Bank', evidence: [{ source_url: 'https://court.example/1' }] }] }],
      cashflowReviews: [{ created_at: '2026-10-07T10:00:00Z', extraction_method: 'sandbox', file_url: 'https://files.example/s.pdf', transaction_count: 120, summary: 'Two late payments', flags: [] }],
      decisions: [
        { created_at: '2026-10-10T09:00:00Z', decision: 'request_documents', decided_by: 'officer@bank.com', note: 'Need payroll', documents_requested: [{ item: 'Payroll summary', reason: 'CFO left' }] },
        { created_at: '2026-10-10T08:00:00Z', decision: 'watchlist' },
      ],
    });

    assert.deepEqual(entries.map((e) => e.kind), ['decision', 'decision', 'analysis', 'status', 'signal', 'check_run', 'lender_check', 'cashflow']);
    assert.equal(entries[0].actor, 'officer@bank.com');
    assert.match(entries[0].details, /Payroll summary \(CFO left\)/);
    assert.equal(entries[1].actor, ACTOR_GUEST);
    assert.equal(entries[2].actor, ACTOR_AI);
    assert.match(entries[2].details, /2 set aside/);
    assert.match(entries[3].event, /Red/);
    assert.match(entries[3].details, /Sources unavailable: Reviews/);
    assert.equal(entries[4].actor, ACTOR_SYSTEM);
    assert.match(entries[4].details, /Quote: "The CFO resigned\."/);
    assert.equal(entries[4].source_url, 'https://news.example/a');
    assert.match(entries[5].details, /1 of 2 searches answered, 1 unavailable/);
    assert.match(entries[5].details, /3 articles found: 1 confirmed, 2 set aside/);
    assert.match(entries[5].details, /different company \(2\)/);
    assert.match(entries[7].details, /isolated sandbox/);
  });

  test('a never-checked company has no status entry, and unsafe links are dropped', () => {
    const entries = buildAuditTrail({
      borrower: { ...borrower, last_refreshed: '' },
      signals: [{ type: 'legal_layoffs', severity: 'weak', date: '2026-09-01', title: 'Suit', source_url: 'javascript:alert(1)' }],
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'signal');
    assert.equal(entries[0].at, '2026-09-01');
    assert.equal(entries[0].source_url, '');
  });

  test('empty or missing input gives no entries', () => {
    assert.deepEqual(buildAuditTrail({}), []);
    assert.deepEqual(buildAuditTrail({ signals: [null as never] }), []);
  });
});

describe('auditTrailCsv', () => {
  test('escapes commas, quotes and newlines and guards formulas', () => {
    assert.equal(csvCell('plain'), 'plain');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
    assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(csvCell(null), '');
  });

  test('writes a header and one row per entry', () => {
    const csv = auditTrailCsv([{ at: '2026-10-10T09:00:00Z', kind: 'decision', actor: 'a@b.com', event: 'Decision recorded: Proceed', details: 'Note: ok, "fine".', source_url: '' }]);
    const lines = csv.trimEnd().split('\r\n');
    assert.equal(lines[0], 'Timestamp,Actor,Event,Details,Source');
    assert.equal(lines[1], '2026-10-10T09:00:00Z,a@b.com,Decision recorded: Proceed,"Note: ok, ""fine"".",');
  });

  test('file name uses the company slug and the local date', () => {
    assert.equal(auditFileName('Acme Freight, Inc.', new Date(2026, 9, 10, 12)), 'kestrel-audit-acme-freight-inc-2026-10-10.csv');
    assert.equal(auditFileName('', new Date(2026, 0, 5)), 'kestrel-audit-company-2026-01-05.csv');
  });
});

describe('status rule line', () => {
  const sig = (severity: 'strong' | 'weak', i: number, date = '2026-10-01'): Signal => ({
    type: severity === 'strong' ? 'exec_departure' : 'legal_layoffs',
    severity,
    date,
    title: `${severity} event ${i}`,
  });

  test('counts only the last 90 days and matches scoreBorrower', () => {
    const signals = [sig('strong', 1), sig('strong', 2), sig('weak', 3), sig('weak', 4, '2026-01-01')];
    const counts = countForRules(signals, '2026-10-10');
    assert.deepEqual(counts, { strong: 2, weak: 1, status: 'red' });
    assert.equal(counts.status, scoreBorrower(signals, '2026-10-10').status);
    assert.equal(ruleLine(counts), '2 strong, 1 weak in the last 90 days → Red');
  });

  test('every small combination agrees with scoreBorrower', () => {
    for (let s = 0; s <= 2; s++) {
      for (let w = 0; w <= 3; w++) {
        const signals = [...Array.from({ length: s }, (_, i) => sig('strong', i)), ...Array.from({ length: w }, (_, i) => sig('weak', i))];
        const c = countForRules(signals, '2026-10-10');
        assert.equal(c.strong, s);
        assert.equal(c.weak, w);
        assert.equal(c.status, scoreBorrower(signals, '2026-10-10').status);
      }
    }
  });

  test('no signals reads as Green, and a full timestamp works as today', () => {
    assert.equal(ruleLine(countForRules([], '2026-10-10T15:00:00Z')), 'No warning signs in the last 90 days → Green');
  });
});

describe('collapseRepeatedChecks', () => {
  const run = (finished_at: string, over = {}) => ({ source: 'News', status: 'done', started_at: finished_at, finished_at, searches: [{ ok: true }, { ok: true }], articles: [{ decision: 'kept' }], signal_count: 2, ...over });

  test('folds identical adjacent checks into one row with a count and the latest time', () => {
    const entries = buildAuditTrail({ checkRuns: [run('2026-10-10T17:10:00Z'), run('2026-10-10T17:20:00Z'), run('2026-10-10T17:42:00Z')] });
    assert.equal(entries.length, 3);
    const shown = collapseRepeatedChecks(entries);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].count, 3);
    assert.equal(shown[0].at, '2026-10-10T17:42:00Z');
    assert.match(shown[0].details, /Checked 3 times, latest/);
    assert.match(shown[0].details, /\d{1,2}:\d{2}\s?(AM|PM)/);
  });

  test('keeps checks with different results, and other entries, separate; export stays complete', () => {
    const entries = buildAuditTrail({
      checkRuns: [run('2026-10-10T17:10:00Z'), run('2026-10-10T17:20:00Z', { signal_count: 3 })],
      decisions: [{ decision: 'proceed', created_at: '2026-10-10T17:15:00Z' }],
    });
    assert.equal(collapseRepeatedChecks(entries).length, 3);
    assert.equal(auditTrailCsv(entries).trim().split('\r\n').length, 4);
  });

  test('uses one plain date style and no longer says earlier statuses are not stored', () => {
    assert.match(formatTrailDate('2026-09-25'), /^Sep 25(, 2026)?$/);
    assert.match(formatTrailDate('2026-10-10T17:42:00Z'), /^Oct 1[01](, 2026)?, \d{1,2}:\d{2}\s?(AM|PM)$/);
    assert.equal(formatTrailDate(''), 'Unknown');
    const [status] = buildAuditTrail({ borrower });
    assert.doesNotMatch(status.details, /not stored/);
  });
});
