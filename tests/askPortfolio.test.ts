import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  runAgent,
  buildPrompt,
  parseLlmReply,
  dispatchTool,
  verifyCitations,
  normalizeMessages,
  OUT_OF_SCOPE_REPLY,
  MAX_TOOL_STEPS,
  MAX_LLM_CALLS,
  FINAL_RESPONSE_SCHEMA,
} from '../base44/functions/askPortfolio/logic.ts';
import { validateAction, executeAction } from '../base44/functions/confirmAction/logic.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/ask-portfolio.json', import.meta.url), 'utf8'),
);
const NOW = Date.parse(fixture.now);

// Read-only fake data layer. The write traps prove askPortfolio never writes.
function fakeData() {
  const writes: string[] = [];
  const data = {
    listBorrowers: async () => fixture.borrowers.map((b: object) => ({ ...b })),
    getBorrower: async (id: string) => fixture.borrowers.find((b: { id: string }) => b.id === id) ?? null,
    listSignals: async (borrowerId: string) =>
      fixture.signals.filter((s: { borrower_id: string }) => s.borrower_id === borrowerId),
    create: async () => { writes.push('create'); },
    update: async () => { writes.push('update'); },
  };
  return { data, writes };
}

// Scripted LLM: each reply is a value or a function of the prompt.
function fakeLlm(replies: unknown[]) {
  const prompts: string[] = [];
  let i = 0;
  const llm = async (prompt: string) => {
    prompts.push(prompt);
    const next = replies[Math.min(i, replies.length - 1)];
    i += 1;
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? (next as (p: string) => unknown)(prompt) : next;
  };
  return { llm, prompts, calls: () => i };
}

const user = (content: string) => [{ role: 'user', content }];
const clock = () => NOW;

describe('askPortfolio agent loop', () => {
  test('answers a summary question from portfolio_summary', async () => {
    const { data, writes } = fakeData();
    const { llm, prompts } = fakeLlm([
      { action: 'tool', tool: 'portfolio_summary', args: {} },
      (p: string) => {
        assert.match(p, /"exposure_at_risk_usd":\s*6500000/);
        return { action: 'final', answer: 'Exposure at risk is $6.5M across 2 companies.', citations: [] };
      },
    ]);
    const res = await runAgent({ messages: user("What's our exposure at risk?"), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, 'Exposure at risk is $6.5M across 2 companies.');
    assert.deepEqual(res.body.citations, []);
    assert.deepEqual(res.body.pending_actions, []);
    assert.equal(prompts.length, 2);
    assert.deepEqual(writes, []);
  });

  test('portfolio_summary counts statuses, exposure and stale companies', async () => {
    const { data } = fakeData();
    const out = await dispatchTool('portfolio_summary', {}, { data, nowMs: NOW });
    assert.deepEqual(out.counts_by_status, { green: 2, yellow: 1, red: 1 });
    assert.equal(out.exposure_at_risk_usd, 6500000);
    assert.deepEqual(out.stale.map((s: { id: string }) => s.id), ['b_harbor']);
    assert.deepEqual(out.never_checked.map((s: { id: string }) => s.id), ['b_new']);
  });

  test('list_companies filters by stage and status and rejects bad enums', async () => {
    const { data } = fakeData();
    const out = await dispatchTool('list_companies', { stage: 'borrower', status: 'red' }, { data, nowMs: NOW });
    assert.deepEqual(out.companies.map((c: { id: string }) => c.id), ['b_north']);
    assert.deepEqual(Object.keys(out.companies[0]).sort(),
      ['id', 'last_refreshed', 'loan_amount_usd', 'name', 'stage', 'status', 'why'].sort());
    await assert.rejects(dispatchTool('list_companies', { status: 'purple' }, { data, nowMs: NOW }), /status/);
  });

  test('get_company returns candidates when the name is ambiguous', async () => {
    const { data } = fakeData();
    const out = await dispatchTool('get_company', { name_or_id: 'harbor' }, { data, nowMs: NOW });
    assert.equal(out.ambiguous, true);
    assert.deepEqual(out.candidates.map((c: { id: string }) => c.id).sort(), ['b_harbor', 'b_harbor_bev']);
    assert.equal(out.company, undefined);
  });

  test('get_company resolves a fuzzy unique name and includes signals', async () => {
    const { data } = fakeData();
    const out = await dispatchTool('get_company', { name_or_id: 'northfield packaging' }, { data, nowMs: NOW });
    assert.equal(out.company.id, 'b_north');
    assert.equal(out.signals.length, 2);
    const byId = await dispatchTool('get_company', { name_or_id: 'b_harbor' }, { data, nowMs: NOW });
    assert.equal(byId.company.id, 'b_harbor');
  });

  test('ambiguous name flows through the loop as a clarifying answer', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([
      { action: 'tool', tool: 'get_company', args: { name_or_id: 'Harbor' } },
      (p: string) => {
        assert.match(p, /"ambiguous":\s*true/);
        return { action: 'final', answer: 'Did you mean Harbor Freight Logistics or Harbor Beverages?', citations: [] };
      },
    ]);
    const res = await runAgent({ messages: user('How is Harbor doing?'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.match(res.body.answer, /Harbor Freight Logistics or Harbor Beverages/);
  });

  test('drops hallucinated citations and keeps verified ones', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([
      { action: 'tool', tool: 'get_company', args: { name_or_id: 'b_north' } },
      {
        action: 'final',
        answer: 'Northfield lost its CFO.',
        citations: [
          // Verified: url and quote (whitespace differs) are in the fetched signal.
          { company_id: 'b_north', signal_id: 's_cfo', source_url: 'https://news.example/northfield-cfo',
            quote: 'its chief financial officer, Dana Ruiz, resigned' },
          // Hallucinated url.
          { company_id: 'b_north', source_url: 'https://fake.example/made-up' },
          // Real url, invented quote.
          { company_id: 'b_north', source_url: 'https://warn.example/northfield-2026', quote: 'the company is bankrupt' },
          // Real url from a company not fetched this turn.
          { company_id: 'b_harbor', source_url: 'https://jobs.example/harbor' },
        ],
      },
    ]);
    const res = await runAgent({ messages: user('Why is Northfield red?'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.equal(res.body.citations.length, 1);
    assert.equal(res.body.citations[0].signal_id, 's_cfo');
  });

  test('verifyCitations rejects a signal_id that does not match the url', () => {
    const evidence = [
      { company_id: 'b_north', signal_id: 's_cfo', source_url: 'https://news.example/northfield-cfo', texts: ['x'] },
    ];
    const kept = verifyCitations(
      [{ company_id: 'b_north', signal_id: 's_layoffs', source_url: 'https://news.example/northfield-cfo' }],
      evidence,
    );
    assert.deepEqual(kept, []);
  });

  test('verifyCitations drops non-http source urls even if fetched', () => {
    const evidence = [
      { company_id: 'b_x', signal_id: 's_js', source_url: 'javascript:alert(1)', texts: [] },
    ];
    assert.deepEqual(verifyCitations([{ company_id: 'b_x', source_url: 'javascript:alert(1)' }], evidence), []);
  });

  test('a write request becomes a pending_action and nothing is written', async () => {
    const { data, writes } = fakeData();
    const { llm } = fakeLlm([
      { action: 'tool', tool: 'propose_refresh', args: { id: 'b_harbor' } },
      { action: 'tool', tool: 'propose_screen', args: { name: 'Acme Tools', website_domain: 'https://www.AcmeTools.example/', loan_amount_usd: 1000000 } },
      {
        action: 'final',
        answer: 'Confirm below to refresh Harbor Freight and screen Acme Tools.',
        citations: [],
        // LLM-invented actions are ignored; only tool-produced ones count.
        pending_actions: [{ kind: 'delete', params: { id: 'b_north' } }],
      },
    ]);
    const res = await runAgent({ messages: user('Refresh Harbor Freight and screen Acme Tools'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.deepEqual(writes, []);
    const kinds = res.body.pending_actions.map((a: { kind: string }) => a.kind);
    assert.deepEqual(kinds, ['refresh', 'screen']);
    const screen = res.body.pending_actions[1];
    assert.equal(screen.params.website_domain, 'acmetools.example');
    for (const action of res.body.pending_actions) {
      assert.equal(validateAction(action).ok, true, `confirmAction must accept ${action.kind}`);
    }
  });

  test('propose_screen refuses a domain already in the book', async () => {
    const { data } = fakeData();
    await assert.rejects(
      dispatchTool('propose_screen', { name: 'Northfield', website_domain: 'northfieldpack.example' }, { data, nowMs: NOW }),
      /already/,
    );
  });

  test('propose_deep_check validates the company and question', async () => {
    const { data } = fakeData();
    const out = await dispatchTool('propose_deep_check', { id: 'b_north', question: 'Is the CFO exit linked to a covenant breach?' }, { data, nowMs: NOW });
    assert.equal(out.pending_action.kind, 'deep_check');
    await assert.rejects(dispatchTool('propose_deep_check', { id: 'nope', question: 'Anything?' }, { data, nowMs: NOW }), /not found/);
    await assert.rejects(dispatchTool('propose_deep_check', { id: 'b_north', question: '' }, { data, nowMs: NOW }), /question/);
  });

  test('stops after the step limit with a fallback answer', async () => {
    const { data } = fakeData();
    // Unknown tool: every call errors, so there are never any tool results.
    const { llm, calls } = fakeLlm([
      ...Array.from({ length: 8 }, (_, i) => ({ action: 'tool', tool: 'nope', args: { i } })),
    ]);
    const res = await runAgent({ messages: user('Loop forever'), llm, data, now: clock, log: () => {} });
    assert.equal(res.status, 200);
    assert.ok(calls() <= MAX_LLM_CALLS, `llm called ${calls()} times`);
    assert.match(res.body.answer, /step limit/i);
    assert.deepEqual(res.body.citations, []);
  });

  test('stops when the time budget is spent', async () => {
    const { data } = fakeData();
    let t = NOW;
    const { llm } = fakeLlm([() => { t += 40_000; return { action: 'tool', tool: 'list_companies', args: {} }; }]);
    const res = await runAgent({ messages: user('Slow'), llm, data, now: () => t, budgetMs: 60_000 });
    assert.equal(res.status, 200);
    assert.match(res.body.answer, /time/i);
  });

  test('recovers from one malformed LLM reply', async () => {
    const { data } = fakeData();
    const { llm, prompts } = fakeLlm([
      'not json {',
      '```json\n{"action":"final","answer":"Four companies.","citations":[]}\n```',
    ]);
    const res = await runAgent({ messages: user('How many companies?'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, 'Four companies.');
    assert.match(prompts[1], /not valid/i);
  });

  test('gives a clear fallback when the LLM never returns valid JSON', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([{ foo: 'bar' }]);
    const res = await runAgent({ messages: user('Hello?'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.match(res.body.answer, /could not/i);
  });

  test('parseLlmReply handles objects, strings, fences and junk', () => {
    assert.deepEqual(parseLlmReply({ action: 'tool', tool: 'portfolio_summary' }),
      { ok: true, reply: { action: 'tool', tool: 'portfolio_summary', args: {} } });
    assert.equal(parseLlmReply('{"action":"final","answer":"hi"}').ok, true);
    assert.equal(parseLlmReply('garbage').ok, false);
    assert.equal(parseLlmReply({ action: 'final' }).ok, false);
    assert.equal(parseLlmReply(null).ok, false);
  });

  test('out-of-scope requests get the short refusal with no citations or actions', async () => {
    const { data } = fakeData();
    const { llm, prompts } = fakeLlm([
      { action: 'final', out_of_scope: true, answer: 'Sure! Here is a poem about the sea...',
        citations: [{ company_id: 'b_north', source_url: 'https://news.example/northfield-cfo' }] },
    ]);
    const res = await runAgent({ messages: user('Write me a poem about the sea'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer, OUT_OF_SCOPE_REPLY);
    assert.deepEqual(res.body.citations, []);
    assert.deepEqual(res.body.pending_actions, []);
    assert.match(prompts[0], /out_of_scope/);
  });

  test('records tool errors and keeps going', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([
      { action: 'tool', tool: 'drop_tables', args: {} },
      (p: string) => {
        assert.match(p, /unknown tool/i);
        return { action: 'final', answer: 'Done.', citations: [] };
      },
    ]);
    const res = await runAgent({ messages: user('Do something'), llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.equal(res.body.tool_errors.length, 1);
  });

  test('returns 502 when the LLM is unavailable', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([new Error('upstream 503')]);
    const res = await runAgent({ messages: user('Hi'), llm, data, now: clock });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /unavailable/i);
  });

  test('rejects bad message history with 400', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([]);
    for (const messages of [undefined, [], [{ role: 'assistant', content: 'hi' }], [{ role: 'user', content: 5 }]]) {
      const res = await runAgent({ messages, llm, data, now: clock });
      assert.equal(res.status, 400);
    }
  });

  test('normalizeMessages caps history at the last 10 messages', () => {
    const msgs = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const out = normalizeMessages(msgs);
    assert.equal(out.length, 10);
    assert.equal(out[9].content, 'm14');
  });

  test('buildPrompt states the rules and marks tool output as data', () => {
    const p = buildPrompt({ messages: [{ role: 'user', content: 'hi' }], transcript: [], today: '2026-10-10', toolsAllowed: true });
    assert.match(p, /never change.*status/i);
    assert.match(p, /untrusted data/i);
    assert.match(p, /portfolio_summary/);
    const last = buildPrompt({ messages: [{ role: 'user', content: 'hi' }], transcript: [], today: '2026-10-10', toolsAllowed: false });
    assert.match(last, /no more tools/i);
  });

  test('context_company_id is passed to the prompt as a hint, and bad or unknown ids are ignored', async () => {
    const { data } = fakeData();
    const pinned = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Any news?'), contextCompanyId: 'b_north', llm: pinned.llm, data, now: clock });
    assert.match(pinned.prompts[0], /pinned/i);
    assert.match(pinned.prompts[0], /Northfield Packaging Co\. \(id b_north\)/);

    const unknown = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Any news?'), contextCompanyId: 'b_missing', llm: unknown.llm, data, now: clock });
    assert.doesNotMatch(unknown.prompts[0], /pinned/i);

    const bad = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    const res = await runAgent({ messages: user('Any news?'), contextCompanyId: 'x"; drop', llm: bad.llm, data, now: clock });
    assert.equal(res.status, 200);
    assert.doesNotMatch(bad.prompts[0], /pinned/i);

    const none = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Any news?'), llm: none.llm, data, now: clock });
    assert.doesNotMatch(none.prompts[0], /pinned/i);
  });
});

// Fixture plus a Rivian borrower with three signals (four, to test the cap of three).
function rivianData() {
  const base = fakeData().data;
  const rivian = {
    id: 'b_rivian', name: 'Rivian', stage: 'borrower', status: 'red',
    why: 'Layoffs announced and CFO departure.', loan_amount_usd: 9000000, last_refreshed: '2026-10-08T10:00:00Z',
  };
  const sig = (id: string, date: string, n: number) => ({
    id, borrower_id: 'b_rivian', date, title: `Rivian headline ${n}`, snippet: `Snippet ${n}`,
    source_name: `Wire ${n}`, source_url: `https://example.com/rivian/${n}`,
  });
  const signals = [sig('r1', '2026-09-01', 1), sig('r2', '2026-10-05', 2), sig('r3', '2026-09-20', 3), sig('r4', '2026-08-01', 4)];
  return {
    ...base,
    listBorrowers: async () => [...(await base.listBorrowers()), rivian],
    getBorrower: async (id: string) => (id === 'b_rivian' ? rivian : base.getBorrower(id)),
    listSignals: async (id: string) => (id === 'b_rivian' ? signals : base.listSignals(id)),
  };
}

describe('askPortfolio step-limit resilience', () => {
  const rivianCall = { action: 'tool', tool: 'get_company', args: { name_or_id: 'Rivian' } };

  test('model calling get_company six times still yields a deterministic summary with citations', async () => {
    const data = rivianData();
    // Distinct args each time so the repeat guard does not short-circuit the steps.
    const calls = ['Rivian', 'rivian', 'RIVIAN', 'Rivian ', 'b_rivian', 'Rivian Inc'].map((n) => ({
      action: 'tool', tool: 'get_company', args: { name_or_id: n },
    }));
    const { llm } = fakeLlm(calls);
    const res = await runAgent({ messages: user('Tell me about the borrower'), llm, data, now: clock, log: () => {} });
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.body.answer ?? '', /step limit/i);
    assert.match(res.body.answer ?? '', /Rivian \(borrower\): Red \u2014 Layoffs announced and CFO departure\. Last checked 2026-10-08\./);
    assert.match(res.body.answer ?? '', /- Rivian headline 2 \(2026-10-05, Wire 2\)/);
    assert.doesNotMatch(res.body.answer ?? '', /headline 4/);
    assert.equal(res.body.citations?.length, 3);
    assert.equal(res.body.citations?.[0].source_url, 'https://example.com/rivian/2');
  });

  test('final pass uses the final-only schema; a tool call there falls back to the summary', async () => {
    const data = rivianData();
    const schemas: object[] = [];
    const llm = async (_p: string, schema: object) => { schemas.push(schema); return { action: 'tool', tool: 'portfolio_summary', args: { n: schemas.length } }; };
    const res = await runAgent({ messages: user('How are we doing?'), llm, data, now: clock, log: () => {} });
    assert.equal(schemas.filter((s) => s === FINAL_RESPONSE_SCHEMA).length, 1);
    assert.deepEqual((FINAL_RESPONSE_SCHEMA.properties.action as { enum: string[] }).enum, ['final']);
    assert.ok(FINAL_RESPONSE_SCHEMA.required.includes('answer'));
    assert.match(res.body.answer ?? '', /^Portfolio: 2 red, 1 yellow, 2 green\. Exposure at risk: \$15,500,000\.$/);
    assert.match(res.body.answer ?? '', /Exposure at risk/);
  });

  test('malformed final pass also falls back instead of giving up', async () => {
    const data = rivianData();
    const { llm } = fakeLlm([
      { action: 'tool', tool: 'get_company', args: { name_or_id: 'Rivian' } },
      ...Array.from({ length: 8 }, () => 'garbage'),
    ]);
    const res = await runAgent({ messages: user('Tell me about the borrower'), llm, data, now: clock, log: () => {} });
    assert.match(res.body.answer ?? '', /Rivian \(borrower\): Red/);
  });

  test('a repeated identical call is not run again or counted as a step', async () => {
    const data = rivianData();
    let runs = 0;
    const counting = { ...data, listSignals: async (id: string) => { runs += 1; return data.listSignals(id); } };
    const { llm, prompts } = fakeLlm([
      rivianCall, rivianCall,
      { action: 'tool', tool: 'portfolio_summary', args: {} },
      { action: 'final', answer: 'Done.', citations: [] },
    ]);
    const res = await runAgent({ messages: user('Tell me about the borrower'), llm, data: counting, now: clock, log: () => {} });
    assert.equal(res.body.answer, 'Done.');
    assert.equal(runs, 1);
    assert.match(prompts[2], /You already called get_company with these arguments; its result is above\. Use it, or give the final answer\./);
  });

  test('two consecutive repeats force the final pass', async () => {
    const data = rivianData();
    const schemas: object[] = [];
    let n = 0;
    const llm = async (_p: string, schema: object) => {
      schemas.push(schema); n += 1;
      return n <= 3 ? rivianCall : { action: 'final', answer: 'From the result.', citations: [] };
    };
    const res = await runAgent({ messages: user('Tell me about the borrower'), llm, data, now: clock, log: () => {} });
    assert.equal(res.body.answer, 'From the result.');
    assert.equal(n, 4);
    assert.equal(schemas[3], FINAL_RESPONSE_SCHEMA);
  });

  test('naming one company prefetches it so a summary needs a single LLM call', async () => {
    const data = rivianData();
    const { llm, prompts, calls } = fakeLlm([
      (p: string) => {
        assert.match(p, /Layoffs announced and CFO departure/);
        return {
          action: 'final', answer: 'Rivian is red: layoffs and a CFO departure.',
          citations: [{ company_id: 'b_rivian', signal_id: 'r2', source_url: 'https://example.com/rivian/2' }],
        };
      },
    ]);
    const res = await runAgent({ messages: user('give me a summary on Rivian'), llm, data, now: clock, log: () => {} });
    assert.equal(calls(), 1);
    assert.equal(prompts.length, 1);
    assert.equal(res.body.citations?.length, 1);
  });

  test('a pinned company is prefetched when the message names none; two named companies are not', async () => {
    const data = rivianData();
    const pinned = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Any news?'), contextCompanyId: 'b_rivian', llm: pinned.llm, data, now: clock, log: () => {} });
    assert.match(pinned.prompts[0], /Layoffs announced/);
    const both = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Compare Rivian and Northfield Packaging Co.'), llm: both.llm, data, now: clock, log: () => {} });
    assert.match(both.prompts[0], /no tool calls yet/);
  });

  test('no tool results plus exhaustion still gives STEP_LIMIT_REPLY', async () => {
    const { data } = fakeData();
    const { llm } = fakeLlm([{ action: 'tool', tool: 'nope', args: {} }]);
    const res = await runAgent({ messages: user('Loop'), llm, data, now: clock, log: () => {} });
    assert.match(res.body.answer ?? '', /step limit/i);
  });

  test('logs one compact line per step without leaking reply content', async () => {
    const data = rivianData();
    const lines: string[] = [];
    const { llm } = fakeLlm([
      { secret_key: 'top secret customer text' },
      { action: 'tool', tool: 'portfolio_summary', args: {} },
      { action: 'final', answer: 'Done.', citations: [] },
    ]);
    await runAgent({ messages: user('How are we doing?'), llm, data, now: clock, log: (l) => lines.push(l) });
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^askPortfolio step=1 action=malformed tool=- ok=false ms=\d+ type=object keys=secret_key$/);
    assert.match(lines[1], /^askPortfolio step=2 action=tool tool=portfolio_summary ok=true ms=\d+$/);
    assert.match(lines[2], /^askPortfolio step=3 action=final tool=- ok=true ms=\d+$/);
    assert.ok(!lines.join('\n').includes('top secret'));
  });
});

describe('confirmAction', () => {
  function deps(overrides: Record<string, unknown> = {}) {
    const calls: unknown[][] = [];
    return {
      calls,
      deps: {
        createBorrower: async (data: Record<string, unknown>) => { calls.push(['create', data]); return { id: 'b_created', ...data }; },
        getBorrower: async (id: string) => fixture.borrowers.find((b: { id: string }) => b.id === id) ?? null,
        invoke: async (name: string, payload: unknown) => { calls.push(['invoke', name, payload]); return { ok: true }; },
        ...overrides,
      },
    };
  }

  test('rejects invalid actions', () => {
    const bad = [
      null,
      'screen',
      { kind: 'delete', params: { id: 'b_north' } },
      { kind: 'set_status', params: { id: 'b_north', status: 'green' } },
      { kind: 'screen', params: { name: '', website_domain: 'x.example' } },
      { kind: 'screen', params: { name: 'Acme', website_domain: 'not a domain' } },
      { kind: 'screen', params: { name: 'Acme', website_domain: 'acme.example', loan_amount_usd: -5 } },
      { kind: 'refresh', params: { id: '../../etc' } },
      { kind: 'deep_check', params: { id: 'b_north' } },
    ];
    for (const action of bad) {
      assert.equal(validateAction(action).ok, false, JSON.stringify(action));
    }
  });

  test('validateAction strips unknown fields such as status', () => {
    const v = validateAction({ kind: 'screen', params: { name: 'Acme', website_domain: 'acme.example', status: 'red', stage: 'borrower' } });
    assert.equal(v.ok, true);
    assert.equal(v.action.params.status, undefined);
    assert.equal(v.action.params.stage, undefined);
  });

  test('executeAction returns 400 for an invalid action and performs nothing', async () => {
    const { deps: d, calls } = deps();
    const res = await executeAction({ kind: 'set_status', params: { id: 'b_north', status: 'green' } }, d);
    assert.equal(res.status, 400);
    assert.deepEqual(calls, []);
  });

  test('screen creates an applicant then runs refreshBorrower', async () => {
    const { deps: d, calls } = deps();
    const res = await executeAction({ kind: 'screen', params: { name: 'Acme', website_domain: 'acme.example', loan_amount_usd: 100 } }, d);
    assert.equal(res.status, 200);
    assert.deepEqual(calls[0], ['create', {
      name: 'Acme', website_domain: 'acme.example', loan_amount_usd: 100,
      stage: 'applicant', status: 'green', why: '', sources_unavailable: [],
    }]);
    assert.deepEqual(calls[1], ['invoke', 'refreshBorrower', { borrower_id: 'b_created' }]);
  });

  test('screen still reports the created company when the first check fails', async () => {
    const err = Object.assign(new Error('fail'), { response: { status: 503, data: { error: 'No data sources are connected yet.' } } });
    const { deps: d } = deps({ invoke: async () => { throw err; } });
    const res = await executeAction({ kind: 'screen', params: { name: 'Acme', website_domain: 'acme.example' } }, d);
    assert.equal(res.status, 200);
    assert.equal(res.body.borrower.id, 'b_created');
    assert.equal(res.body.refresh.ok, false);
    assert.match(res.body.refresh.error, /No data sources/);
  });

  test('refresh returns 404 for an unknown company', async () => {
    const { deps: d, calls } = deps();
    const res = await executeAction({ kind: 'refresh', params: { id: 'b_missing' } }, d);
    assert.equal(res.status, 404);
    assert.deepEqual(calls, []);
  });

  test('deep_check returns 501 when analyzeBorrower is not deployed', async () => {
    const err = Object.assign(new Error('not found'), { response: { status: 404, data: {} } });
    const { deps: d } = deps({ invoke: async () => { throw err; } });
    const res = await executeAction({ kind: 'deep_check', params: { id: 'b_north', question: 'Covenant risk?' } }, d);
    assert.equal(res.status, 501);
    assert.equal(res.body.error, 'analyst not deployed yet');
  });

  test('deep_check invokes analyzeBorrower when it exists', async () => {
    const { deps: d, calls } = deps();
    const res = await executeAction({ kind: 'deep_check', params: { id: 'b_north', question: 'Covenant risk?' } }, d);
    assert.equal(res.status, 200);
    assert.deepEqual(calls[0], ['invoke', 'analyzeBorrower', { borrower_id: 'b_north', question: 'Covenant risk?' }]);
  });
});
