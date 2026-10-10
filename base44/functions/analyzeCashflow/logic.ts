// Pure logic for analyzeCashflow: the cash-flow document check.
// No npm: imports and no Deno globals, so it runs under Node's test runner.
// The Deno handler (entry.ts) injects file fetching, Base44 extraction and the LLM.
//
// Extraction may use a model, but everything after it is plain code: which lines are
// lender payments, what is late or missed, the metrics, the flags and the summary.
// Evidence rows are always copies of extracted statement lines.
// It never sets Borrower.status and never writes Signal records.

import { normaliseUrl, withTimeout } from '../analyzeBorrower/logic.ts';
import { classifyLender, isLateFeeLine, isNsfLine } from './classify.ts';
import { TRANSACTIONS_SCHEMA, parseCsvStatement, parseExtractionResult } from './parse.ts';
import type { Row } from './parse.ts';

export { classifyLender, isLateFeeLine, isNsfLine, TRANSACTIONS_SCHEMA, parseCsvStatement, parseExtractionResult };
export type { Row };

// ---------- rules ----------

/** A payment this many days or more after the lender's usual day is late. */
export const LATE_DAYS = 5;
/** A payment up to this many days before a due date counts toward that due date. */
const EARLY_WINDOW_DAYS = 10;
/** A lender needs at least this many outgoing payments to count as recurring. */
export const MIN_RECURRING = 2;
export const STRONG_LENDER_COUNT = 4;
export const WEAK_LENDER_COUNT = 3;
export const STRONG_NSF_COUNT = 2;
export const STRONG_DEBT_SERVICE_RATIO = 0.35;
const MAX_EVIDENCE_PER_LENDER = 60;
const MAX_EXCEPTIONS = 50;
const STEP_TIMEOUT_MS = 60_000;

const DAY_MS = 86_400_000;

export type Cadence = 'monthly' | 'weekly' | 'biweekly' | 'daily' | 'irregular';
export type Severity = 'strong' | 'weak';
export type ExtractionMethod = 'csv' | 'extract' | 'llm';

export interface Evidence {
  date: string;
  description: string;
  amount: number;
  days_late?: number;
}

export interface LenderSummary {
  name: string;
  payments: number;
  typical_amount: number;
  typical_day: number;
  cadence: Cadence;
  late_count: number;
  missed_count: number;
  missed_months: string[];
  evidence: Evidence[];
}

export interface ExceptionLine {
  date: string;
  description: string;
  amount: number;
  kind: 'nsf' | 'late_fee';
}

export interface Flag {
  severity: Severity;
  text: string;
}

export interface Metrics {
  period_start: string;
  period_end: string;
  months: number;
  monthly_inflows: number;
  monthly_debt_service: number;
  debt_service_ratio: number | null;
  negative_months: number;
  negative_month_keys: string[];
  lowest_balance: number | null;
  nsf_count: number;
  late_fee_count: number;
}

export interface FlagStats {
  lender_count: number;
  late_count: number;
  late_lender_count: number;
  missed_count: number;
  nsf_count: number;
  late_fee_count: number;
  debt_service_ratio: number | null;
  negative_months: number;
}

export interface CashflowReviewRecord {
  borrower_id: string;
  created_at: string;
  file_url: string;
  extraction_method: ExtractionMethod;
  transaction_count: number;
  period_start: string;
  period_end: string;
  lender_count: number;
  lenders: LenderSummary[];
  nsf_count: number;
  late_fee_count: number;
  monthly_inflows: number;
  monthly_debt_service: number;
  debt_service_ratio: number | null;
  negative_months: number;
  negative_month_keys: string[];
  lowest_balance: number | null;
  exceptions: ExceptionLine[];
  flags: Flag[];
  summary: string;
}

// ---------- date helpers (UTC, YYYY-MM-DD) ----------

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Month index (year*12 + month0) <-> 'YYYY-MM'. */
function monthIndex(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return y * 12 + (m - 1);
}

function keyFromIndex(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Most common value; ties go to the smallest. */
function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v < best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- lenders ----------

export function cadenceOf(dates: string[]): Cadence {
  if (dates.length < 2) return 'irregular';
  const gaps = dates.slice(1).map((d, i) => (toUtc(d) - toUtc(dates[i])) / DAY_MS);
  const gap = median(gaps);
  if (gap <= 3) return 'daily';
  if (gap <= 10) return 'weekly';
  if (gap < 20) return 'biweekly';
  if (gap <= 40) return 'monthly';
  return 'irregular';
}

/** The due date a payment settles: the nearest usual-day date it is not more than 10 days early for. */
function assignDue(date: string, usualDay: number): { dueMonth: string; daysLate: number } {
  const [y, m] = date.split('-').map(Number);
  const paid = toUtc(date);
  let best: { dueMonth: string; daysLate: number } | null = null;
  for (const offset of [-1, 0, 1]) {
    const index = y * 12 + (m - 1) + offset;
    const dy = Math.floor(index / 12);
    const dm = (index % 12) + 1;
    const due = Date.UTC(dy, dm - 1, Math.min(usualDay, daysInMonth(dy, dm)));
    const daysLate = Math.round((paid - due) / DAY_MS);
    if (daysLate < -EARLY_WINDOW_DAYS) continue;
    if (!best || daysLate < best.daysLate) best = { dueMonth: keyFromIndex(index), daysLate };
  }
  return best ?? { dueMonth: monthKey(date), daysLate: 0 };
}

/** Payment pattern for one lender: typical amount/day, late payments and missed months. */
export function analyseLender(name: string, rows: Row[]): LenderSummary {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((r) => r.date);
  const cadence = cadenceOf(dates);
  const typicalDay = mode(sorted.map((r) => Number(r.date.slice(8, 10))));
  const base = {
    name,
    payments: sorted.length,
    typical_amount: round2(median(sorted.map((r) => r.amount))),
    typical_day: typicalDay,
    cadence,
  };
  const plainEvidence = (r: Row): Evidence => ({ date: r.date, description: r.description, amount: r.amount });

  if (cadence !== 'monthly') {
    return {
      ...base,
      late_count: 0,
      missed_count: 0,
      missed_months: [],
      evidence: sorted.slice(0, MAX_EVIDENCE_PER_LENDER).map(plainEvidence),
    };
  }

  const assigned = sorted.map((r) => ({ row: r, ...assignDue(r.date, typicalDay) }));
  const evidence = assigned.map(({ row, daysLate }) =>
    daysLate >= LATE_DAYS ? { ...plainEvidence(row), days_late: daysLate } : plainEvidence(row),
  );
  const covered = new Set(assigned.map((a) => a.dueMonth));
  const indexes = [...covered].map(monthIndex);
  const missedMonths: string[] = [];
  for (let i = Math.min(...indexes); i <= Math.max(...indexes); i += 1) {
    const key = keyFromIndex(i);
    if (!covered.has(key)) missedMonths.push(key);
  }
  return {
    ...base,
    late_count: evidence.filter((e) => e.days_late !== undefined).length,
    missed_count: missedMonths.length,
    missed_months: missedMonths,
    evidence: evidence.slice(0, MAX_EVIDENCE_PER_LENDER),
  };
}

/** Outgoing lender payments grouped by normalised lender name; only recurring lenders kept. */
export function groupLenderPayments(rows: Row[]): { name: string; rows: Row[] }[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    if (row.direction !== 'out') continue;
    const name = classifyLender(row.description);
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= MIN_RECURRING)
    .map(([name, list]) => ({ name, rows: list }))
    .sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

// ---------- metrics ----------

export function computeMetrics(rows: Row[], lenderRows: Row[]): Metrics {
  const dates = rows.map((r) => r.date).sort();
  const periodStart = dates[0] ?? '';
  const periodEnd = dates[dates.length - 1] ?? '';
  const months = periodStart ? monthIndex(monthKey(periodEnd)) - monthIndex(monthKey(periodStart)) + 1 : 0;

  const net = new Map<string, number>();
  let totalIn = 0;
  for (const r of rows) {
    const signed = r.direction === 'in' ? r.amount : -r.amount;
    if (r.direction === 'in') totalIn += r.amount;
    net.set(monthKey(r.date), (net.get(monthKey(r.date)) ?? 0) + signed);
  }
  const negativeKeys = [...net.entries()]
    .filter(([, v]) => v < -0.005)
    .map(([k]) => k)
    .sort();
  const debt = lenderRows.reduce((sum, r) => sum + r.amount, 0);
  const balances = rows.map((r) => r.running_balance).filter((b): b is number => typeof b === 'number');

  return {
    period_start: periodStart,
    period_end: periodEnd,
    months,
    monthly_inflows: months ? round2(totalIn / months) : 0,
    monthly_debt_service: months ? round2(debt / months) : 0,
    debt_service_ratio: totalIn > 0 ? Math.round((debt / totalIn) * 1000) / 1000 : null,
    negative_months: negativeKeys.length,
    negative_month_keys: negativeKeys,
    lowest_balance: balances.length ? Math.min(...balances) : null,
    nsf_count: rows.filter((r) => isNsfLine(r.description)).length,
    late_fee_count: rows.filter((r) => isLateFeeLine(r.description)).length,
  };
}

// ---------- flags and summary (fixed rules) ----------

function pct(ratio: number): number {
  return Math.round(ratio * 100);
}

export function buildFlags(s: FlagStats): Flag[] {
  const strong: string[] = [];
  const weak: string[] = [];
  if (s.lender_count >= STRONG_LENDER_COUNT) strong.push(`${s.lender_count} different lenders are paid from this account`);
  else if (s.lender_count === WEAK_LENDER_COUNT) weak.push(`${s.lender_count} different lenders are paid from this account`);
  if (s.late_count > 0) {
    strong.push(
      `${plural(s.late_count, 'late payment')} to ${plural(s.late_lender_count, 'lender')} (${LATE_DAYS}+ days after the usual date)`,
    );
  }
  if (s.missed_count > 0) strong.push(`${plural(s.missed_count, 'monthly lender payment')} missing`);
  if (s.nsf_count >= STRONG_NSF_COUNT) strong.push(`${s.nsf_count} NSF, returned or overdraft items`);
  else if (s.nsf_count === 1) weak.push('1 NSF, returned or overdraft item');
  if (s.debt_service_ratio !== null && s.debt_service_ratio >= STRONG_DEBT_SERVICE_RATIO) {
    strong.push(`Debt service is ${pct(s.debt_service_ratio)}% of inflows (limit ${pct(STRONG_DEBT_SERVICE_RATIO)}%)`);
  }
  if (s.late_fee_count > 0) weak.push(`${plural(s.late_fee_count, 'late fee')} charged`);
  if (s.negative_months > 0) weak.push(`Cash flow was negative in ${plural(s.negative_months, 'month')}`);
  return [
    ...strong.map((text) => ({ severity: 'strong' as const, text })),
    ...weak.map((text) => ({ severity: 'weak' as const, text })),
  ];
}

export function buildSummary(s: FlagStats): string {
  const parts: string[] = [
    s.lender_count > 0
      ? `${plural(s.lender_count, 'lender')} paid from this account`
      : 'No recurring lender payments found in this statement',
  ];
  if (s.late_count > 0) parts.push(`${plural(s.late_count, 'late payment')} to ${plural(s.late_lender_count, 'lender')}`);
  if (s.missed_count > 0) parts.push(plural(s.missed_count, 'missed payment'));
  if (s.nsf_count > 0) parts.push(plural(s.nsf_count, 'NSF or returned item'));
  if (s.lender_count > 0 && s.debt_service_ratio !== null) {
    parts.push(`debt service is ${pct(s.debt_service_ratio)}% of inflows`);
  }
  return `${parts.join('; ')}.`;
}

// ---------- the review ----------

function exceptionLines(rows: Row[]): ExceptionLine[] {
  const lines: ExceptionLine[] = [];
  for (const r of rows) {
    const kind = isNsfLine(r.description) ? 'nsf' : isLateFeeLine(r.description) ? 'late_fee' : null;
    if (kind) lines.push({ date: r.date, description: r.description, amount: r.amount, kind });
  }
  return lines.slice(0, MAX_EXCEPTIONS);
}

export interface BuildReviewInput {
  borrowerId: string;
  fileUrl: string;
  rows: Row[];
  now?: () => Date;
  extractionMethod?: ExtractionMethod;
}

export function buildCashflowReview(input: BuildReviewInput): CashflowReviewRecord {
  const groups = groupLenderPayments(input.rows);
  const lenders = groups.map((g) => analyseLender(g.name, g.rows));
  const metrics = computeMetrics(input.rows, groups.flatMap((g) => g.rows));
  const stats: FlagStats = {
    lender_count: lenders.length,
    late_count: lenders.reduce((n, l) => n + l.late_count, 0),
    late_lender_count: lenders.filter((l) => l.late_count > 0).length,
    missed_count: lenders.reduce((n, l) => n + l.missed_count, 0),
    nsf_count: metrics.nsf_count,
    late_fee_count: metrics.late_fee_count,
    debt_service_ratio: metrics.debt_service_ratio,
    negative_months: metrics.negative_months,
  };
  const now = input.now ?? (() => new Date());
  return {
    borrower_id: input.borrowerId,
    created_at: now().toISOString(),
    file_url: input.fileUrl,
    extraction_method: input.extractionMethod ?? 'csv',
    transaction_count: input.rows.length,
    period_start: metrics.period_start,
    period_end: metrics.period_end,
    lender_count: lenders.length,
    lenders,
    nsf_count: metrics.nsf_count,
    late_fee_count: metrics.late_fee_count,
    monthly_inflows: metrics.monthly_inflows,
    monthly_debt_service: metrics.monthly_debt_service,
    debt_service_ratio: metrics.debt_service_ratio,
    negative_months: metrics.negative_months,
    negative_month_keys: metrics.negative_month_keys,
    lowest_balance: metrics.lowest_balance,
    exceptions: exceptionLines(input.rows),
    flags: buildFlags(stats),
    summary: buildSummary(stats),
  };
}

// ---------- extraction pipeline ----------

export interface ExtractParams {
  file_url: string;
  json_schema: object;
}

export interface LLMFileParams {
  prompt: string;
  response_json_schema: object;
  file_urls: string[];
}

export interface CashflowDeps {
  borrowerId: string;
  fileUrl: string;
  /** GET a file as text (used for CSV statements only). */
  fetchText: (url: string) => Promise<string>;
  /** base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile */
  extract: (params: ExtractParams) => Promise<unknown>;
  /** base44.asServiceRole.integrations.Core.InvokeLLM with file_urls */
  invokeLLM: (params: LLMFileParams) => Promise<unknown>;
  now?: () => Date;
}

export type CashflowResult =
  | { ok: true; review: CashflowReviewRecord; attempts: string[] }
  | { ok: false; code: 'bad_request' | 'extraction_failed' | 'internal_error'; error: string; attempts: string[] };

export const LLM_EXTRACT_PROMPT = [
  'The attached file is a bank statement or cash-flow statement for a small business.',
  'List every transaction line on it, in order, as JSON matching the schema.',
  'Copy each description exactly as printed. Use YYYY-MM-DD dates and a positive amount;',
  'direction is "out" for withdrawals/debits and "in" for deposits/credits.',
  'Include running_balance only if the statement prints one.',
  'Do not summarise, merge, infer or invent lines. If there are no transactions, return an empty list.',
].join(' ');

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCsvUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.csv');
  } catch {
    return false;
  }
}

async function readRows(deps: CashflowDeps, attempts: string[]): Promise<{ rows: Row[]; method: ExtractionMethod } | null> {
  if (isCsvUrl(deps.fileUrl)) {
    try {
      const rows = parseCsvStatement(await withTimeout(deps.fetchText(deps.fileUrl), STEP_TIMEOUT_MS, 'CSV download'));
      attempts.push(`csv: ${rows.length} rows`);
      if (rows.length) return { rows, method: 'csv' };
    } catch (error) {
      attempts.push(`csv failed: ${errorMessage(error)}`);
    }
  }
  try {
    const raw = await withTimeout(
      deps.extract({ file_url: deps.fileUrl, json_schema: TRANSACTIONS_SCHEMA }),
      STEP_TIMEOUT_MS,
      'Extraction',
    );
    const rows = parseExtractionResult(raw);
    attempts.push(`extract: ${rows.length} rows`);
    if (rows.length) return { rows, method: 'extract' };
  } catch (error) {
    attempts.push(`extract failed: ${errorMessage(error)}`);
  }
  try {
    const raw = await withTimeout(
      deps.invokeLLM({ prompt: LLM_EXTRACT_PROMPT, response_json_schema: TRANSACTIONS_SCHEMA, file_urls: [deps.fileUrl] }),
      STEP_TIMEOUT_MS,
      'LLM extraction',
    );
    const rows = parseExtractionResult(raw);
    attempts.push(`llm: ${rows.length} rows`);
    if (rows.length) return { rows, method: 'llm' };
  } catch (error) {
    attempts.push(`llm failed: ${errorMessage(error)}`);
  }
  return null;
}

/** Read a statement and build a CashflowReview record. Never throws. */
export async function runCashflowAnalysis(deps: CashflowDeps): Promise<CashflowResult> {
  const attempts: string[] = [];
  if (!normaliseUrl(deps.fileUrl)) {
    return { ok: false, code: 'bad_request', error: 'file_url must be an http(s) URL', attempts };
  }
  try {
    const read = await readRows(deps, attempts);
    if (!read) {
      return {
        ok: false,
        code: 'extraction_failed',
        error:
          'Could not read any transactions from this file. Upload a bank or cash-flow statement as PDF, CSV, XLSX or image.',
        attempts,
      };
    }
    const review = buildCashflowReview({
      borrowerId: deps.borrowerId,
      fileUrl: deps.fileUrl,
      rows: read.rows,
      now: deps.now,
      extractionMethod: read.method,
    });
    return { ok: true, review, attempts };
  } catch (error) {
    return { ok: false, code: 'internal_error', error: `Cash-flow check failed: ${errorMessage(error)}`, attempts };
  }
}
