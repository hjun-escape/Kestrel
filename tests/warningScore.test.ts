import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { BANDS, warningScore } from '../src/lib/warningScore.ts';
import { scoreBorrower } from '../base44/functions/scoreBorrower/entry.ts';
import type { Signal } from '../base44/functions/scoreBorrower/entry.ts';

const today = '2026-10-10';
const sig = (severity: 'strong' | 'weak', i: number, date = '2026-10-01'): Signal => ({
  type: severity === 'strong' ? 'exec_departure' : 'legal_layoffs',
  severity,
  date,
  title: `${severity} event ${i}`,
  source_url: `https://example.com/${severity}/${i}`,
});

const bandOf = (score: number) => (score >= BANDS.red ? 'red' : score >= BANDS.yellow ? 'yellow' : 'green');

describe('warningScore', () => {
  test('its band equals scoreBorrower status for every mix of 0-4 strong and 0-6 weak', () => {
    for (let strong = 0; strong <= 4; strong++) {
      for (let weak = 0; weak <= 6; weak++) {
        const signals = [
          ...Array.from({ length: strong }, (_, i) => sig('strong', i)),
          ...Array.from({ length: weak }, (_, i) => sig('weak', i)),
        ];
        const ws = warningScore(signals, today);
        const { status } = scoreBorrower(signals, today);
        assert.equal(ws.band, status, `${strong} strong + ${weak} weak`);
        assert.equal(bandOf(ws.score), status, `score ${ws.score} for ${strong} strong + ${weak} weak`);
      }
    }
  });

  test('every point has a reason; old and duplicate signals are listed as not counted', () => {
    const dup = { ...sig('strong', 0), source_url: 'https://other.example.com/same-story' };
    const ws = warningScore([sig('strong', 0), dup, sig('weak', 1), sig('weak', 2, '2026-01-05')], today);
    assert.equal(ws.score, 55);
    assert.deepEqual(ws.counted.map((l) => l.points), [40, 15]);
    assert.deepEqual(ws.notCounted.map((l) => l.note).sort(), ['Older than 90 days', 'Same event as another signal']);
  });

  test('signals the rules skip for another reason than age say why', () => {
    const ws = warningScore([sig('strong', 0, '2026-10-20'), sig('strong', 1, 'Sep 12'), sig('weak', 2, '2026-02-30')], today);
    assert.equal(ws.score, 0);
    assert.deepEqual(ws.notCounted.map((l) => l.note).sort(), ['Dated after today', 'No valid date', 'No valid date']);
  });

  test('caps at 100 and no signals scores 0 (green)', () => {
    assert.equal(warningScore([0, 1, 2, 3].map((i) => sig('strong', i)), today).score, 100);
    const none = warningScore([], today);
    assert.deepEqual([none.score, none.band], [0, 'green']);
  });
});
