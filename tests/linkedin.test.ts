import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { flattenExperience, type LinkedInRun, linkedInSignals, parseMonthYear, pickProfile } from '../base44/functions/newsSignals/linkedin.ts';

const today = new Date('2026-10-10T12:00:00Z');

describe('LinkedIn exec check', () => {
  const b = { id: 'b1', name: 'Acme Foods' };
  const run = (experience: unknown[], current_company = ''): LinkedInRun => ({
    exec_query: 'q',
    exec_results: [],
    execs: [{ name: 'Jane Doe', title: 'CFO', quote: 'Jane Doe, CFO', source_url: 'https://x' }],
    profile_hits: [{ exec: 'Jane Doe', query: 'q', url: 'https://www.linkedin.com/in/jane', results: [] }],
    profiles: [{ url: 'https://www.linkedin.com/in/jane', name: 'Jane Doe', current_company, experience: flattenExperience(experience) }],
  });

  test('parseMonthYear', () => {
    assert.equal(parseMonthYear('Aug 2026'), '2026-08-01');
    assert.equal(parseMonthYear('2021'), '2021-01-01');
    assert.equal(parseMonthYear('Present'), null);
  });

  test('recent CFO exit at the borrower is a strong exec_departure sourced to LinkedIn', () => {
    const { signals, checks } = linkedInSignals(b, run([{ title: 'Chief Financial Officer', company: 'Acme Foods Inc.', start_date: 'Jan 2020', end_date: 'Aug 2026' }], 'Other Co'), today);
    assert.equal(checks[0].result, 'departed');
    assert.deepEqual([signals[0].type, signals[0].severity, signals[0].date, signals[0].source_name], ['exec_departure', 'strong', '2026-08-01', 'LinkedIn']);
    assert.equal(signals[0].source_url, 'https://www.linkedin.com/in/jane');
  });

  test('grouped positions are flattened; president is weak', () => {
    const { signals } = linkedInSignals(b, run([{ company: 'Acme Foods', positions: [{ title: 'VP Sales', start_date: '2018', end_date: '2020' }, { title: 'President', start_date: '2020', end_date: 'Sep 2026' }] }]), today);
    assert.equal(signals[0]?.severity, 'weak');
  });

  test('still in role, old exit, and a different employer alone raise no signal', () => {
    assert.equal(linkedInSignals(b, run([{ title: 'CFO', company: 'Acme Foods', start_date: '2020', end_date: 'Present' }]), today).checks[0].result, 'still there');
    assert.equal(linkedInSignals(b, run([{ title: 'CFO', company: 'Acme Foods', start_date: '2015', end_date: 'Dec 2023' }]), today).signals.length, 0);
    const r = linkedInSignals(b, run([], 'Parent Holdings'), today);
    assert.deepEqual([r.signals.length, r.checks[0].result], [0, 'unconfirmed']);
  });

  test('pickProfile needs a linkedin.com/in link whose title names the person', () => {
    const results = [
      { title: 'TGI Fridays', link: 'https://tgifridays.com/', description: '' },
      { title: 'Nik Rupp - CFO', link: 'https://www.linkedin.com/in/nik-rupp?trk=x', description: '' },
    ];
    assert.equal(pickProfile('Nik Rupp', results), 'https://www.linkedin.com/in/nik-rupp');
    assert.equal(pickProfile('Brandon Coleman III', [{ title: 'Brandon Coleman', link: 'https://www.linkedin.com/in/bc', description: '' }]), 'https://www.linkedin.com/in/bc');
    assert.equal(pickProfile('Someone Else', results), null);
  });
});
