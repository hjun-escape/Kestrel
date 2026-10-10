import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  classifyLender,
  isLateFeeLine,
  isNsfLine,
} from '../base44/functions/analyzeCashflow/classify.ts';
import {
  normaliseRows,
  parseCsvStatement,
  parseExtractionResult,
} from '../base44/functions/analyzeCashflow/parse.ts';
import {
  analyseLender,
  buildCashflowReview,
  buildFlags,
  buildSummary,
  computeMetrics,
  groupLenderPayments,
  runCashflowAnalysis,
} from '../base44/functions/analyzeCashflow/logic.ts';
import type { Row } from '../base44/functions/analyzeCashflow/parse.ts';
import { formatTimeToFlag, timeToFirstFlag } from '../base44/functions/analyzeCashflow/timeToFlag.ts';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_CSV = readFileSync(join(here, '../public/samples/sample-cashflow.csv'), 'utf8');
const SMALL_CSV = readFileSync(join(here, 'fixtures/cashflow-small.csv'), 'utf8');

function out(date: string, description: string, amount: number, running_balance?: number): Row {
  return { date, description, amount, direction: 'out', ...(running_balance === undefined ? {} : { running_balance }) };
}
function inflow(date: string, description: string, amount: number, running_balance?: number): Row {
  return { date, description, amount, direction: 'in', ...(running_balance === undefined ? {} : { running_balance }) };
}

/** Twelve monthly payments on `day`, with overrides { 'YYYY-MM': day | null (missing) }. */
function monthly(description: string, amount: number, day: number, overrides: Record<string, number | null> = {}): Row[] {
  const rows: Row[] = [];
  for (let m = 0; m < 12; m += 1) {
    const year = 2025 + Math.floor((9 + m) / 12);
    const month = ((9 + m) % 12) + 1;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const d = key in overrides ? overrides[key] : day;
    if (d === null) continue;
    rows.push(out(`${key}-${String(d).padStart(2, '0')}`, description, amount));
  }
  return rows;
}

// ---------- classifier ----------

describe('classifyLender', () => {
  test('recognises known fintech lenders by name with a canonical label', () => {
    assert.equal(classifyLender('ACH DEBIT KABBAGE INC 8812'), 'Kabbage');
    assert.equal(classifyLender('ONDECK CAPITAL PMT 551200'), 'OnDeck');
    assert.equal(classifyLender('On Deck Capital ACH'), 'OnDeck');
    assert.equal(classifyLender('FUNDBOX DEBIT 000123'), 'Fundbox');
    assert.equal(classifyLender('BLUEVINE CAPITAL WEB PMT'), 'Bluevine');
  });

  test('recognises generic lender keywords and strips payment noise and reference numbers', () => {
    assert.equal(classifyLender('ACH DEBIT FIRST HARBOR BANK LOAN PMT 00123'), 'First Harbor Bank Loan');
    assert.equal(classifyLender('SBA EIDL LOAN PAYMENT 7731'), 'SBA EIDL Loan');
    assert.equal(classifyLender('NAVITAS CREDIT CORP LEASE #4471'), 'Navitas Credit Corp Lease');
    assert.equal(classifyLender('Merchant cash advance - Pearl Funding'), 'Merchant Cash Advance Pearl Funding');
  });

  test('groups the same lender across differing reference numbers', () => {
    assert.equal(
      classifyLender('ACH DEBIT FIRST HARBOR BANK LOAN PMT 00123'),
      classifyLender('ACH DEBIT FIRST HARBOR BANK LOAN PMT 00987'),
    );
  });

  test('ignores ordinary vendors, payroll and rent', () => {
    assert.equal(classifyLender('PAYROLL GUSTO 9921'), null);
    assert.equal(classifyLender('RENT HARBOR PROPERTIES'), null);
    assert.equal(classifyLender('SYSCO FOODS INV 4410'), null);
    assert.equal(classifyLender(''), null);
  });

  test('does not treat NSF, overdraft or fee lines as lender payments', () => {
    assert.equal(classifyLender('NSF RETURNED ITEM FEE'), null);
    assert.equal(classifyLender('OVERDRAFT FEE BANK'), null);
    assert.equal(classifyLender('ONDECK LATE FEE'), null);
  });

  test('matches keywords on word boundaries only', () => {
    assert.equal(classifyLender('BANKSIDE CAFE SUPPLIES'), null);
    assert.equal(classifyLender('SALEASE STUDIO'), null);
  });
});

describe('NSF and late-fee lines', () => {
  test('counts NSF, returned and overdraft wording as NSF', () => {
    assert.equal(isNsfLine('NSF RETURNED ITEM FEE'), true);
    assert.equal(isNsfLine('Returned ACH item'), true);
    assert.equal(isNsfLine('OVERDRAFT FEE'), true);
    assert.equal(isNsfLine('Insufficient funds charge'), true);
    assert.equal(isNsfLine('PAYROLL GUSTO'), false);
  });

  test('recognises late fees separately', () => {
    assert.equal(isLateFeeLine('ONDECK LATE FEE'), true);
    assert.equal(isLateFeeLine('Late payment charge'), true);
    assert.equal(isLateFeeLine('NSF RETURNED ITEM FEE'), false);
  });
});

// ---------- parsing ----------

describe('parseCsvStatement', () => {
  test('parses date, description, amount, direction and balance with quoted fields', () => {
    const rows = parseCsvStatement(SMALL_CSV);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0], {
      date: '2026-01-02',
      description: 'DEPOSIT, MERCHANT SETTLEMENT',
      amount: 5000,
      direction: 'in',
      running_balance: 15000,
    });
    assert.equal(rows[1].direction, 'out');
    assert.equal(rows[1].amount, 1200.5);
  });

  test('supports separate debit and credit columns and US dates', () => {
    const csv = 'Posted,Memo,Debit,Credit,Balance\n01/05/2026,KABBAGE INC,"1,950.00",,8000\n01/06/2026,DEPOSIT,,"2,000.00",10000\n';
    const rows = parseCsvStatement(csv);
    assert.deepEqual(rows.map((r) => [r.date, r.direction, r.amount]), [
      ['2026-01-05', 'out', 1950],
      ['2026-01-06', 'in', 2000],
    ]);
  });

  test('returns no rows when the header has no date or amount column', () => {
    assert.deepEqual(parseCsvStatement('foo,bar\n1,2\n'), []);
    assert.deepEqual(parseCsvStatement(''), []);
  });
});

describe('normaliseRows', () => {
  test('keeps valid rows, infers direction from sign and drops junk', () => {
    const rows = normaliseRows([
      { date: '2026-02-01', description: 'X', amount: -50 },
      { date: '2026-02-02', description: 'Y', amount: '1,000.00', direction: 'in' },
      { date: 'not a date', description: 'Z', amount: 5 },
      { date: '2026-02-03', description: '', amount: 5 },
      null,
    ]);
    assert.deepEqual(rows, [
      { date: '2026-02-01', description: 'X', amount: 50, direction: 'out' },
      { date: '2026-02-02', description: 'Y', amount: 1000, direction: 'in' },
    ]);
  });

  test('sorts rows by date', () => {
    const rows = normaliseRows([
      { date: '2026-03-02', description: 'B', amount: 1, direction: 'out' },
      { date: '2026-03-01', description: 'A', amount: 1, direction: 'out' },
    ]);
    assert.deepEqual(rows.map((r) => r.description), ['A', 'B']);
  });
});

describe('parseExtractionResult', () => {
  test('reads Base44 { status, output } envelopes and bare objects', () => {
    const tx = [{ date: '2026-01-01', description: 'A', amount: 1, direction: 'in' }];
    assert.equal(parseExtractionResult({ status: 'success', output: { transactions: tx } }).length, 1);
    assert.equal(parseExtractionResult({ transactions: tx }).length, 1);
    assert.equal(parseExtractionResult(JSON.stringify({ transactions: tx })).length, 1);
  });

  test('returns no rows for error envelopes', () => {
    assert.deepEqual(parseExtractionResult({ status: 'error', details: 'bad file' }), []);
    assert.deepEqual(parseExtractionResult(null), []);
  });
});

// ---------- lender grouping and late/missed detection ----------

describe('groupLenderPayments', () => {
  test('groups outgoing recurring lender payments by normalised name', () => {
    const rows = [
      ...monthly('KABBAGE INC 1', 1950, 15).slice(0, 3),
      inflow('2025-10-03', 'KABBAGE LOAN PROCEEDS', 50000),
      out('2025-10-20', 'CAPITAL ONE CARD PMT', 300),
      out('2025-10-21', 'PAYROLL GUSTO', 9000),
    ];
    const groups = groupLenderPayments(rows);
    assert.deepEqual(groups.map((g) => [g.name, g.rows.length]), [['Kabbage', 3]]);
  });
});

describe('analyseLender', () => {
  test('an on-time monthly lender has no late or missed payments', () => {
    const s = analyseLender('Bluevine', monthly('BLUEVINE', 2750, 10));
    assert.equal(s.payments, 12);
    assert.equal(s.typical_amount, 2750);
    assert.equal(s.typical_day, 10);
    assert.equal(s.cadence, 'monthly');
    assert.equal(s.late_count, 0);
    assert.equal(s.missed_count, 0);
    assert.equal(s.evidence.length, 12);
  });

  test('a payment 5 or more days after the usual day is late; 4 days is not', () => {
    const s = analyseLender('Bluevine', monthly('BLUEVINE', 2750, 10, { '2026-02': 15, '2026-03': 14 }));
    assert.equal(s.late_count, 1);
    const late = s.evidence.filter((e) => e.days_late !== undefined);
    assert.deepEqual(late.map((e) => [e.date, e.days_late]), [['2026-02-15', 5]]);
  });

  test('a late payment that slips into the next month is late, not missed', () => {
    // January's 28th payment arrives Feb 3 (6 days late); February's arrives on the 28th as usual.
    const rows = monthly('FIRST HARBOR BANK', 3850, 28, { '2026-01': null });
    rows.push(out('2026-02-03', 'FIRST HARBOR BANK', 3850));
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const s = analyseLender('First Harbor Bank', rows);
    assert.equal(s.payments, 12);
    assert.equal(s.late_count, 1);
    assert.equal(s.missed_count, 0);
    assert.deepEqual(s.evidence.filter((e) => e.days_late).map((e) => [e.date, e.days_late]), [['2026-02-03', 6]]);
  });

  test('a month with no payment between the first and last payment is missed', () => {
    const s = analyseLender('Kabbage', monthly('KABBAGE', 1950, 15, { '2026-03': null, '2026-04': null }));
    assert.equal(s.missed_count, 2);
    assert.deepEqual(s.missed_months, ['2026-03', '2026-04']);
    assert.equal(s.late_count, 0);
  });

  test('early payments around a month boundary are not late', () => {
    const rows = monthly('SBA EIDL', 731, 1, { '2026-01': null });
    rows.push(out('2025-12-30', 'SBA EIDL', 731));
    const s = analyseLender('Sba Eidl', rows.sort((a, b) => a.date.localeCompare(b.date)));
    assert.equal(s.late_count, 0);
    assert.equal(s.missed_count, 0);
  });

  test('non-monthly cadences are not scored for late or missed payments', () => {
    const rows = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-02-09'].map((d) => out(d, 'ONDECK', 400));
    const s = analyseLender('OnDeck', rows);
    assert.equal(s.cadence, 'weekly');
    assert.equal(s.late_count, 0);
    assert.equal(s.missed_count, 0);
  });
});

// ---------- metrics, flags, summary ----------

describe('computeMetrics', () => {
  const rows = [
    inflow('2026-01-02', 'DEPOSIT', 10000, 20000),
    out('2026-01-10', 'KABBAGE', 2000, 18000),
    out('2026-01-20', 'PAYROLL', 5000, 13000),
    inflow('2026-02-02', 'DEPOSIT', 6000, 19000),
    out('2026-02-10', 'KABBAGE', 2000, 17000),
    out('2026-02-20', 'PAYROLL', 7000, 10000),
    out('2026-02-21', 'NSF RETURNED ITEM FEE', 36, 9964),
  ];
  const lenderRows = rows.filter((r) => r.description === 'KABBAGE');

  test('computes debt service, ratio, negative months and lowest balance', () => {
    const m = computeMetrics(rows, lenderRows);
    assert.equal(m.period_start, '2026-01-02');
    assert.equal(m.period_end, '2026-02-21');
    assert.equal(m.months, 2);
    assert.equal(m.monthly_inflows, 8000);
    assert.equal(m.monthly_debt_service, 2000);
    assert.equal(m.debt_service_ratio, 0.25);
    assert.equal(m.negative_months, 1);
    assert.deepEqual(m.negative_month_keys, ['2026-02']);
    assert.equal(m.lowest_balance, 9964);
    assert.equal(m.nsf_count, 1);
    assert.equal(m.late_fee_count, 0);
  });

  test('ratio and lowest balance are null when there is nothing to divide or no balance column', () => {
    const m = computeMetrics([out('2026-01-01', 'KABBAGE', 100)], [out('2026-01-01', 'KABBAGE', 100)]);
    assert.equal(m.debt_service_ratio, null);
    assert.equal(m.lowest_balance, null);
  });
});

function stats(overrides: Partial<Parameters<typeof buildFlags>[0]> = {}) {
  return {
    lender_count: 1,
    late_count: 0,
    late_lender_count: 0,
    missed_count: 0,
    nsf_count: 0,
    late_fee_count: 0,
    debt_service_ratio: 0.1,
    negative_months: 0,
    ...overrides,
  };
}

describe('buildFlags', () => {
  test('a clean statement has no flags', () => {
    assert.deepEqual(buildFlags(stats()), []);
  });

  test('four or more lenders is strong; three is weak', () => {
    assert.equal(buildFlags(stats({ lender_count: 4 }))[0].severity, 'strong');
    assert.equal(buildFlags(stats({ lender_count: 3 }))[0].severity, 'weak');
  });

  test('any late or missed payment is strong', () => {
    assert.deepEqual(buildFlags(stats({ late_count: 1, late_lender_count: 1 })).map((f) => f.severity), ['strong']);
    assert.deepEqual(buildFlags(stats({ missed_count: 1 })).map((f) => f.severity), ['strong']);
  });

  test('two NSF items is strong; one is weak', () => {
    assert.equal(buildFlags(stats({ nsf_count: 2 }))[0].severity, 'strong');
    assert.equal(buildFlags(stats({ nsf_count: 1 }))[0].severity, 'weak');
  });

  test('debt service at 35% of inflows is strong', () => {
    assert.equal(buildFlags(stats({ debt_service_ratio: 0.35 }))[0].severity, 'strong');
    assert.deepEqual(buildFlags(stats({ debt_service_ratio: 0.349 })), []);
  });

  test('a negative month is weak; strong flags are listed first', () => {
    const flags = buildFlags(stats({ negative_months: 2, nsf_count: 2 }));
    assert.deepEqual(flags.map((f) => f.severity), ['strong', 'weak']);
    assert.match(flags[1].text, /2 months/);
  });
});

describe('buildSummary', () => {
  test('reads like a credit officer note', () => {
    const text = buildSummary(stats({ lender_count: 6, late_count: 3, late_lender_count: 2, debt_service_ratio: 0.41 }));
    assert.equal(text, '6 lenders paid from this account; 3 late payments to 2 lenders; debt service is 41% of inflows.');
  });

  test('handles singular wording, missed payments and NSF items', () => {
    const text = buildSummary(stats({ lender_count: 1, late_count: 1, late_lender_count: 1, missed_count: 2, nsf_count: 1, debt_service_ratio: 0.1 }));
    assert.equal(text, '1 lender paid from this account; 1 late payment to 1 lender; 2 missed payments; 1 NSF or returned item; debt service is 10% of inflows.');
  });

  test('says so when no lender payments are found', () => {
    assert.equal(buildSummary(stats({ lender_count: 0, debt_service_ratio: 0 })), 'No recurring lender payments found in this statement.');
  });
});

// ---------- end to end through the pure pipeline ----------

describe('sample statement end to end', () => {
  const rows = parseCsvStatement(SAMPLE_CSV);
  const review = buildCashflowReview({
    borrowerId: 'b1',
    fileUrl: 'https://files.example/sample-cashflow.csv',
    rows,
    now: () => new Date('2026-10-10T12:00:00Z'),
  });

  test('covers twelve months', () => {
    assert.equal(review.period_start.slice(0, 7), '2025-10');
    assert.equal(review.period_end.slice(0, 7), '2026-09');
  });

  test('finds 6 lenders, 3 late payments across 2 lenders, 2 NSF items and no missed payments', () => {
    assert.equal(review.lender_count, 6);
    const late = review.lenders.reduce((n, l) => n + l.late_count, 0);
    assert.equal(late, 3);
    assert.equal(review.lenders.filter((l) => l.late_count > 0).length, 2);
    assert.equal(review.lenders.reduce((n, l) => n + l.missed_count, 0), 0);
    assert.equal(review.nsf_count, 2);
  });

  test('every evidence row is an actual statement line', () => {
    const keys = new Set(rows.map((r) => `${r.date}|${r.description}|${r.amount}`));
    for (const lender of review.lenders) {
      assert.ok(lender.evidence.length > 0);
      for (const e of lender.evidence) assert.ok(keys.has(`${e.date}|${e.description}|${e.amount}`), e.description);
    }
    for (const e of review.exceptions) assert.ok(keys.has(`${e.date}|${e.description}|${e.amount}`));
  });

  test('produces strong flags and a code-written summary', () => {
    assert.ok(review.flags.some((f) => f.severity === 'strong'));
    assert.match(review.summary, /^6 lenders paid from this account; 3 late payments to 2 lenders; /);
    assert.ok(review.debt_service_ratio !== null && review.debt_service_ratio >= 0.35);
    assert.ok(review.negative_months >= 1);
    assert.equal(typeof review.lowest_balance, 'number');
    assert.equal(review.borrower_id, 'b1');
    assert.equal(review.created_at, '2026-10-10T12:00:00.000Z');
  });

  test('never sets borrower status', () => {
    assert.equal('status' in review, false);
  });
});

// ---------- runCashflowAnalysis with injected integrations ----------

describe('runCashflowAnalysis', () => {
  const base = {
    borrowerId: 'b1',
    now: () => new Date('2026-10-10T12:00:00Z'),
  };

  test('parses CSV files in code without calling the extraction integration', async () => {
    let extractCalls = 0;
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: 'https://files.example/u/abc_statement.csv',
      fetchText: async () => SAMPLE_CSV,
      extract: async () => { extractCalls += 1; return {}; },
      invokeLLM: async () => ({}),
    });
    assert.equal(result.ok, true);
    assert.equal(extractCalls, 0);
    if (result.ok) {
      assert.equal(result.review.lender_count, 6);
      assert.equal(result.review.extraction_method, 'csv');
    }
  });

  test('uses the extraction integration for PDFs', async () => {
    const tx = rowsAsExtraction(parseCsvStatement(SAMPLE_CSV));
    let schemaSeen: unknown = null;
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: 'https://files.example/u/statement.pdf',
      fetchText: async () => { throw new Error('should not fetch'); },
      extract: async (p) => { schemaSeen = p.json_schema; return { status: 'success', output: { transactions: tx } }; },
      invokeLLM: async () => { throw new Error('should not call LLM'); },
    });
    assert.equal(result.ok, true);
    assert.ok(schemaSeen);
    if (result.ok) assert.equal(result.review.extraction_method, 'extract');
  });

  test('falls back to InvokeLLM with file_urls when extraction fails', async () => {
    const tx = rowsAsExtraction(parseCsvStatement(SAMPLE_CSV));
    let fileUrls: string[] | undefined;
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: 'https://files.example/u/statement.png',
      fetchText: async () => '',
      extract: async () => ({ status: 'error', details: 'unsupported' }),
      invokeLLM: async (p) => { fileUrls = p.file_urls; return { transactions: tx }; },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(fileUrls, ['https://files.example/u/statement.png']);
    if (result.ok) assert.equal(result.review.extraction_method, 'llm');
  });

  test('returns extraction_failed when every path fails', async () => {
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: 'https://files.example/u/statement.pdf',
      fetchText: async () => '',
      extract: async () => { throw new Error('boom'); },
      invokeLLM: async () => { throw new Error('down'); },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'extraction_failed');
      assert.match(result.error, /could not read any transactions/i);
    }
  });

  test('rejects non-http file URLs', async () => {
    const result = await runCashflowAnalysis({
      ...base,
      fileUrl: 'file:///etc/passwd',
      fetchText: async () => '',
      extract: async () => ({}),
      invokeLLM: async () => ({}),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'bad_request');
  });
});

function rowsAsExtraction(rows: Row[]) {
  return rows.map((r) => ({ ...r }));
}

// ---------- time to flag ----------

describe('timeToFirstFlag', () => {
  const borrower = { created_date: '2026-10-10T09:00:00.000Z' };

  test('minutes from application to the earliest strong signal or strong cash-flow flag', () => {
    const signals = [
      { severity: 'weak', created_date: '2026-10-10T09:02:00.000Z' },
      { severity: 'strong', created_date: '2026-10-10T09:30:00.000Z' },
    ];
    const reviews = [{ created_at: '2026-10-10T09:06:00.000Z', flags: [{ severity: 'strong', text: 'x' }] }];
    assert.equal(timeToFirstFlag(borrower, signals, reviews), 6);
  });

  test('ignores reviews with only weak flags', () => {
    const reviews = [{ created_at: '2026-10-10T09:06:00.000Z', flags: [{ severity: 'weak', text: 'x' }] }];
    assert.equal(timeToFirstFlag(borrower, [], reviews), null);
  });

  test('null without a created date or without any strong flag', () => {
    assert.equal(timeToFirstFlag({}, [{ severity: 'strong', created_date: '2026-10-10T09:30:00Z' }], []), null);
    assert.equal(timeToFirstFlag(borrower, [], []), null);
  });

  test('never negative', () => {
    const signals = [{ severity: 'strong', created_date: '2026-10-09T09:00:00.000Z' }];
    assert.equal(timeToFirstFlag(borrower, signals, []), 0);
  });
});

describe('formatTimeToFlag', () => {
  test('formats minutes, hours and days', () => {
    assert.equal(formatTimeToFlag(6), 'Flagged 6 min after application');
    assert.equal(formatTimeToFlag(0), 'Flagged within a minute of application');
    assert.equal(formatTimeToFlag(125), 'Flagged 2 h 5 min after application');
    assert.equal(formatTimeToFlag(60 * 24 * 3 + 5), 'Flagged 3 days after application');
    assert.equal(formatTimeToFlag(null), null);
  });
});
