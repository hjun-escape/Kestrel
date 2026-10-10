import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MAX_STEPS,
  buildBriefPrompt,
  buildPlanPrompt,
  htmlToText,
  normaliseSerpJson,
  parseBrief,
  parseToolChoice,
  runAnalyst,
  verifyFindings,
} from '../base44/functions/analyzeBorrower/logic.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SERP_JSON = JSON.parse(readFileSync(join(here, 'fixtures/analyst-serp.json'), 'utf8'));
const PAGE_HTML = readFileSync(join(here, 'fixtures/analyst-page.html'), 'utf8');

const SUIT_URL = 'https://www.dayton-business.example/news/acme-widgets-sued';
const CFO_URL = 'https://news.example.org/acme-cfo-exit';
const SIGNAL_URL = 'https://warn.example.gov/notices/acme-2026';

const BORROWER = {
  id: 'b1',
  name: 'Acme Widgets',
  website_domain: 'acmewidgets.com',
  hq_city: 'Dayton',
  hq_state: 'OH',
  industry: 'Manufacturing',
  stage: 'borrower',
};

const SIGNALS = [
  {
    type: 'legal_layoffs',
    severity: 'strong',
    date: '2026-09-01',
    title: 'WARN notice: Acme Widgets',
    snippet: 'Acme Widgets filed a WARN notice covering 120 workers at its Dayton plant.',
    source_name: 'Ohio WARN',
    source_url: SIGNAL_URL,
  },
];

// ---------- fakes ----------

type Scripted = unknown | Error;

function fakeLLM(script: Scripted[]) {
  const calls: Array<{ prompt: string; response_json_schema?: object }> = [];
  const fn = async (params: { prompt: string; response_json_schema?: object }) => {
    calls.push(params);
    if (calls.length > script.length) throw new Error('fake LLM script exhausted');
    const next = script[calls.length - 1];
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn, calls };
}

type Route = { status?: number; json?: unknown; text?: string; throws?: string };

function fakeFetch(routes: { serp?: Route; pages?: Record<string, Route> }) {
  const requests: Array<{ url: string; body: Record<string, string>; headers: Record<string, string> }> = [];
  const fn = async (url: string, init: { body: string; headers: Record<string, string> }) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body, headers: init.headers });
    const route = body.url.startsWith('https://www.google.com/search')
      ? routes.serp
      : routes.pages?.[body.url];
    if (!route) return new Response('not found', { status: 404 });
    if (route.throws) throw new Error(route.throws);
    const payload = route.json !== undefined ? JSON.stringify(route.json) : route.text ?? '';
    return new Response(payload, { status: route.status ?? 200 });
  };
  return { fn, requests };
}

function clock(stepMs = 0) {
  let t = 1_000_000;
  return () => {
    const v = t;
    t += stepMs;
    return v;
  };
}

const GOOD_BRIEF = {
  summary: 'Acme Widgets is being sued by a lender. Its CFO left. A WARN notice was filed.',
  findings: [
    {
      claim: 'A lender sued Acme over a defaulted credit line.',
      quote: 'alleging that Acme Widgets Inc. defaulted on a $4.2 million revolving credit facility',
      source_url: SUIT_URL,
      source_name: 'Dayton Business Journal',
      date: '2026-09-20',
    },
    {
      claim: 'Acme granted a blanket lien to another lender (possible loan stacking).',
      quote: 'Acme granted a blanket lien to Rapid Capital LLC in January',
      source_url: SUIT_URL,
      source_name: 'Dayton Business Journal',
    },
    {
      claim: 'Layoffs at the Dayton plant.',
      quote: 'filed a WARN notice covering 120 workers',
      source_url: SIGNAL_URL,
      source_name: 'Ohio WARN',
    },
  ],
  open_questions: ['Has Rapid Capital filed a UCC-1?'],
  recommended_action: 'escalate',
};

function deps(llm: ReturnType<typeof fakeLLM>, fetch: ReturnType<typeof fakeFetch>, now = clock()) {
  return {
    borrower: BORROWER,
    signals: SIGNALS,
    invokeLLM: llm.fn,
    fetch: fetch.fn,
    apiKey: 'test-key',
    now,
  };
}

// ---------- unit: pure helpers ----------

describe('normaliseSerpJson', () => {
  test('maps Bright Data news results to {title,url,source,date,snippet} and skips junk', () => {
    const results = normaliseSerpJson(SERP_JSON);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
      title: 'Acme Widgets sued by First Harbor Bank over unpaid credit line',
      url: SUIT_URL,
      source: 'Dayton Business Journal',
      date: '2 weeks ago',
      snippet:
        'First Harbor Bank filed suit against Acme Widgets Inc. seeking $4.2 million on a defaulted revolving credit facility.',
    });
    assert.equal(results[1].snippet, 'Chief financial officer Dana Ruiz has left Acme Widgets effective immediately.');
  });

  test('returns [] for non-object, missing news, or a JSON string that does not parse', () => {
    assert.deepEqual(normaliseSerpJson(null), []);
    assert.deepEqual(normaliseSerpJson({ organic: [] }), []);
    assert.deepEqual(normaliseSerpJson('<html>blocked</html>'), []);
    assert.equal(normaliseSerpJson(JSON.stringify(SERP_JSON)).length, 2);
  });
});

describe('htmlToText', () => {
  test('drops script/style, decodes entities, collapses whitespace', () => {
    const text = htmlToText(PAGE_HTML);
    assert.ok(!text.includes('tracking'));
    assert.ok(!text.includes('color: red'));
    assert.ok(text.includes('alleging that Acme Widgets Inc. defaulted on a $4.2 million revolving credit facility'));
    assert.ok(text.includes('Acme\'s CEO said the company "disputes the claims".'));
    assert.ok(!/\s{2,}/.test(text));
  });

  test('caps output length', () => {
    const big = '<p>' + 'word '.repeat(10_000) + '</p>';
    assert.ok(htmlToText(big, 15_000).length <= 15_000);
  });
});

describe('parseToolChoice', () => {
  test('accepts an object or a fenced JSON string', () => {
    assert.deepEqual(parseToolChoice({ action: 'news_search', input: 'Acme lawsuit' }), {
      action: 'news_search',
      input: 'Acme lawsuit',
    });
    assert.deepEqual(parseToolChoice('```json\n{"action":"read_page","input":"https://x.example/a"}\n```'), {
      action: 'read_page',
      input: 'https://x.example/a',
    });
    assert.deepEqual(parseToolChoice({ action: 'finish' }), { action: 'finish', input: '' });
  });

  test('returns null for malformed or unknown tool choices', () => {
    assert.equal(parseToolChoice('not json {'), null);
    assert.equal(parseToolChoice({ action: 'delete_everything', input: 'x' }), null);
    assert.equal(parseToolChoice({ action: 'news_search', input: '' }), null);
    assert.equal(parseToolChoice(42), null);
  });
});

describe('parseBrief', () => {
  test('validates shape, trims summary to 3 sentences, defaults bad action', () => {
    const brief = parseBrief({
      summary: 'One. Two. Three. Four.',
      findings: [{ claim: 'c', quote: 'q', source_url: 'https://a.example' }, { claim: 'missing quote' }],
      open_questions: ['q1', 7],
      recommended_action: 'buy_now',
    });
    assert.ok(brief);
    assert.equal(brief.summary, 'One. Two. Three.');
    assert.equal(brief.findings.length, 1);
    assert.deepEqual(brief.open_questions, ['q1']);
    assert.equal(brief.recommended_action, 'request_documents');
  });

  test('returns null when the brief is unparseable', () => {
    assert.equal(parseBrief('{"summary": '), null);
    assert.equal(parseBrief({ findings: [] }), null);
  });
});

describe('verifyFindings', () => {
  const sources = new Map([[SUIT_URL, ['First Harbor   Bank filed a LAWSUIT today.']]]);

  test('keeps a quote that matches whitespace-normalised and case-insensitively', () => {
    const { kept, dropped } = verifyFindings(
      [{ claim: 'c', quote: 'first harbor bank filed a lawsuit', source_url: SUIT_URL, source_name: 'DBJ' }],
      sources,
    );
    assert.equal(kept.length, 1);
    assert.equal(dropped.length, 0);
  });

  test('drops a quote that is not in the source text', () => {
    const { kept, dropped } = verifyFindings(
      [{ claim: 'c', quote: 'the bank seized all assets', source_url: SUIT_URL, source_name: 'DBJ' }],
      sources,
    );
    assert.equal(kept.length, 0);
    assert.equal(dropped[0].reason, 'quote_not_found');
  });

  test('drops a finding whose source_url was never seen', () => {
    const { kept, dropped } = verifyFindings(
      [{ claim: 'c', quote: 'first harbor bank filed a lawsuit', source_url: 'https://evil.example/x', source_name: 'X' }],
      sources,
    );
    assert.equal(kept.length, 0);
    assert.equal(dropped[0].reason, 'unknown_source');
  });

  test('treats trailing slash and fragment as the same URL', () => {
    const { kept } = verifyFindings(
      [{ claim: 'c', quote: 'first harbor bank filed a lawsuit', source_url: SUIT_URL + '/#top', source_name: 'DBJ' }],
      sources,
    );
    assert.equal(kept.length, 1);
  });
});

describe('prompts', () => {
  test('include website_domain, hq_city and the same-company rule', () => {
    for (const prompt of [
      buildPlanPrompt({ borrower: BORROWER, signals: SIGNALS, observations: [], stepsLeft: 4 }),
      buildBriefPrompt({ borrower: BORROWER, signals: SIGNALS, observations: [] }),
    ]) {
      assert.ok(prompt.includes('acmewidgets.com'));
      assert.ok(prompt.includes('Dayton'));
      assert.ok(prompt.includes("if unsure it's the same company, omit it"));
    }
  });
});

// ---------- integration: the agent loop with fake LLM + fake fetch ----------

describe('runAnalyst', () => {
  test('happy path: searches, reads a page, returns a verified brief', async () => {
    const llm = fakeLLM([
      { action: 'news_search', input: 'Acme Widgets lawsuit lender' },
      { action: 'read_page', input: SUIT_URL },
      { action: 'finish' },
      GOOD_BRIEF,
    ]);
    const fetch = fakeFetch({ serp: { json: SERP_JSON }, pages: { [SUIT_URL]: { text: PAGE_HTML } } });

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const a = result.analysis;
    assert.equal(a.borrower_id, 'b1');
    assert.equal(a.findings.length, 3);
    assert.equal(a.recommended_action, 'escalate');
    assert.deepEqual(
      a.steps.map((s) => [s.tool, s.ok]),
      [
        ['news_search', true],
        ['read_page', true],
      ],
    );
    assert.ok(!Number.isNaN(Date.parse(a.created_at)));
    // Bright Data request shape
    const serpReq = fetch.requests[0];
    assert.equal(serpReq.url, 'https://api.brightdata.com/request');
    assert.equal(serpReq.headers.Authorization, 'Bearer test-key');
    assert.equal(serpReq.body.zone, 'mcp_unlocker');
    assert.equal(serpReq.body.format, 'raw');
    assert.ok(serpReq.body.url.includes('q=Acme%20Widgets%20lawsuit%20lender'));
    assert.ok(serpReq.body.url.includes('tbm=nws') && serpReq.body.url.includes('brd_json=1'));
    // final call used a JSON schema
    assert.ok(llm.calls[3].response_json_schema);
  });

  test('drops a hallucinated quote', async () => {
    const brief = {
      ...GOOD_BRIEF,
      findings: [
        ...GOOD_BRIEF.findings,
        { claim: 'Acme filed for bankruptcy.', quote: 'Acme Widgets filed for Chapter 11 protection', source_url: SUIT_URL, source_name: 'DBJ' },
      ],
    };
    const llm = fakeLLM([
      { action: 'news_search', input: 'Acme Widgets' },
      { action: 'read_page', input: SUIT_URL },
      { action: 'finish' },
      brief,
    ]);
    const fetch = fakeFetch({ serp: { json: SERP_JSON }, pages: { [SUIT_URL]: { text: PAGE_HTML } } });

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.analysis.findings.length, 3);
    assert.ok(!result.analysis.findings.some((f) => f.quote.includes('Chapter 11')));
  });

  test('drops a finding whose source_url was not seen in this run or stored signals', async () => {
    const brief = {
      ...GOOD_BRIEF,
      findings: [
        { ...GOOD_BRIEF.findings[0], source_url: 'https://made-up.example/story' },
        GOOD_BRIEF.findings[2],
      ],
    };
    const llm = fakeLLM([{ action: 'news_search', input: 'Acme' }, { action: 'read_page', input: SUIT_URL }, { action: 'finish' }, brief]);
    const fetch = fakeFetch({ serp: { json: SERP_JSON }, pages: { [SUIT_URL]: { text: PAGE_HTML } } });

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.analysis.findings.map((f) => f.source_url), [SIGNAL_URL]);
  });

  test('records a tool error and keeps going', async () => {
    const llm = fakeLLM([
      { action: 'news_search', input: 'Acme Widgets' },
      { action: 'read_page', input: SUIT_URL },
      { action: 'read_page', input: CFO_URL },
      { action: 'finish' },
      { ...GOOD_BRIEF, findings: [GOOD_BRIEF.findings[2]] },
    ]);
    const fetch = fakeFetch({
      serp: { json: SERP_JSON },
      pages: { [SUIT_URL]: { status: 502, text: 'upstream error' }, [CFO_URL]: { throws: 'socket hang up' } },
    });

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.analysis.steps.map((s) => [s.tool, s.ok]),
      [
        ['news_search', true],
        ['read_page', false],
        ['read_page', false],
      ],
    );
    assert.equal(result.analysis.findings.length, 1);
  });

  test('refuses to read a URL that did not come from search results or signals', async () => {
    const llm = fakeLLM([{ action: 'read_page', input: 'http://169.254.169.254/latest' }, { action: 'finish' }, GOOD_BRIEF]);
    const fetch = fakeFetch({});

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.analysis.steps[0].ok, false);
    assert.equal(fetch.requests.length, 0);
  });

  test(`enforces the ${MAX_STEPS}-step limit`, async () => {
    const plans = Array.from({ length: 10 }, (_, i) => ({ action: 'news_search', input: `Acme query ${i}` }));
    const llm = fakeLLM([...plans.slice(0, MAX_STEPS), GOOD_BRIEF]);
    const fetch = fakeFetch({ serp: { json: SERP_JSON } });

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.analysis.steps.length, MAX_STEPS);
    assert.equal(fetch.requests.length, MAX_STEPS);
    assert.equal(llm.calls.length, MAX_STEPS + 1);
  });

  test('stops planning when the time budget is spent', async () => {
    const llm = fakeLLM([{ action: 'news_search', input: 'Acme' }, GOOD_BRIEF]);
    const fetch = fakeFetch({ serp: { json: SERP_JSON } });

    // every now() call advances 40 s, so the 90 s budget runs out after one step
    const result = await runAnalyst(deps(llm, fetch, clock(40_000)));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.analysis.steps.length <= 1);
  });

  test('malformed plan JSON ends planning and still writes a brief', async () => {
    const llm = fakeLLM(['{"action": "news_sea', { ...GOOD_BRIEF, findings: [GOOD_BRIEF.findings[2]] }]);
    const fetch = fakeFetch({});

    const result = await runAnalyst(deps(llm, fetch));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.analysis.steps[0].tool, 'plan');
    assert.equal(result.analysis.steps[0].ok, false);
    assert.equal(result.analysis.findings.length, 1);
  });

  test('malformed final JSON is retried once', async () => {
    const llm = fakeLLM([{ action: 'finish' }, 'Sorry, here is my analysis: {oops', GOOD_BRIEF]);
    const result = await runAnalyst(deps(llm, fakeFetch({})));
    assert.equal(result.ok, true);
  });

  test('malformed final JSON twice returns an llm error, never throws', async () => {
    const llm = fakeLLM([{ action: 'finish' }, '{bad', '{still bad']);
    const result = await runAnalyst(deps(llm, fakeFetch({})));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'llm_malformed');
  });

  test('does not retry the brief call once the time budget is spent', async () => {
    const llm = fakeLLM([{ action: 'finish' }, '{bad']);
    const result = await runAnalyst(deps(llm, fakeFetch({}), clock(40_000)));
    assert.equal(result.ok, false);
    assert.equal(llm.calls.length, 2);
  });

  test('LLM unavailable returns llm_unavailable', async () => {
    const llm = fakeLLM([new Error('503 upstream'), new Error('503 upstream')]);
    const result = await runAnalyst(deps(llm, fakeFetch({})));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'llm_unavailable');
    assert.match(result.error, /unavailable/i);
  });

  test('missing Bright Data key is recorded as a tool error', async () => {
    const llm = fakeLLM([{ action: 'news_search', input: 'Acme' }, { action: 'finish' }, GOOD_BRIEF]);
    const fetch = fakeFetch({ serp: { json: SERP_JSON } });
    const result = await runAnalyst({ ...deps(llm, fetch), apiKey: '' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.analysis.steps[0].ok, false);
    assert.equal(fetch.requests.length, 0);
  });
});
