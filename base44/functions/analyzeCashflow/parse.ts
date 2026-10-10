// Statement parsing: CSV text, Base44 extraction output and LLM fallback output all end
// up as validated, date-sorted Row[]. No npm: imports and no Deno globals.

import { coerceJson } from '../analyzeBorrower/logic.ts';

export type Direction = 'in' | 'out';

export interface Row {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // always positive; direction carries the sign
  direction: Direction;
  running_balance?: number;
}

/** Upper bound on transactions read from one statement. */
export const MAX_ROWS = 5000;

/** JSON schema handed to ExtractDataFromUploadedFile and the InvokeLLM fallback. */
export const TRANSACTIONS_SCHEMA = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      description: 'Every transaction line on the statement, in order, copied exactly.',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Posting date as YYYY-MM-DD' },
          description: { type: 'string', description: 'The transaction description exactly as printed' },
          amount: { type: 'number', description: 'Absolute amount of the transaction' },
          direction: { type: 'string', enum: ['in', 'out'], description: 'in = deposit/credit, out = withdrawal/debit' },
          running_balance: { type: 'number', description: 'Balance after this line, if printed' },
        },
        required: ['date', 'description', 'amount', 'direction'],
      },
    },
  },
  required: ['transactions'],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Accepts YYYY-MM-DD (optionally with a time) and US MM/DD/YYYY or MM/DD/YY. */
export function parseDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[1]), Number(m[2]));
  }
  return null;
}

/** "$1,200.50", "-4,000", "(36.00)" -> signed number; null if not a number. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toRow(raw: unknown): Row | null {
  if (!isRecord(raw)) return null;
  const date = parseDate(raw.date);
  const description = typeof raw.description === 'string' ? raw.description.replace(/\s+/g, ' ').trim() : '';
  const signed = parseAmount(raw.amount);
  if (!date || !description || signed === null || signed === 0) return null;
  const stated = raw.direction === 'in' || raw.direction === 'out' ? (raw.direction as Direction) : null;
  const direction: Direction = stated ?? (signed < 0 ? 'out' : 'in');
  const balance = parseAmount(raw.running_balance);
  return {
    date,
    description,
    amount: round2(Math.abs(signed)),
    direction,
    ...(balance === null ? {} : { running_balance: round2(balance) }),
  };
}

/** Validate untrusted transaction objects into Row[], sorted by date (stable). */
export function normaliseRows(raw: unknown): Row[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.slice(0, MAX_ROWS).map(toRow).filter((r): r is Row => r !== null);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.date.localeCompare(b.row.date) || a.index - b.index)
    .map(({ row }) => row);
}

/** Pull Row[] out of ExtractDataFromUploadedFile / InvokeLLM output in any of its shapes. */
export function parseExtractionResult(raw: unknown): Row[] {
  const data = coerceJson(raw);
  if (Array.isArray(data)) return normaliseRows(data);
  if (!isRecord(data)) return [];
  if (data.status === 'error') return [];
  const payload = 'output' in data ? coerceJson(data.output) : data;
  if (Array.isArray(payload)) return normaliseRows(payload);
  if (isRecord(payload) && Array.isArray(payload.transactions)) return normaliseRows(payload.transactions);
  return [];
}

// ---------- CSV ----------

/** RFC 4180-ish CSV split: quoted fields, doubled quotes, CRLF. */
export function splitCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((f) => f.trim()));
}

interface CsvColumns {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  balance: number;
}

function findColumn(header: string[], names: RegExp): number {
  return header.findIndex((h) => names.test(h.trim().toLowerCase()));
}

function csvColumns(header: string[]): CsvColumns | null {
  const cols = {
    date: findColumn(header, /^(date|posted|posting date|post date|transaction date)$/),
    description: findColumn(header, /^(description|memo|details|narrative|payee|transaction)$/),
    amount: findColumn(header, /^(amount|amt)$/),
    debit: findColumn(header, /^(debit|withdrawal|withdrawals|money out)$/),
    credit: findColumn(header, /^(credit|deposit|deposits|money in)$/),
    balance: findColumn(header, /^(balance|running balance|running_balance)$/),
  };
  const hasAmount = cols.amount >= 0 || (cols.debit >= 0 && cols.credit >= 0);
  if (cols.date < 0 || cols.description < 0 || !hasAmount) return null;
  return cols;
}

function csvRecordToRaw(record: string[], cols: CsvColumns): Record<string, unknown> {
  const cell = (i: number) => (i >= 0 ? (record[i] ?? '') : '');
  let amount: number | null = null;
  let direction: Direction | undefined;
  if (cols.amount >= 0) {
    amount = parseAmount(cell(cols.amount));
  } else {
    const debit = parseAmount(cell(cols.debit));
    const credit = parseAmount(cell(cols.credit));
    if (debit) {
      amount = Math.abs(debit);
      direction = 'out';
    } else if (credit) {
      amount = Math.abs(credit);
      direction = 'in';
    }
  }
  return {
    date: cell(cols.date),
    description: cell(cols.description),
    amount,
    ...(direction ? { direction } : {}),
    running_balance: cell(cols.balance),
  };
}

/** Parse a CSV bank or cash-flow statement deterministically (no model involved). */
export function parseCsvStatement(text: string): Row[] {
  const records = splitCsv(text.replace(/^﻿/, ''));
  if (records.length < 2) return [];
  const cols = csvColumns(records[0]);
  if (!cols) return [];
  return normaliseRows(records.slice(1).map((r) => csvRecordToRaw(r, cols)));
}
