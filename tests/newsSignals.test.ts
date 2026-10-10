// Run: node --test "tests/**/*.test.ts"   (Node 22+, runs .ts via type stripping)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  TAG_SCHEMA,
  buildNewsQueries,
  buildNewsSearchUrl,
  buildTagPrompt,
  parseNewsDate,
  parseTag,
  runNewsSignals,
} from '../base44/functions/newsSignals/logic.ts';
import type { Signal } from '../base44/functions/newsSignals/logic.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');
const SERP_EXEC = JSON.parse(fixture('news-serp-exec.json'));
const SERP_LEGAL = JSON.parse(fixture('news-serp-legal.json'));
const PAGE_CFO = fixture('news-page-cfo.html');
const PAGE_WARN = fixture('news-page-warn.html');
const PAGE_SUIT = fixture('news-page-suit.html');

const TODAY = '2026-10-10';
const BORROWER = {
  id: 'b1',
  name: 'Acme Widgets',
  website_domain: 'acmewidgets.com',
  hq_city: 'Dayton',
  hq_state: 'OH',
  industry: 'Manufacturing',
};

const URLS = {
  cfo: 'https://news.example.com/acme-cfo-resigns',
  vp: 'https://biz.example.com/acme-vp-sales',
  otherCo: 'https://uk.example.co.uk/acme-widgets-ltd-ceo',
  coo: 'https://news.example.com/acme-coo',
  old: 'https://news.example.com/acme-founder-old',
  warn: 'https://warn.example.gov/acme-2026',
  suit: 'https://court.example.com/acme-suit',
};

// ---------- fakes ----------

type Route = { status?: number; body?: string; throws?: string };

function isSearch(url: string) {
  return url.startsWith('https://www.google.com/search');
}

function fakeFetch(opts: { exec?: Route; legal?: Route; pages?: Record<string, Route> } = {}) {
  const requests: Array<{ url: string; body: Record<string, string>; headers: Record<string, string> }> = [];
  const routes = {
    exec: opts.exec ?? { body: JSON.stringify(SERP_EXEC) },
    legal: opts.legal ?? { body: JSON.stringify(SERP_LEGAL) },
    pages: opts.pages ?? {
      [URLS.cfo]: { body: PAGE_CFO },
      [URLS.vp]: { status: 404, body: 'gone' },
      [URLS.otherCo]: { body: '<p>Acme Widgets Ltd of Leeds said its chief executive steps down at year end.</p>' },
      [URLS.coo]: { body: '<p>Acme Widgets announced leadership changes in its operations team this month.</p>' },
      [URLS.warn]: { body: PAGE_WARN },
      [URLS.suit]: { body: PAGE_SUIT },
    },
  };
  const fn = async (url: string, init: { body: string; headers: Record<string, string> }) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body, headers: init.headers });
    let route: Route | undefined;
    if (isSearch(body.url)) {
      route = decodeURIComponent(body.url).includes('"WARN notice"') ? routes.legal : routes.exec;
    } else {
      route = routes.pages[body.url.replace(/\/$/, '')];
    }
    if (!route) return new Response('not found', { status: 404 });
    if (route.throws) throw new Error(route.throws);
    return new Response(route.body ?? '', { status: route.status ?? 200 });
  };
  const pageReads = (u: string) =>
    requests.filter((r) => !isSearch(r.body.url) && r.body.url.replace(/\/$/, '') === u).length;
  return { fn, requests, pageReads };
}

type Tag = {
  relevant: boolean;
  same_company: boolean;
  signal_type: string;
  severity: string;
  snippet: string;
};

const DEFAULT_TAGS: Record<string, Tag> = {
  [URLS.cfo]: {
    relevant: true,
    same_company: true,
    signal_type: 'exec_departure',
    severity: 'strong',
    snippet: 'Acme Widgets chief financial officer Jane Roe resigned on Monday, the Dayton company said',
  },
  [URLS.vp]: {
    relevant: true,
    same_company: true,
    signal_type: 'exec_departure',
    severity: 'weak',
    snippet: 'Acme Widgets vice president of sales Tom Lee has left the company',
  },
  [URLS.otherCo]: {
    relevant: true,
    same_company: false,
    signal_type: 'exec_departure',
    severity: 'strong',
    snippet: 'Acme Widgets Ltd of Leeds said its chief executive steps down at year end.',
  },
  [URLS.coo]: {
    relevant: true,
    same_company: true,
    signal_type: 'exec_departure',
    severity: 'weak',
    snippet: 'COO Mary Smith was fired after an internal investigation',
  },
  [URLS.warn]: {
    relevant: true,
    same_company: true,
    signal_type: 'legal_layoffs',
    severity: 'strong',
    snippet: 'acme widgets filed a WARN notice on September 18, 2026 covering 120 workers',
  },
  [URLS.suit]: {
    relevant: true,
    same_company: true,
    signal_type: 'legal_layoffs',
    severity: 'weak',
    snippet: 'A customer filed a lawsuit against Acme Widgets of Dayton',
  },
};

function fakeLLM(tags: Record<string, Tag | Error> = DEFAULT_TAGS) {
  const calls: Array<{ prompt: string; url: string; response_json_schema: object }> = [];
  const fn = async (params: { prompt: string; response_json_schema: object }) => {
    const url = (/^URL: (\S+)$/m.exec(params.prompt)?.[1] ?? '').replace(/\/$/, '');
    calls.push({ ...params, url });
    const tag = tags[url];
    if (!tag) return { relevant: false, same_company: false, signal_type: 'none', severity: 'none', snippet: '' };
    if (tag instanceof Error) throw tag;
    return tag;
  };
  return { fn, calls };
}

function run(overrides: Partial<Parameters<typeof runNewsSignals>[0]> = {}) {
  const f = fakeFetch();
  const llm = fakeLLM();
  return {
    f,
    llm,
    result: runNewsSignals({
      borrower: BORROWER,
      invokeLLM: llm.fn,
      fetch: f.fn,
      apiKey: 'test-key',
      today: TODAY,
      ...overrides,
    }),
  };
}

const byUrl = (signals: Signal[], url: string) => signals.filter((s) => s.source_url.replace(/\/$/, '') === url);

// ---------- queries and requests ----------

describe('queries', () => {
  test('builds the exact contract queries', () => {
    const [exec, legal] = buildNewsQueries('Acme Widgets');
    assert.equal(exec.type, 'exec_departure');
    assert.equal(
      exec.query,
      '"Acme Widgets" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs OR leaves)',
    );
    assert.equal(legal.type, 'legal_layoffs');
    assert.equal(legal.query, '"Acme Widgets" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)');
  });

  test('strips quotes from the company name', () => {
    assert.match(buildNewsQueries('The "Best" Co')[0].query, /^"The Best Co" /);
  });

  test('search URL asks Google News for the last 6 months as JSON', () => {
    assert.equal(
      buildNewsSearchUrl('"A B" x'),
      'https://www.google.com/search?q=%22A%20B%22%20x&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1',
    );
  });

  test('calls Bright Data with the mcp_unlocker zone, raw format and bearer key', async () => {
    const { f, result } = run();
    await result;
    const searches = f.requests.filter((r) => isSearch(r.body.url));
    assert.equal(searches.length, 2);
    for (const r of [...searches, ...f.requests]) {
      assert.equal(r.url, 'https://api.brightdata.com/request');
      assert.equal(r.body.zone, 'mcp_unlocker');
      assert.equal(r.body.format, 'raw');
      assert.equal(r.headers.Authorization, 'Bearer test-key');
    }
  });
});

// ---------- dates ----------

describe('parseNewsDate', () => {
  const cases: Array<[string, string | null]> = [
    ['3 days ago', '2026-10-07'],
    ['1 day ago', '2026-10-09'],
    ['yesterday', '2026-10-09'],
    ['5 hours ago', '2026-10-10'],
    ['12 mins ago', '2026-10-10'],
    ['2 weeks ago', '2026-09-26'],
    ['1 month ago', '2026-09-10'],
    ['3 months ago', '2026-07-10'],
    ['1 year ago', '2025-10-10'],
    ['Jun 18, 2026', '2026-06-18'],
    ['June 18, 2026', '2026-06-18'],
    ['18 Jun 2026', '2026-06-18'],
    ['Sept 3, 2026', '2026-09-03'],
    ['2026-06-18', '2026-06-18'],
    ['2026-06-18T23:30:00Z', '2026-06-18'],
    ['Oct 11, 2026', '2026-10-10'],
    ['Dec 25, 2026', null],
    ['', null],
    ['last spring', null],
    ['Feb 30, 2026', null],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(parseNewsDate(input, TODAY), expected);
    });
  }
});

// ---------- tag parsing ----------

describe('parseTag and prompt', () => {
  test('accepts a well-formed tag, including a JSON string reply', () => {
    const tag = DEFAULT_TAGS[URLS.cfo];
    assert.deepEqual(parseTag(tag), tag);
    assert.deepEqual(parseTag('```json\n' + JSON.stringify(tag) + '\n```'), tag);
  });

  test('rejects malformed tags', () => {
    assert.equal(parseTag(null), null);
    assert.equal(parseTag('nonsense'), null);
    assert.equal(parseTag({ relevant: 'yes' }), null);
  });

  test('prompt carries the borrower identity, the item text and the URL', () => {
    const prompt = buildTagPrompt(BORROWER, {
      url: URLS.cfo,
      title: 'Acme Widgets CFO resigns',
      source: 'Dayton Daily',
      date: '2026-10-07',
      text: 'BODY TEXT',
      query: 'exec_departure',
    });
    for (const s of ['Acme Widgets', 'acmewidgets.com', 'Dayton', `URL: ${URLS.cfo}`, 'BODY TEXT', 'same_company']) {
      assert.ok(prompt.includes(s), `prompt missing ${s}`);
    }
    assert.ok(TAG_SCHEMA.properties.snippet);
  });
});

// ---------- end-to-end through the pure pipeline ----------

describe('runNewsSignals', () => {
  test('CFO resignation becomes a strong exec_departure with the verbatim snippet', async () => {
    const signals = await run().result;
    const [cfo] = byUrl(signals, URLS.cfo);
    assert.deepEqual(cfo, {
      type: 'exec_departure',
      severity: 'strong',
      date: '2026-10-07',
      title: 'Acme Widgets CFO resigns after two years',
      snippet: 'Acme Widgets chief financial officer Jane Roe resigned on Monday, the Dayton company said',
      source_name: 'Dayton Daily Example',
      source_url: URLS.cfo,
    });
  });

  test('VP departure is weak', async () => {
    const [vp] = byUrl(await run().result, URLS.vp);
    assert.equal(vp.type, 'exec_departure');
    assert.equal(vp.severity, 'weak');
    assert.equal(vp.date, '2026-09-01');
  });

  test('WARN notice is a strong legal_layoffs; snippet matched case- and whitespace-insensitively', async () => {
    const [warn] = byUrl(await run().result, URLS.warn);
    assert.equal(warn.type, 'legal_layoffs');
    assert.equal(warn.severity, 'strong');
    assert.equal(warn.date, '2026-09-20');
    // Copied from the source text, not the model's lower-cased, whitespace-mangled version.
    assert.equal(warn.snippet, 'Acme Widgets filed a WARN notice on September 18, 2026 covering 120 workers');
  });

  test('generic lawsuit is a weak legal_layoffs with a relative date', async () => {
    const [suit] = byUrl(await run().result, URLS.suit);
    assert.equal(suit.type, 'legal_layoffs');
    assert.equal(suit.severity, 'weak');
    assert.equal(suit.date, '2026-09-26');
  });

  test('returns exactly the expected four signals and never a status', async () => {
    const signals = await run().result;
    assert.deepEqual(signals.map((s) => s.source_url.replace(/\/$/, '')).sort(), [URLS.vp, URLS.cfo, URLS.suit, URLS.warn].sort());
    for (const s of signals) assert.equal('status' in s, false);
  });

  test('hallucinated snippet is dropped', async () => {
    const { llm, result } = run();
    const signals = await result;
    assert.ok(llm.calls.some((c) => c.url === URLS.coo), 'COO item was tagged');
    assert.equal(byUrl(signals, URLS.coo).length, 0);
  });

  test('a different company with a similar name is dropped', async () => {
    const { llm, result } = run();
    const signals = await result;
    assert.ok(llm.calls.some((c) => c.url === URLS.otherCo));
    assert.equal(byUrl(signals, URLS.otherCo).length, 0);
  });

  test('items older than 180 days or undated are dropped before reading or tagging', async () => {
    const { f, llm, result } = run();
    await result;
    assert.equal(f.pageReads(URLS.old), 0);
    assert.equal(llm.calls.some((c) => c.url === URLS.old), false);
    assert.equal(llm.calls.some((c) => c.url === 'https://news.example.com/acme-undated'), false);
  });

  test('page read failure falls back to the SERP title and description', async () => {
    const { f, llm, result } = run();
    const signals = await result;
    assert.equal(f.pageReads(URLS.vp), 1);
    const vpCall = llm.calls.find((c) => c.url === URLS.vp)!;
    assert.ok(vpCall.prompt.includes('Tom Lee has left the company'));
    assert.equal(byUrl(signals, URLS.vp).length, 1);
  });

  test('a duplicate URL across both queries is read, tagged and returned once', async () => {
    const { f, llm, result } = run();
    const signals = await result;
    assert.equal(f.pageReads(URLS.cfo), 1);
    assert.equal(llm.calls.filter((c) => c.url === URLS.cfo).length, 1);
    assert.equal(byUrl(signals, URLS.cfo).length, 1);
  });

  test('relevant=false and severity=none are dropped', async () => {
    const llm = fakeLLM({
      ...DEFAULT_TAGS,
      [URLS.cfo]: { ...DEFAULT_TAGS[URLS.cfo], relevant: false },
      [URLS.warn]: { ...DEFAULT_TAGS[URLS.warn], severity: 'none' },
    });
    const signals = await run({ invokeLLM: llm.fn }).result;
    assert.equal(byUrl(signals, URLS.cfo).length, 0);
    assert.equal(byUrl(signals, URLS.warn).length, 0);
  });

  test('keeps at most one signal per type and severity (newest), so one story cannot turn a company red', async () => {
    const llm = fakeLLM({
      ...DEFAULT_TAGS,
      [URLS.suit]: { ...DEFAULT_TAGS[URLS.suit], severity: 'strong' },
    });
    const signals = await run({ invokeLLM: llm.fn }).result;
    const strongLegal = signals.filter((s) => s.type === 'legal_layoffs' && s.severity === 'strong');
    assert.equal(strongLegal.length, 1);
    assert.equal(strongLegal[0].source_url, URLS.suit); // 2026-09-26 is newer than 2026-09-20
  });

  test('one query failing still returns the other query\'s signals', async () => {
    const f = fakeFetch({ exec: { status: 502, body: 'bad gateway' } });
    const signals = await run({ fetch: f.fn }).result;
    assert.ok(byUrl(signals, URLS.warn).length === 1);
    assert.ok(byUrl(signals, URLS.suit).length === 1);
    assert.equal(byUrl(signals, URLS.vp).length, 0);
  });

  test('a search returning non-JSON counts as a failed query', async () => {
    const f = fakeFetch({ legal: { body: '<html>captcha</html>' } });
    const signals = await run({ fetch: f.fn }).result;
    assert.equal(signals.filter((s) => s.type === 'exec_departure').length, 2);
  });

  test('both queries failing throws', async () => {
    const f = fakeFetch({ exec: { throws: 'network down' }, legal: { status: 500, body: 'err' } });
    await assert.rejects(run({ fetch: f.fn }).result, /News/);
  });

  test('LLM failing on every item throws instead of reporting no signals', async () => {
    const boom = new Error('LLM down');
    const tags = Object.fromEntries(Object.keys(DEFAULT_TAGS).map((k) => [k, boom]));
    const llm = fakeLLM(tags);
    await assert.rejects(run({ invokeLLM: llm.fn }).result, /News/);
  });

  test('a search with no news block and no empty flag counts as a failed query', async () => {
    const f = fakeFetch({ legal: { body: JSON.stringify({ general: { search_type: 'news' }, navigation: [] }) } });
    const signals = await run({ fetch: f.fn }).result;
    assert.equal(signals.filter((s) => s.type === 'exec_departure').length, 2);
    const both = fakeFetch({
      exec: { body: JSON.stringify({ general: {} }) },
      legal: { body: JSON.stringify({ general: {} }) },
    });
    await assert.rejects(run({ fetch: both.fn }).result, /News/);
  });

  test('Google\'s real empty-result shape (general.empty, no news key) returns an empty list', async () => {
    const empty = { body: JSON.stringify({ general: { search_type: 'news', empty: true }, navigation: [] }) };
    const f = fakeFetch({ exec: empty, legal: empty });
    assert.deepEqual(await run({ fetch: f.fn }).result, []);
  });

  test('no news at all returns an empty list', async () => {
    const empty = { body: JSON.stringify({ news: [] }) };
    const f = fakeFetch({ exec: empty, legal: empty });
    assert.deepEqual(await run({ fetch: f.fn }).result, []);
  });

  test('missing API key throws', async () => {
    await assert.rejects(run({ apiKey: undefined }).result, /BRIGHTDATA_API_KEY/);
  });

  test('missing borrower name throws', async () => {
    await assert.rejects(run({ borrower: { name: '' } }).result, /borrower/);
  });

  test('reads at most 5 results per query', async () => {
    const many = {
      news: Array.from({ length: 9 }, (_, i) => ({
        title: `Acme Widgets story ${i}`,
        link: `https://many.example.com/${i}`,
        source: 'Many',
        description: 'Acme Widgets news.',
        date: '1 day ago',
      })),
    };
    const empty = { body: JSON.stringify({ news: [] }) };
    const f = fakeFetch({ exec: { body: JSON.stringify(many) }, legal: empty });
    const llm = fakeLLM({});
    await run({ fetch: f.fn, invokeLLM: llm.fn }).result;
    assert.equal(llm.calls.length, 5);
  });
});
