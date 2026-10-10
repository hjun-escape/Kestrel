import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BUDGET_MS,
  MAX_PAGES,
  TAG_SCHEMA,
  buildLenderQueries,
  buildLenderSummary,
  buildSearchUrl,
  buildTagPrompt,
  collectLenders,
  normaliseLenderName,
  normaliseSearchResults,
  parseTags,
  runLenderCheck,
} from '../base44/functions/lenderCheck/logic.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');
const UCC = fixture('lender-serp-ucc.json');
const SUITS = fixture('lender-serp-suits.json');
const NEWS = fixture('lender-serp-news.json');
const PAGE = fixture('lender-page.html');

const UCC_URL = 'https://opencorporates.example/ucc/acme-widgets-2025-001234';
const PHX_URL = 'https://ucc.example.com/acme-widgets-phoenix';
const SUIT_URL = 'https://courts.example.com/rapid-funding-v-acme-widgets';
const NEWS_URL = 'https://www.dayton-business.example/news/acme-lakeshore-facility';

const BORROWER = {
  id: 'b1',
  name: 'Acme Widgets',
  website_domain: 'acmewidgets.com',
  hq_city: 'Dayton',
  hq_state: 'OH',
  stage: 'applicant',
};

// ---------- fakes ----------

interface Call {
  url: string;
  body: { zone: string; url: string; format: string };
  headers: Record<string, string>;
}

function fakeFetch(routes: (target: string) => string | Error | { status: number }) {
  const calls: Call[] = [];
  const fn = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    const out = routes(body.url);
    if (out instanceof Error) throw out;
    if (typeof out === 'object') return { ok: false, status: out.status, text: async () => '' };
    return { ok: true, status: 200, text: async () => out };
  };
  return { fn, calls };
}

function defaultRoutes(target: string): string | Error | { status: number } {
  if (target.startsWith('https://www.google.com/search')) {
    const q = decodeURIComponent(new URL(target).searchParams.get('q') || '');
    if (target.includes('tbm=nws')) return NEWS;
    if (q.includes('UCC')) return UCC;
    return SUITS;
  }
  if (target === SUIT_URL) return PAGE;
  return '<html><body><p>Unrelated page about widgets.</p></body></html>';
}

const GOOD_TAGS = {
  tags: [
    {
      source_url: UCC_URL,
      same_company: true,
      kind: 'lien',
      lender_name: 'First Harbor Bank, N.A.',
      late_payment: false,
      quote: 'Secured party: First Harbor Bank, N.A.',
      date: null,
    },
    {
      source_url: PHX_URL,
      same_company: false,
      kind: 'lien',
      lender_name: 'Desert Sun Capital LLC',
      late_payment: false,
      quote: 'Secured party: Desert Sun Capital LLC',
      date: null,
    },
    {
      source_url: SUIT_URL,
      same_company: true,
      kind: 'lender_lawsuit',
      lender_name: 'Rapid Funding Group LLC',
      late_payment: true,
      quote: 'failed to remit the daily payments due on February 3, February 10 and February 17, 2026',
      date: '2026-03-02',
    },
    {
      source_url: SUIT_URL,
      same_company: true,
      kind: 'mca',
      lender_name: 'Rapid Funding Group, LLC',
      late_payment: false,
      quote: 'under the merchant cash advance agreement',
      date: '2026-03-02',
    },
    {
      source_url: NEWS_URL,
      same_company: true,
      kind: 'new_loan',
      lender_name: 'Lakeshore Bank',
      late_payment: false,
      quote: 'closed a $5 million revolving credit facility with Lakeshore Bank',
      date: 'Jan 12, 2026',
    },
    {
      source_url: NEWS_URL,
      same_company: true,
      kind: 'new_loan',
      lender_name: 'Invented Lender',
      late_payment: false,
      quote: 'this sentence does not appear anywhere in the source text',
      date: null,
    },
    {
      source_url: NEWS_URL,
      same_company: true,
      kind: 'none',
      lender_name: 'Nobody',
      late_payment: false,
      quote: 'Acme Widgets closes $5 million credit facility',
      date: null,
    },
  ],
};

function fakeLLM(reply: unknown = GOOD_TAGS) {
  const prompts: string[] = [];
  const fn = async (params: { prompt: string; response_json_schema: object }) => {
    prompts.push(params.prompt);
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { fn, prompts };
}

// ---------- queries and URLs ----------

describe('buildLenderQueries', () => {
  test('builds the three lender searches with the quoted company name', () => {
    const qs = buildLenderQueries('Acme Widgets');
    assert.equal(qs.length, 3);
    assert.equal(qs[0].query, '"Acme Widgets" (UCC OR "financing statement" OR "secured party")');
    assert.equal(qs[0].news, false);
    assert.equal(
      qs[1].query,
      '"Acme Widgets" ("v." OR vs) (bank OR capital OR funding OR lender) (judgment OR lawsuit OR default)',
    );
    assert.equal(qs[1].news, false);
    assert.equal(
      qs[2].query,
      '"Acme Widgets" (loan OR "credit facility" OR refinanc* OR "merchant cash advance" OR lender)',
    );
    assert.equal(qs[2].news, true);
  });

  test('strips double quotes from the company name so the phrase query stays valid', () => {
    assert.match(buildLenderQueries('The "Best" Co')[0].query, /^"The Best Co" /);
  });
});

describe('buildSearchUrl', () => {
  test('web search has no tbm parameter', () => {
    const url = buildSearchUrl('"Acme" UCC', false);
    assert.equal(url, `https://www.google.com/search?q=${encodeURIComponent('"Acme" UCC')}&hl=en&gl=us&brd_json=1`);
    assert.doesNotMatch(url, /tbm=/);
  });

  test('news search adds tbm=nws and the past-year window', () => {
    const url = buildSearchUrl('x', true);
    assert.match(url, /&tbm=nws&tbs=qdr:y/);
    assert.match(url, /brd_json=1/);
  });
});

describe('normaliseSearchResults', () => {
  test('reads organic web results and skips malformed ones', () => {
    const results = normaliseSearchResults(UCC);
    assert.equal(results.length, 2);
    assert.equal(results[0].url, UCC_URL);
    assert.match(results[0].snippet, /Secured party: First Harbor Bank/);
  });

  test('reads news results', () => {
    const results = normaliseSearchResults(NEWS);
    assert.equal(results.length, 1);
    assert.equal(results[0].source, 'Dayton Business Journal');
  });

  test('returns [] for junk', () => {
    assert.deepEqual(normaliseSearchResults('not json'), []);
    assert.deepEqual(normaliseSearchResults(null), []);
    assert.deepEqual(normaliseSearchResults({ organic: 'x' }), []);
  });
});

// ---------- names ----------

describe('normaliseLenderName', () => {
  test('strips legal and bank suffixes, punctuation and case', () => {
    assert.equal(normaliseLenderName('First Harbor Bank, N.A.'), 'first harbor');
    assert.equal(normaliseLenderName('FIRST HARBOR BANK'), 'first harbor');
    assert.equal(normaliseLenderName('Rapid Funding Group, LLC'), 'rapid funding group');
    assert.equal(normaliseLenderName('Rapid Funding Group LLC'), 'rapid funding group');
    assert.equal(normaliseLenderName('Desert Sun Capital, Inc.'), 'desert sun capital');
  });

  test('keeps a leading "Bank" (Bank of America stays itself)', () => {
    assert.equal(normaliseLenderName('Bank of America, N.A.'), 'bank of america');
  });

  test('never strips a name down to nothing', () => {
    assert.equal(normaliseLenderName('Bank'), 'bank');
    assert.equal(normaliseLenderName('  '), '');
  });
});

// ---------- parsing and prompt ----------

describe('parseTags', () => {
  test('parses well-formed tags', () => {
    const tags = parseTags(GOOD_TAGS);
    assert.equal(tags.length, GOOD_TAGS.tags.length);
    assert.equal(tags[0].kind, 'lien');
    assert.equal(tags[0].date, null);
  });

  test('accepts a JSON string reply', () => {
    assert.equal(parseTags(JSON.stringify(GOOD_TAGS)).length, GOOD_TAGS.tags.length);
  });

  test('unknown kinds become none and missing same_company counts as false', () => {
    const tags = parseTags({ tags: [{ source_url: UCC_URL, kind: 'mystery', quote: 'abc def ghi jkl' }] });
    assert.equal(tags[0].kind, 'none');
    assert.equal(tags[0].same_company, false);
    assert.equal(tags[0].late_payment, false);
  });

  test('returns null for unreadable replies', () => {
    assert.equal(parseTags('nope'), null);
    assert.equal(parseTags({ foo: 1 }), null);
  });
});

describe('buildTagPrompt', () => {
  test('includes the identity hints and the unsure rule', () => {
    const prompt = buildTagPrompt(BORROWER, [
      { url: UCC_URL, title: 't', source: '', date: '', snippet: 's', text: '' },
    ]);
    assert.match(prompt, /acmewidgets\.com/);
    assert.match(prompt, /Dayton/);
    assert.match(prompt, /unsure.*same_company.*false/i);
    assert.match(prompt, new RegExp(UCC_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('schema lists the six kinds', () => {
    const kinds = (TAG_SCHEMA as any).properties.tags.items.properties.kind.enum;
    assert.deepEqual(kinds, ['lien', 'lender_lawsuit', 'judgment', 'new_loan', 'mca', 'none']);
  });
});

// ---------- collecting lenders (code-side filtering) ----------

function sourcesFixture(): Map<string, string[]> {
  return new Map([
    [UCC_URL, ['Debtor: Acme Widgets Inc, Dayton OH. Secured party: First Harbor Bank, N.A. Collateral: all inventory.']],
    [PHX_URL, ['Secured party: Desert Sun Capital LLC for Acme Widgets of Phoenix, a different company.']],
    [SUIT_URL, ['The complaint states that Acme Widgets Inc. "failed to remit the daily payments due on February 3, February 10 and February 17, 2026" under the merchant cash advance agreement.']],
    [NEWS_URL, ['Acme Widgets Inc. said it closed a $5 million revolving credit facility with Lakeshore Bank to refinance existing debt.']],
  ]);
}

describe('collectLenders', () => {
  const tags = parseTags(GOOD_TAGS)!;
  const out = collectLenders(tags, sourcesFixture(), 'Acme Widgets');

  test('drops other companies, kind none and quotes not in the source', () => {
    const names = out.lenders.map((l) => l.name);
    assert.ok(!names.includes('Desert Sun Capital LLC'));
    assert.ok(!names.includes('Invented Lender'));
    assert.ok(!names.includes('Nobody'));
  });

  test('dedupes lenders by normalised name and merges their kinds and evidence', () => {
    assert.equal(out.lenders.length, 3);
    const rapid = out.lenders.find((l) => /rapid/i.test(l.name))!;
    assert.deepEqual([...rapid.kinds].sort(), ['lender_lawsuit', 'mca']);
    assert.equal(rapid.evidence.length, 2);
  });

  test('evidence carries quote, url, source name and date', () => {
    const harbor = out.lenders.find((l) => /harbor/i.test(l.name))!;
    assert.equal(harbor.evidence[0].source_url, UCC_URL);
    assert.equal(harbor.evidence[0].source_name, 'opencorporates.example');
    assert.equal(harbor.evidence[0].quote, 'Secured party: First Harbor Bank, N.A.');
  });

  test('late payment evidence comes only from verified same-company tags', () => {
    assert.equal(out.late_payment_evidence.length, 1);
    assert.equal(out.late_payment_evidence[0].source_url, SUIT_URL);
    assert.equal(out.late_payment_evidence[0].lender, 'Rapid Funding Group LLC');
    assert.equal(out.late_payment_evidence[0].date, '2026-03-02');
  });

  test('a "lender" that is the company itself is ignored', () => {
    const self = parseTags({
      tags: [{ source_url: UCC_URL, same_company: true, kind: 'lien', lender_name: 'Acme Widgets Inc', quote: 'Debtor: Acme Widgets Inc, Dayton OH', late_payment: false }],
    })!;
    assert.equal(collectLenders(self, sourcesFixture(), 'Acme Widgets').lenders.length, 0);
  });

  test('a verified tag with no lender name is not counted as a lender', () => {
    const anon = parseTags({
      tags: [{ source_url: SUIT_URL, same_company: true, kind: 'judgment', lender_name: null, quote: 'under the merchant cash advance agreement', late_payment: false }],
    })!;
    assert.equal(collectLenders(anon, sourcesFixture(), 'Acme Widgets').lenders.length, 0);
  });
});

// ---------- summary (code, not LLM) ----------

describe('buildLenderSummary', () => {
  const ok = [{ query: 'q', ok: true }];

  test('no lenders says so and that it is not proof', () => {
    assert.equal(
      buildLenderSummary({ lenders: [], late_payment_evidence: [], searched: ok }),
      'No other lenders found in public records (not proof there are none).',
    );
  });

  test('counts lenders, lender lawsuits and late payments with correct plurals', () => {
    const tags = parseTags(GOOD_TAGS)!;
    const { lenders, late_payment_evidence } = collectLenders(tags, sourcesFixture(), 'Acme Widgets');
    assert.equal(
      buildLenderSummary({ lenders, late_payment_evidence, searched: ok }),
      '3 other lenders found in public records; 1 lender lawsuit or judgment; 1 source mentions late or missed payments.',
    );
  });

  test('singular lender', () => {
    const lenders = [{ name: 'X Bank', kinds: ['lien'], evidence: [] }];
    assert.equal(
      buildLenderSummary({ lenders, late_payment_evidence: [], searched: ok }),
      '1 other lender found in public records.',
    );
  });

  test('says the check could not run when every search failed', () => {
    const s = buildLenderSummary({ lenders: [], late_payment_evidence: [], searched: [{ query: 'a', ok: false }, { query: 'b', ok: false }] });
    assert.match(s, /could not be completed/i);
    assert.doesNotMatch(s, /No other lenders found/);
  });

  test('notes partial failures', () => {
    const s = buildLenderSummary({ lenders: [], late_payment_evidence: [], searched: [{ query: 'a', ok: true }, { query: 'b', ok: false }] });
    assert.match(s, /^No other lenders found/);
    assert.match(s, /1 of 2 searches failed/);
  });
});

// ---------- end to end with fakes ----------

describe('runLenderCheck', () => {
  test('runs 3 searches, reads up to 4 pages, tags once, and returns a verified record', async () => {
    const fetch = fakeFetch(defaultRoutes);
    const llm = fakeLLM();
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: llm.fn, fetch: fetch.fn, apiKey: 'k' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const rec = result.record;
    assert.equal(rec.borrower_id, 'b1');
    assert.ok(!Number.isNaN(Date.parse(rec.created_at)));
    assert.equal(rec.lender_count, 3);
    assert.equal(rec.lenders.length, 3);
    assert.equal(rec.late_payment_evidence.length, 1);
    assert.match(rec.summary, /^3 other lenders found in public records/);

    const searches = fetch.calls.filter((c) => c.body.url.startsWith('https://www.google.com/search'));
    assert.equal(searches.length, 3);
    const pages = fetch.calls.filter((c) => !c.body.url.startsWith('https://www.google.com/search'));
    assert.ok(pages.length >= 1 && pages.length <= MAX_PAGES);
    for (const c of fetch.calls) {
      assert.equal(c.url, 'https://api.brightdata.com/request');
      assert.equal(c.body.zone, 'mcp_unlocker');
      assert.equal(c.body.format, 'raw');
      assert.equal(c.headers.Authorization, 'Bearer k');
    }
    assert.equal(llm.prompts.length, 1);
    assert.ok(rec.searched.length >= 3);
    assert.ok(rec.searched.every((s) => typeof s.query === 'string' && typeof s.ok === 'boolean'));
  });

  test('the quote from the fetched page text verifies even though it is not in the snippet', async () => {
    const fetch = fakeFetch(defaultRoutes);
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: fakeLLM().fn, fetch: fetch.fn, apiKey: 'k' });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.match(result.record.late_payment_evidence[0].quote, /failed to remit the daily payments/);
  });

  test('text inside a <script> on the page cannot verify a quote', async () => {
    const llm = fakeLLM({
      tags: [{ source_url: SUIT_URL, same_company: true, kind: 'lender_lawsuit', lender_name: 'Ghost Capital', late_payment: true, quote: 'failed to remit fake text', date: null }],
    });
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: llm.fn, fetch: fakeFetch(defaultRoutes).fn, apiKey: 'k' });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.record.lender_count, 0);
    assert.equal(result.record.late_payment_evidence.length, 0);
  });

  test('a failing search is recorded and the rest still run', async () => {
    const fetch = fakeFetch((t) => (t.includes('UCC') ? { status: 503 } : defaultRoutes(t)));
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: fakeLLM().fn, fetch: fetch.fn, apiKey: 'k' });
    assert.ok(result.ok);
    if (!result.ok) return;
    const failed = result.record.searched.filter((s) => !s.ok);
    assert.ok(failed.length >= 1);
    assert.ok(result.record.lenders.some((l) => /rapid/i.test(l.name)));
    assert.match(result.record.summary, /searches failed/);
  });

  test('a page that throws is recorded, not fatal', async () => {
    const fetch = fakeFetch((t) => (t === SUIT_URL ? new Error('socket hang up') : defaultRoutes(t)));
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: fakeLLM().fn, fetch: fetch.fn, apiKey: 'k' });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.ok(result.record.searched.some((s) => !s.ok && /socket hang up/.test(s.detail || '')));
  });

  test('missing API key: every search is recorded as failed, no LLM call, no crash', async () => {
    const llm = fakeLLM();
    const fetch = fakeFetch(defaultRoutes);
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: llm.fn, fetch: fetch.fn, apiKey: undefined });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(fetch.calls.length, 0);
    assert.equal(llm.prompts.length, 0);
    assert.equal(result.record.lender_count, 0);
    assert.ok(result.record.searched.every((s) => !s.ok));
    assert.match(result.record.summary, /could not be completed/i);
  });

  test('no search results means no LLM call and the honest empty summary', async () => {
    const llm = fakeLLM();
    const fetch = fakeFetch(() => '{"organic":[],"news":[]}');
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: llm.fn, fetch: fetch.fn, apiKey: 'k' });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(llm.prompts.length, 0);
    assert.equal(result.record.summary, 'No other lenders found in public records (not proof there are none).');
  });

  test('LLM error -> llm_unavailable (the handler maps it to 502)', async () => {
    const result = await runLenderCheck({
      borrower: BORROWER,
      invokeLLM: fakeLLM(new Error('rate limited')).fn,
      fetch: fakeFetch(defaultRoutes).fn,
      apiKey: 'k',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'llm_unavailable');
    assert.match(result.error, /rate limited/);
    assert.ok(result.searched.length >= 3);
  });

  test('unreadable LLM reply -> llm_unavailable', async () => {
    const result = await runLenderCheck({
      borrower: BORROWER,
      invokeLLM: fakeLLM('I cannot help with that').fn,
      fetch: fakeFetch(defaultRoutes).fn,
      apiKey: 'k',
    });
    assert.equal(result.ok, false);
  });

  test('a search that hangs is cut off by the budget', async () => {
    let t = 0;
    const hang = async (_url: string, init: { body: string; signal?: AbortSignal }) => {
      const target = JSON.parse(init.body).url as string;
      if (target.includes('UCC')) return new Promise<never>(() => {});
      return { ok: true, status: 200, text: async () => defaultRoutes(target) as string };
    };
    const started = Date.now();
    const result = await runLenderCheck({
      borrower: BORROWER,
      invokeLLM: fakeLLM().fn,
      fetch: hang as never,
      apiKey: 'k',
      budgetMs: 300,
      llmMinMs: 200,
      now: () => Date.now() + t,
    });
    assert.ok(Date.now() - started < 2_000, 'did not wait on the hung search');
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.ok(result.record.searched.some((s) => !s.ok && /timed out/.test(s.detail || '')));
  });

  test('default budget is 75 seconds', () => {
    assert.equal(BUDGET_MS, 75_000);
  });

  test('never sets status and never produces Signal-shaped output', async () => {
    const result = await runLenderCheck({ borrower: BORROWER, invokeLLM: fakeLLM().fn, fetch: fakeFetch(defaultRoutes).fn, apiKey: 'k' });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal('status' in result.record, false);
    assert.equal('signals' in result.record, false);
  });
});
