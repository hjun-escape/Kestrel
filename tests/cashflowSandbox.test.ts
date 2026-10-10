import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ROWS_MARKER,
  createDaytonaRestClient,
  extractRowsInSandbox,
  parseSandboxOutput,
  sandboxFileKind,
} from '../base44/functions/analyzeCashflow/sandbox.ts';
import type { DaytonaClient } from '../base44/functions/analyzeCashflow/sandbox.ts';
import { SANDBOX_PARSER_PY } from '../base44/functions/analyzeCashflow/sandboxParser.py.ts';
import { parseCsvStatement } from '../base44/functions/analyzeCashflow/parse.ts';
import { runCashflowAnalysis } from '../base44/functions/analyzeCashflow/logic.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = readFileSync(join(here, '../public/samples/sample-cashflow.csv'), 'utf8');
const SAMPLE_ROWS = parseCsvStatement(SAMPLE_CSV);
const PDF_URL = 'https://media.base44.com/u/statement.pdf';
const BYTES = new TextEncoder().encode('%PDF-1.4 fake');

function stdoutFor(rows: unknown[]): string {
  return `some pip noise\n${ROWS_MARKER}${JSON.stringify({ rows })}\n`;
}

interface FakeOptions {
  createDelayMs?: number;
  execDelayMs?: number;
  createError?: Error;
  uploadError?: Error;
  exec?: () => { exitCode: number; result: string };
}

function fakeClient(opts: FakeOptions = {}) {
  const calls = { create: 0, upload: [] as string[], exec: [] as string[], remove: [] as string[] };
  const client: DaytonaClient = {
    async create() {
      calls.create += 1;
      if (opts.createDelayMs) await new Promise((r) => setTimeout(r, opts.createDelayMs));
      if (opts.createError) throw opts.createError;
      return { id: 'sb-1' };
    },
    async upload(_id, path) {
      calls.upload.push(path);
      if (opts.uploadError) throw opts.uploadError;
    },
    async exec(_id, command) {
      calls.exec.push(command);
      if (opts.execDelayMs) await new Promise((r) => setTimeout(r, opts.execDelayMs));
      return opts.exec ? opts.exec() : { exitCode: 0, result: stdoutFor(SAMPLE_ROWS) };
    },
    async remove(id) {
      calls.remove.push(id);
    },
  };
  return { client, calls };
}

// ---------- pure helpers ----------

describe('sandboxFileKind', () => {
  test('recognises PDF and Excel statements by extension, ignoring case and query strings', () => {
    assert.equal(sandboxFileKind('https://media.base44.com/u/a.PDF'), 'pdf');
    assert.equal(sandboxFileKind('https://media.base44.com/u/a.xlsx?x=1'), 'xlsx');
    assert.equal(sandboxFileKind('https://media.base44.com/u/a.xls'), 'xls');
  });

  test('returns null for CSV, images and junk', () => {
    assert.equal(sandboxFileKind('https://media.base44.com/u/a.csv'), null);
    assert.equal(sandboxFileKind('https://media.base44.com/u/a.png'), null);
    assert.equal(sandboxFileKind('not a url'), null);
  });
});

describe('parseSandboxOutput', () => {
  test('reads the marker line and validates rows like every other extraction path', () => {
    const out = parseSandboxOutput(
      `noise\n${ROWS_MARKER}${JSON.stringify({
        rows: [
          { date: '2026-01-05', description: 'ACH DEBIT  KABBAGE INC', amount: 1200.5, direction: 'out', running_balance: 100 },
          { date: '01/02/2026', description: 'DEPOSIT', amount: '5,000.00', direction: 'in' },
          { date: 'junk', description: 'x', amount: 1 },
          { date: '2026-01-06', description: '', amount: 1 },
        ],
      })}\n`,
    );
    assert.equal(out.error, null);
    assert.deepEqual(out.rows, [
      { date: '2026-01-02', description: 'DEPOSIT', amount: 5000, direction: 'in' },
      { date: '2026-01-05', description: 'ACH DEBIT KABBAGE INC', amount: 1200.5, direction: 'out', running_balance: 100 },
    ]);
  });

  test('uses the last marker line when the script prints more than one', () => {
    const out = parseSandboxOutput(`${ROWS_MARKER}{"rows":[]}\n${stdoutFor([{ date: '2026-01-02', description: 'A', amount: 1, direction: 'in' }])}`);
    assert.equal(out.rows.length, 1);
  });

  test('reports a script error instead of throwing', () => {
    const out = parseSandboxOutput(`${ROWS_MARKER}{"rows":[],"error":"no table found"}`);
    assert.deepEqual(out, { rows: [], error: 'no table found' });
  });

  test('missing marker or broken JSON gives no rows and an error', () => {
    assert.equal(parseSandboxOutput('Traceback (most recent call last)').rows.length, 0);
    assert.match(parseSandboxOutput('Traceback (most recent call last)').error ?? '', /no parser output/i);
    assert.match(parseSandboxOutput(`${ROWS_MARKER}{oops`).error ?? '', /not valid json/i);
    assert.match(parseSandboxOutput(`${ROWS_MARKER}{"rows":"x"}`).error ?? '', /no rows/i);
    assert.match(parseSandboxOutput(42 as unknown as string).error ?? '', /no parser output/i);
  });
});

describe('SANDBOX_PARSER_PY', () => {
  test('is a fixed script that prints the marker and never reaches the network itself', () => {
    assert.ok(SANDBOX_PARSER_PY.includes(ROWS_MARKER));
    assert.ok(SANDBOX_PARSER_PY.includes('pdfplumber'));
    assert.ok(SANDBOX_PARSER_PY.includes('openpyxl'));
    assert.equal(/requests|urllib|socket/.test(SANDBOX_PARSER_PY), false);
  });
});

// ---------- the sandbox run ----------

describe('extractRowsInSandbox', () => {
  test('creates a sandbox, uploads the parser and the file, runs it and deletes the sandbox', async () => {
    const { client, calls } = fakeClient();
    const res = await extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 5000 });
    assert.equal(res.rows.length, SAMPLE_ROWS.length);
    assert.equal(calls.create, 1);
    assert.deepEqual(calls.upload, ['/tmp/ew/parse_statement.py', '/tmp/ew/statement.pdf']);
    assert.equal(calls.exec.length, 1);
    assert.match(calls.exec[0], /pdfplumber/);
    assert.match(calls.exec[0], /python3 \/tmp\/ew\/parse_statement\.py pdf \/tmp\/ew\/statement\.pdf/);
    assert.deepEqual(calls.remove, ['sb-1']);
    assert.ok(res.timings.total_ms >= 0);
  });

  test('installs openpyxl for xlsx and xlrd for xls', async () => {
    const a = fakeClient();
    await extractRowsInSandbox({ client: a.client, bytes: BYTES, kind: 'xlsx', budgetMs: 5000 });
    assert.match(a.calls.exec[0], /openpyxl/);
    const b = fakeClient();
    await extractRowsInSandbox({ client: b.client, bytes: BYTES, kind: 'xls', budgetMs: 5000 });
    assert.match(b.calls.exec[0], /xlrd/);
    assert.deepEqual(b.calls.upload[1], '/tmp/ew/statement.xls');
  });

  test('deletes the sandbox when upload fails', async () => {
    const { client, calls } = fakeClient({ uploadError: new Error('upload 500') });
    await assert.rejects(extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 5000 }), /upload 500/);
    assert.deepEqual(calls.remove, ['sb-1']);
  });

  test('fails on a non-zero exit code and still deletes', async () => {
    const { client, calls } = fakeClient({ exec: () => ({ exitCode: 1, result: 'Traceback: boom' }) });
    await assert.rejects(extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 5000 }), /exit code 1/);
    assert.deepEqual(calls.remove, ['sb-1']);
  });

  test('fails when the script reports an error', async () => {
    const { client, calls } = fakeClient({ exec: () => ({ exitCode: 0, result: `${ROWS_MARKER}{"rows":[],"error":"encrypted pdf"}` }) });
    await assert.rejects(extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 5000 }), /encrypted pdf/);
    assert.deepEqual(calls.remove, ['sb-1']);
  });

  test('times out within the budget and still deletes the sandbox', async () => {
    const { client, calls } = fakeClient({ execDelayMs: 300 });
    const started = Date.now();
    await assert.rejects(extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 50 }), /timed out/);
    assert.ok(Date.now() - started < 250);
    assert.deepEqual(calls.remove, ['sb-1']);
  });

  test('a sandbox created after the deadline is deleted when it arrives', async () => {
    const { client, calls } = fakeClient({ createDelayMs: 100 });
    await assert.rejects(extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 20 }), /timed out/);
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(calls.remove, ['sb-1']);
  });

  test('does not try to delete when create itself fails', async () => {
    const { client, calls } = fakeClient({ createError: new Error('quota exceeded') });
    await assert.rejects(extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 5000 }), /quota exceeded/);
    assert.deepEqual(calls.remove, []);
  });

  test('a failing delete does not hide the result', async () => {
    const { client } = fakeClient();
    client.remove = async () => { throw new Error('delete 500'); };
    const res = await extractRowsInSandbox({ client, bytes: BYTES, kind: 'pdf', budgetMs: 5000 });
    assert.equal(res.rows.length, SAMPLE_ROWS.length);
  });

  test('rejects files over 5 MB without creating a sandbox', async () => {
    const { client, calls } = fakeClient();
    await assert.rejects(
      extractRowsInSandbox({ client, bytes: new Uint8Array(5_000_001), kind: 'pdf', budgetMs: 5000 }),
      /too large/,
    );
    assert.equal(calls.create, 0);
  });
});

// ---------- REST client against a fake fetch ----------

describe('createDaytonaRestClient', () => {
  function fakeFetch(states: string[] = ['creating', 'started']) {
    const seen: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
    let polls = 0;
    const impl = async (url: string, init: RequestInit = {}) => {
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      seen.push({ method: init.method ?? 'GET', url, headers, body: init.body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/sandbox') && init.method === 'POST') {
        return json({ id: 'sb-9', state: states[0], toolboxProxyUrl: 'https://proxy.example/toolbox' });
      }
      if (url.endsWith('/sandbox/sb-9') && (init.method ?? 'GET') === 'GET') {
        polls += 1;
        return json({ id: 'sb-9', state: states[Math.min(polls, states.length - 1)], errorReason: 'bad image', toolboxProxyUrl: 'https://proxy.example/toolbox' });
      }
      if (url.includes('/files/upload-v2')) return json({ path: '/tmp/x' });
      if (url.endsWith('/process/execute')) return json({ exitCode: 0, result: 'hi' });
      if (url.endsWith('/sandbox/sb-9') && init.method === 'DELETE') return json({});
      return json({ message: 'nope' }, 404);
    };
    return { impl: impl as unknown as typeof fetch, seen };
  }

  test('uses the documented REST endpoints with a bearer key', async () => {
    const { impl, seen } = fakeFetch();
    const client = createDaytonaRestClient({ apiKey: 'k1', fetchImpl: impl, pollMs: 1 });
    const sb = await client.create();
    await client.upload(sb.id, '/tmp/ew/a.pdf', BYTES);
    const run = await client.exec(sb.id, 'echo hi', 30);
    await client.remove(sb.id);

    assert.deepEqual(run, { exitCode: 0, result: 'hi' });
    const create = seen[0];
    assert.equal(create.url, 'https://app.daytona.io/api/sandbox');
    assert.equal(create.headers.authorization, 'Bearer k1');
    const body = JSON.parse(String(create.body));
    assert.equal(body.autoDeleteInterval, 0);
    assert.ok(body.autoStopInterval > 0 && body.autoStopInterval <= 5);
    assert.ok(seen.some((s) => s.url === 'https://proxy.example/toolbox/sb-9/files/upload-v2?path=%2Ftmp%2Few%2Fa.pdf' && s.method === 'POST'));
    const exec = seen.find((s) => s.url === 'https://proxy.example/toolbox/sb-9/process/execute');
    assert.deepEqual(JSON.parse(String(exec?.body)), { command: 'echo hi', timeout: 30 });
    assert.ok(seen.some((s) => s.url === 'https://app.daytona.io/api/sandbox/sb-9' && s.method === 'DELETE'));
  });

  test('throws with the reason when the sandbox ends in an error state', async () => {
    const { impl } = fakeFetch(['creating', 'error']);
    const client = createDaytonaRestClient({ apiKey: 'k1', fetchImpl: impl, pollMs: 1 });
    await assert.rejects(client.create(), /error.*bad image/);
  });

  test('includes the HTTP status when an API call fails', async () => {
    const impl = (async () => new Response('{"message":"Unauthorized"}', { status: 401 })) as unknown as typeof fetch;
    const client = createDaytonaRestClient({ apiKey: 'bad', fetchImpl: impl, pollMs: 1 });
    await assert.rejects(client.create(), /401/);
  });
});

// ---------- fallback orchestration in runCashflowAnalysis ----------

describe('runCashflowAnalysis with the Daytona sandbox', () => {
  const extraction = { status: 'success', output: { transactions: SAMPLE_ROWS.map((r) => ({ ...r })) } };
  const base = {
    borrowerId: 'b1',
    now: () => new Date('2026-10-10T12:00:00Z'),
    fetchText: async () => { throw new Error('should not fetch text'); },
    fetchBytes: async () => BYTES,
    sandboxBudgetMs: 5000,
  };

  test('PDFs are parsed in the sandbox first and the extraction integration is not called', async () => {
    const { client, calls } = fakeClient();
    let extractCalls = 0;
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: PDF_URL,
      daytona: client,
      extract: async () => { extractCalls += 1; return extraction; },
      invokeLLM: async () => { throw new Error('no llm'); },
    });
    assert.equal(result.ok, true);
    assert.equal(extractCalls, 0);
    assert.deepEqual(calls.remove, ['sb-1']);
    if (result.ok) {
      assert.equal(result.review.extraction_method, 'sandbox');
      assert.equal(result.review.lender_count, 6);
      assert.match(result.review.summary, /^6 lenders paid from this account; 3 late payments to 2 lenders; /);
      assert.match(result.attempts[0], /^sandbox: 278 rows/);
    }
  });

  test('falls back to Base44 extraction when the sandbox errors', async () => {
    const { client, calls } = fakeClient({ exec: () => ({ exitCode: 1, result: 'boom' }) });
    const result = await runCashflowAnalysis({ ...base, fileUrl: PDF_URL, daytona: client, extract: async () => extraction, invokeLLM: async () => ({}) });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.remove, ['sb-1']);
    if (result.ok) {
      assert.equal(result.review.extraction_method, 'extract');
      assert.match(result.attempts[0], /^sandbox failed: /);
    }
  });

  test('falls back when the sandbox times out', async () => {
    const { client, calls } = fakeClient({ execDelayMs: 300 });
    const result = await runCashflowAnalysis({ ...base, sandboxBudgetMs: 30, fileUrl: PDF_URL, daytona: client, extract: async () => extraction, invokeLLM: async () => ({}) });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.remove, ['sb-1']);
    if (result.ok) {
      assert.equal(result.review.extraction_method, 'extract');
      assert.match(result.attempts[0], /timed out/);
    }
  });

  test('falls back when the sandbox finds zero rows', async () => {
    const { client } = fakeClient({ exec: () => ({ exitCode: 0, result: stdoutFor([]) }) });
    const result = await runCashflowAnalysis({ ...base, fileUrl: PDF_URL, daytona: client, extract: async () => extraction, invokeLLM: async () => ({}) });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.review.extraction_method, 'extract');
      assert.match(result.attempts[0], /^sandbox: 0 rows/);
    }
  });

  test('skips the sandbox when no Daytona key is configured', async () => {
    const result = await runCashflowAnalysis({ ...base, fileUrl: PDF_URL, daytona: null, extract: async () => extraction, invokeLLM: async () => ({}) });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.review.extraction_method, 'extract');
      assert.match(result.attempts[0], /sandbox skipped: DAYTONA_API_KEY/);
    }
  });

  test('falls back when the file download fails, without creating a sandbox', async () => {
    const { client, calls } = fakeClient();
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: PDF_URL,
      fetchBytes: async () => { throw new Error('HTTP 403'); },
      daytona: client,
      extract: async () => extraction,
      invokeLLM: async () => ({}),
    });
    assert.equal(result.ok, true);
    assert.equal(calls.create, 0);
    if (result.ok) assert.equal(result.review.extraction_method, 'extract');
  });

  test('CSV files never use the sandbox', async () => {
    const { client, calls } = fakeClient();
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: 'https://media.base44.com/u/a.csv',
      fetchText: async () => SAMPLE_CSV,
      daytona: client,
      extract: async () => extraction,
      invokeLLM: async () => ({}),
    });
    assert.equal(result.ok, true);
    assert.equal(calls.create, 0);
    if (result.ok) assert.equal(result.review.extraction_method, 'csv');
  });

  test('images skip the sandbox and go straight to extraction', async () => {
    const { client, calls } = fakeClient();
    const result = await runCashflowAnalysis({ ...base, fileUrl: 'https://media.base44.com/u/a.png', daytona: client, extract: async () => extraction, invokeLLM: async () => ({}) });
    assert.equal(result.ok, true);
    assert.equal(calls.create, 0);
  });
});
