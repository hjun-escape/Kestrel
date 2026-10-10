import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  type InvokeLLM,
  type NewsBatch,
  alignTags,
  parseNewsDate,
  signalsFromBatches,
  snippetIsExact,
  withinDays,
} from '../base44/functions/newsSignals/logic.ts';
import { flattenExperience, type LinkedInRun, linkedInSignals, parseMonthYear, pickProfile } from '../base44/functions/newsSignals/linkedin.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));
const today = new Date('2026-10-10T12:00:00Z');

// Fake LLM: tags every article with the same answer, quoting the article title (a verbatim quote).
const llm = (answer: (text: string) => Record<string, unknown>): InvokeLLM => async ({ prompt }) => {
  const items = JSON.parse(prompt.slice(prompt.indexOf('Items (JSON):') + 'Items (JSON):'.length)) as { id: number; text: string }[];
  return { tags: items.map((it) => ({ id: it.id, ...answer(it.text) })) };
};

describe('helpers', () => {
  test('parseNewsDate handles relative and absolute dates', () => {
    assert.equal(parseNewsDate('3 days ago', today), '2026-10-07');
    assert.equal(parseNewsDate('1 month ago', today), '2026-09-10');
    assert.equal(parseNewsDate('2 weeks ago', today), '2026-09-26');
    assert.equal(parseNewsDate('5 hours ago', today), '2026-10-10');
    assert.equal(parseNewsDate('yesterday', today), '2026-10-09');
    assert.equal(parseNewsDate('Jul 9, 2026', today), '2026-07-09');
    assert.equal(parseNewsDate('Sept 3, 2026', today), '2026-09-03');
    assert.equal(parseNewsDate('whenever', today), null);
  });

  test('withinDays keeps 180 days only', () => {
    assert.equal(withinDays('2026-05-01', today, 180), true);
    assert.equal(withinDays('2026-03-01', today, 180), false);
  });

  test('snippet guard: exact quote passes, paraphrase fails', () => {
    const src = 'Red Lobster  has closed\ndozens of restaurants this year.';
    assert.equal(snippetIsExact('has closed dozens of restaurants', src), true);
    assert.equal(snippetIsExact('closed many restaurants', src), false);
    assert.equal(snippetIsExact('', src), false);
  });

  test('alignTags accepts a JSON string and fills missing ids as not relevant', () => {
    const tags = alignTags(2, JSON.stringify({ tags: [{ id: 1, relevant: true, same_company: true, signal_type: 'legal_layoffs', severity: 'weak', snippet: 'x' }] }));
    assert.equal(tags[0].relevant, false);
    assert.equal(tags[1].severity, 'weak');
  });
});

describe('signalsFromBatches on saved Bright Data results', () => {
  const tgi = { id: 'b1', name: 'TGI Fridays', website_domain: 'tgifridays.com', hq_city: 'Dallas' };
  const batches = fixture('news-tgifridays.json').batches as NewsBatch[];
  const recorded = new Date(fixture('news-tgifridays.json').recorded_at);

  test('keeps verbatim, same-company legal items and returns the contract shape', async () => {
    const tagger = llm((text) => ({ reason: 'test', relevant: true, same_company: true, signal_type: 'legal_layoffs', severity: 'weak', snippet: text.split('\n')[0] }));
    const { signals, trace } = await signalsFromBatches(tgi, batches.filter((b) => b.type === 'legal_layoffs'), tagger, recorded);
    assert.ok(signals.length > 0);
    for (const s of signals) {
      assert.deepEqual(Object.keys(s).sort(), ['borrower_id', 'date', 'severity', 'snippet', 'source_name', 'source_url', 'title', 'type']);
      assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(s.borrower_id, 'b1');
    }
    assert.equal(trace.filter((r) => r.kept).length, signals.length);
  });

  test('drops a model-written snippet', async () => {
    const liar = llm(() => ({ relevant: true, same_company: true, signal_type: 'legal_layoffs', severity: 'strong', snippet: 'TGI Fridays is in deep trouble' }));
    const { signals, trace } = await signalsFromBatches(tgi, batches, liar, recorded);
    assert.equal(signals.length, 0);
    assert.ok(trace.some((r) => r.reason.startsWith('snippet guard')));
  });

  test('drops other companies and irrelevant items', async () => {
    const other = llm((text) => ({ relevant: true, same_company: false, signal_type: 'legal_layoffs', severity: 'weak', snippet: text.split('\n')[0] }));
    assert.equal((await signalsFromBatches(tgi, batches, other, recorded)).signals.length, 0);
    const none = llm(() => ({ relevant: false, same_company: true, signal_type: null, severity: null, snippet: '' }));
    assert.equal((await signalsFromBatches(tgi, batches, none, recorded)).signals.length, 0);
  });

  test('rejects exec_departure when the article names no executive (store closure mis-tag)', async () => {
    const closure: NewsBatch[] = [{ type: 'exec_departure', source: 'News', query: 'q', items: [
      { title: 'Red Lobster to shutdown its oldest location', link: 'https://x/1', source: 'X', description: 'The restaurant will close.', date: '2 days ago' },
    ] }];
    const tagger = llm((text) => ({ relevant: true, same_company: true, signal_type: 'exec_departure', severity: 'strong', snippet: text.split('\n')[0] }));
    const { signals, trace } = await signalsFromBatches({ name: 'Red Lobster' }, closure, tagger, today);
    assert.equal(signals.length, 0);
    assert.match(trace[0].reason, /no executive title/);
  });

  test('drops articles older than 180 days before calling the LLM', async () => {
    let called = 0;
    const counting: InvokeLLM = async (p) => { called++; return llm(() => ({ relevant: false }))(p); };
    const old: NewsBatch[] = [{ type: 'legal_layoffs', source: 'Legal', query: 'q', items: [
      { title: 'Old news', link: 'https://x/old', source: 'X', description: '', date: 'Jan 2, 2025' },
    ] }];
    const { trace } = await signalsFromBatches({ name: 'Acme' }, old, counting, today);
    assert.equal(called, 0);
    assert.equal(trace[0].reason, 'older than 180 days');
  });
});

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

test('tagItem/shared.ts is an exact copy of newsSignals/logic.ts (Base44 bundles folders separately)', () => {
  const read = (p: string) => readFileSync(join(here, '..', 'base44', 'functions', p), 'utf8');
  const copy = read('tagItem/shared.ts');
  assert.equal(copy.slice(copy.indexOf('\n\n') + 2), read('newsSignals/logic.ts'));
});
