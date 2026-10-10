// Pure logic for lenderCheck: the "Other lenders" check.
// No npm: imports and no Deno globals, so it runs under Node's test runner.
// The Deno handler (entry.ts) injects fetch, the LLM and the Bright Data key.
//
// From user testing: the red flags were "loans at many other banks and small,
// slightly late payments to them". This finds public evidence of a company's
// other lenders (UCC liens, lender lawsuits, judgments, new loans, merchant
// cash advances) and of late payments to them.
//
// It never sets status and never writes Signal records.
//
// Bright Data, SERP, HTML and quote-verification helpers are reused from the
// analyzeBorrower function, not copied.

import {
  BRIGHTDATA_ENDPOINT,
  buildBrightDataRequest,
  coerceJson,
  htmlToText,
  normaliseSerpJson,
  normaliseUrl,
  verifyFindings,
  withTimeout,
} from '../analyzeBorrower/logic.ts';
import type { Borrower, FetchLike, Finding, LLMParams, NewsResult } from '../analyzeBorrower/logic.ts';

export type { Borrower, FetchLike, LLMParams };

// ---------- limits ----------

export const BUDGET_MS = 75_000;
/** Time kept back for the tagging LLM call; also its minimum timeout. */
export const LLM_RESERVE_MS = 25_000;
export const TOOL_TIMEOUT_MS = 20_000;
export const MAX_PAGES = 4;
const MAX_RESULTS_PER_SEARCH = 10;
/** Page text shown to the LLM; verification uses the full fetched text. */
const PAGE_PROMPT_CHARS = 8_000;

export const LENDER_KINDS = ['lien', 'lender_lawsuit', 'judgment', 'new_loan', 'mca', 'none'] as const;
export type LenderKind = (typeof LENDER_KINDS)[number];

// ---------- types ----------

export interface LenderQuery {
  label: 'liens' | 'lawsuits' | 'news';
  query: string;
  news: boolean;
}

export interface SearchItem extends NewsResult {
  /** Readable page text, if the page was read. */
  text: string;
}

export interface LenderTag {
  source_url: string;
  same_company: boolean;
  kind: LenderKind;
  lender_name: string | null;
  late_payment: boolean;
  quote: string;
  date: string | null;
}

/** Optional keys are omitted (not null) so Base44 string fields validate. */
export interface LenderEvidence {
  quote: string;
  source_url: string;
  source_name: string;
  date?: string;
}

export interface Lender {
  name: string;
  kinds: string[];
  evidence: LenderEvidence[];
}

export interface LatePaymentEvidence {
  quote: string;
  source_url: string;
  date?: string;
  lender?: string;
}

export interface SearchedEntry {
  query: string;
  ok: boolean;
  tool?: 'search' | 'read';
  detail?: string;
}

export interface LenderCheckRecord {
  borrower_id: string;
  created_at: string;
  lender_count: number;
  lenders: Lender[];
  late_payment_evidence: LatePaymentEvidence[];
  searched: SearchedEntry[];
  summary: string;
}

export interface LenderCheckDeps {
  borrower: Borrower;
  invokeLLM: (params: LLMParams) => Promise<unknown>;
  fetch: FetchLike;
  apiKey: string | undefined;
  now?: () => number;
  budgetMs?: number;
  /** Override for LLM_RESERVE_MS (tests). */
  llmMinMs?: number;
}

export type LenderCheckResult =
  | { ok: true; record: LenderCheckRecord }
  | { ok: false; code: 'llm_unavailable' | 'internal_error'; error: string; searched: SearchedEntry[] };

// ---------- small helpers ----------

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------- queries ----------

export function buildLenderQueries(name: string): LenderQuery[] {
  const quoted = `"${name.replace(/"/g, '').replace(/\s+/g, ' ').trim()}"`;
  return [
    { label: 'liens', news: false, query: `${quoted} (UCC OR "financing statement" OR "secured party")` },
    {
      label: 'lawsuits',
      news: false,
      query: `${quoted} ("v." OR vs) (bank OR capital OR funding OR lender) (judgment OR lawsuit OR default)`,
    },
    {
      label: 'news',
      news: true,
      query: `${quoted} (loan OR "credit facility" OR refinanc* OR "merchant cash advance" OR lender)`,
    },
  ];
}

export function buildSearchUrl(query: string, news: boolean): string {
  const base = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  return news ? `${base}&tbm=nws&tbs=qdr:y&hl=en&gl=us&brd_json=1` : `${base}&hl=en&gl=us&brd_json=1`;
}

/** Bright Data SERP JSON -> results. Reads `organic` (web) and `news` (via analyzeBorrower). */
export function normaliseSearchResults(raw: unknown): NewsResult[] {
  const data = coerceJson(raw);
  if (!isRecord(data)) return [];
  const results: NewsResult[] = [];
  const organic = Array.isArray(data.organic) ? data.organic : [];
  for (const item of organic) {
    if (!isRecord(item)) continue;
    const title = str(item.title);
    const url = str(item.link) || str(item.url);
    if (!title || !normaliseUrl(url)) continue;
    results.push({
      title,
      url,
      source: str(item.display_link) || hostOf(url),
      date: str(item.date),
      snippet: str(item.description) || str(item.snippet),
    });
    if (results.length >= MAX_RESULTS_PER_SEARCH) break;
  }
  return [...results, ...normaliseSerpJson(data)];
}

// ---------- names ----------

const NAME_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'na', 'bank', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'lp', 'llp', 'plc', 'fsb',
]);

/** Comparable lender name: lower case, no punctuation, no Inc/LLC/N.A./Bank-style suffixes. */
export function normaliseLenderName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

// ---------- LLM prompt and parsing ----------

export const TAG_SCHEMA = {
  type: 'object',
  properties: {
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_url: { type: 'string', description: 'The URL of the item the quote comes from, exactly as given.' },
          same_company: { type: 'boolean' },
          kind: { type: 'string', enum: [...LENDER_KINDS] },
          lender_name: { type: ['string', 'null'] },
          late_payment: { type: 'boolean' },
          quote: { type: 'string', description: 'Copied character for character from that item’s text.' },
          date: { type: ['string', 'null'] },
        },
        required: ['source_url', 'same_company', 'kind', 'lender_name', 'late_payment', 'quote'],
      },
    },
  },
  required: ['tags'],
};

export function buildTagPrompt(borrower: Borrower, items: SearchItem[]): string {
  const identity = [
    `Name: ${borrower.name}`,
    borrower.website_domain ? `Website: ${borrower.website_domain}` : '',
    borrower.hq_city || borrower.hq_state
      ? `Headquarters: ${[borrower.hq_city, borrower.hq_state].filter(Boolean).join(', ')}`
      : '',
    borrower.industry ? `Industry: ${borrower.industry}` : '',
  ].filter(Boolean);
  const blocks = items.map((item, i) => {
    const lines = [
      `[${i + 1}] URL: ${item.url}`,
      `Title: ${item.title}`,
      item.source ? `Source: ${item.source}` : '',
      item.date ? `Date: ${item.date}` : '',
      item.snippet ? `Snippet: ${item.snippet}` : '',
      item.text ? `Page text: ${item.text.slice(0, PAGE_PROMPT_CHARS)}` : '',
    ];
    return lines.filter(Boolean).join('\n');
  });
  return [
    'You help a bank credit officer find the OTHER lenders of a company and any sign of late payments to them.',
    '',
    'Company:',
    ...identity,
    '',
    'For each search result or page below that mentions a lender relationship, return one tag per lender:',
    '- source_url: the item URL exactly as given.',
    '- same_company: true only if the item is clearly about this company (match the website or headquarters city when given). If unsure, same_company must be false.',
    "- kind: lien (UCC / financing statement / secured party), lender_lawsuit (a lender or funder suing the company), judgment (a court judgment for a creditor), new_loan (a loan, credit facility or refinancing), mca (merchant cash advance), or none.",
    '- lender_name: the lender, secured party or funder, as written; null if not named.',
    '- late_payment: true only if the text says payments to a lender were late, missed or in default.',
    '- quote: a short sentence copied character for character from that item (snippet or page text) that supports the tag. Never paraphrase.',
    '- date: the date of the filing or article if stated, else null.',
    'Skip items with no lender relationship. Do not invent lenders. Return {"tags": []} if nothing applies.',
    '',
    'Items:',
    blocks.join('\n\n'),
  ].join('\n');
}

export function parseTags(raw: unknown): LenderTag[] | null {
  const data = coerceJson(raw);
  if (!isRecord(data) || !Array.isArray(data.tags)) return null;
  const tags: LenderTag[] = [];
  for (const t of data.tags) {
    if (!isRecord(t)) continue;
    const sourceUrl = str(t.source_url);
    if (!sourceUrl) continue;
    const kind = str(t.kind);
    tags.push({
      source_url: sourceUrl,
      same_company: t.same_company === true,
      kind: (LENDER_KINDS as readonly string[]).includes(kind) ? (kind as LenderKind) : 'none',
      lender_name: str(t.lender_name) || null,
      late_payment: t.late_payment === true,
      quote: str(t.quote),
      date: str(t.date) || null,
    });
  }
  return tags;
}

// ---------- filtering and dedupe (code, not LLM) ----------

/**
 * Keep only same-company, non-"none" tags whose quote appears verbatim in the
 * text fetched for that URL; group lenders by normalised name.
 */
export function collectLenders(
  tags: LenderTag[],
  sources: ReadonlyMap<string, readonly string[]>,
  borrowerName: string,
  sourceNames: ReadonlyMap<string, string> = new Map(),
): { lenders: Lender[]; late_payment_evidence: LatePaymentEvidence[] } {
  const candidates = tags.filter((t) => t.same_company && t.kind !== 'none');
  const byFinding = new Map<Finding, LenderTag>();
  const findings = candidates.map((t) => {
    const f: Finding = { claim: t.kind, quote: t.quote, source_url: t.source_url, source_name: '' };
    byFinding.set(f, t);
    return f;
  });
  const { kept } = verifyFindings(findings, sources);
  const self = normaliseLenderName(borrowerName);
  const lenders = new Map<string, Lender>();
  const late: LatePaymentEvidence[] = [];

  for (const finding of kept) {
    const tag = byFinding.get(finding);
    if (!tag) continue;
    const key = tag.lender_name ? normaliseLenderName(tag.lender_name) : '';
    const isLender = key !== '' && key !== self;
    const sourceName = sourceNames.get(normaliseUrl(tag.source_url) ?? '') || hostOf(tag.source_url);
    let lenderName: string | null = null;
    if (isLender) {
      const existing = lenders.get(key) ?? { name: tag.lender_name as string, kinds: [], evidence: [] };
      const kinds = existing.kinds.includes(tag.kind) ? existing.kinds : [...existing.kinds, tag.kind];
      const dup = existing.evidence.some((e) => e.quote === tag.quote && e.source_url === tag.source_url);
      const evidence = dup
        ? existing.evidence
        : [
            ...existing.evidence,
            { quote: tag.quote, source_url: tag.source_url, source_name: sourceName, ...(tag.date ? { date: tag.date } : {}) },
          ];
      lenders.set(key, { ...existing, kinds, evidence });
      lenderName = existing.name;
    }
    if (tag.late_payment) {
      late.push({
        quote: tag.quote,
        source_url: tag.source_url,
        ...(tag.date ? { date: tag.date } : {}),
        ...(lenderName ? { lender: lenderName } : {}),
      });
    }
  }
  return { lenders: [...lenders.values()], late_payment_evidence: late };
}

// ---------- summary (code, not LLM) ----------

const LAWSUIT_KINDS = ['lender_lawsuit', 'judgment'];

export function buildLenderSummary(input: {
  lenders: Lender[];
  late_payment_evidence: LatePaymentEvidence[];
  searched: SearchedEntry[];
}): string {
  const searches = input.searched.filter((s) => s.tool !== 'read');
  const failed = searches.filter((s) => !s.ok).length;
  if (searches.length > 0 && failed === searches.length) {
    return 'Lender check could not be completed: every search failed. Try again later.';
  }
  const n = input.lenders.length;
  const suits = input.lenders.filter((l) => l.kinds.some((k) => LAWSUIT_KINDS.includes(k))).length;
  const lateSources = new Set(input.late_payment_evidence.map((e) => normaliseUrl(e.source_url) ?? e.source_url)).size;
  const lateText = lateSources > 0
    ? `${plural(lateSources, 'source mentions', 'sources mention')} late or missed payments`
    : '';

  let summary: string;
  if (n === 0) {
    summary = 'No other lenders found in public records (not proof there are none).';
    if (lateText) summary += ` ${lateText.charAt(0).toUpperCase()}${lateText.slice(1)}.`;
  } else {
    const parts = [`${plural(n, 'other lender', 'other lenders')} found in public records`];
    if (suits > 0) parts.push(plural(suits, 'lender lawsuit or judgment', 'lender lawsuits or judgments'));
    if (lateText) parts.push(lateText);
    summary = `${parts.join('; ')}.`;
  }
  if (failed > 0) summary += ` ${failed} of ${searches.length} searches failed.`;
  return summary;
}

// ---------- tools ----------

async function callBrightData(fetchFn: FetchLike, apiKey: string, targetUrl: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const request = buildBrightDataRequest(apiKey, targetUrl);
  const run = async () => {
    const res = await fetchFn(BRIGHTDATA_ENDPOINT, { ...request, signal: controller.signal });
    if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
    return res.text();
  };
  try {
    return await withTimeout(run(), timeoutMs, 'Bright Data request');
  } finally {
    controller.abort();
  }
}

type SourceMap = Map<string, string[]>;

function addSource(sources: SourceMap, url: string, texts: string[]): void {
  const key = normaliseUrl(url);
  if (!key) return;
  sources.set(key, [...(sources.get(key) ?? []), ...texts.filter(Boolean)]);
}

async function runSearches(
  deps: LenderCheckDeps,
  timeLeft: () => number,
): Promise<{ lists: NewsResult[][]; searched: SearchedEntry[] }> {
  const queries = buildLenderQueries(deps.borrower.name);
  const apiKey = deps.apiKey;
  if (!apiKey) {
    return {
      lists: queries.map(() => []),
      searched: queries.map((q) => ({ query: q.query, ok: false, tool: 'search', detail: 'BRIGHTDATA_API_KEY is not set' })),
    };
  }
  const outcomes = await Promise.all(
    queries.map(async (q): Promise<{ results: NewsResult[]; entry: SearchedEntry }> => {
      try {
        const body = await callBrightData(deps.fetch, apiKey, buildSearchUrl(q.query, q.news), Math.min(TOOL_TIMEOUT_MS, timeLeft()));
        const results = normaliseSearchResults(body);
        return { results, entry: { query: q.query, ok: true, tool: 'search', detail: `${results.length} results` } };
      } catch (error) {
        return { results: [], entry: { query: q.query, ok: false, tool: 'search', detail: errorMessage(error) } };
      }
    }),
  );
  return { lists: outcomes.map((o) => o.results), searched: outcomes.map((o) => o.entry) };
}

/** Round-robin across the result lists so each search gets pages read. */
function pickPages(lists: NewsResult[][], max: number): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && picked.length < max; i += 1) {
    for (const list of lists) {
      const r = list[i];
      const key = r ? normaliseUrl(r.url) : null;
      if (!r || !key || seen.has(key) || /\.pdf($|\?)/i.test(r.url)) continue;
      seen.add(key);
      picked.push(r.url);
      if (picked.length >= max) break;
    }
  }
  return picked;
}

async function readPages(
  deps: LenderCheckDeps,
  urls: string[],
  timeoutMs: number,
): Promise<{ texts: Map<string, string>; searched: SearchedEntry[] }> {
  const texts = new Map<string, string>();
  if (!deps.apiKey || urls.length === 0 || timeoutMs <= 0) return { texts, searched: [] };
  const apiKey = deps.apiKey;
  const searched = await Promise.all(
    urls.map(async (url): Promise<SearchedEntry> => {
      try {
        const text = htmlToText(await callBrightData(deps.fetch, apiKey, url, timeoutMs));
        if (!text) return { query: url, ok: false, tool: 'read', detail: 'Page had no readable text' };
        texts.set(normaliseUrl(url) as string, text);
        return { query: url, ok: true, tool: 'read', detail: `${text.length} characters read` };
      } catch (error) {
        return { query: url, ok: false, tool: 'read', detail: errorMessage(error) };
      }
    }),
  );
  return { texts, searched };
}

// ---------- the check ----------

function buildRecord(
  deps: LenderCheckDeps,
  collected: { lenders: Lender[]; late_payment_evidence: LatePaymentEvidence[] },
  searched: SearchedEntry[],
): LenderCheckRecord {
  return {
    borrower_id: str(deps.borrower.id),
    created_at: new Date().toISOString(),
    lender_count: collected.lenders.length,
    lenders: collected.lenders,
    late_payment_evidence: collected.late_payment_evidence,
    searched,
    summary: buildLenderSummary({ ...collected, searched }),
  };
}

/** Run the other-lenders check for one company. Never throws. */
export async function runLenderCheck(deps: LenderCheckDeps): Promise<LenderCheckResult> {
  const now = deps.now ?? Date.now;
  const reserve = deps.llmMinMs ?? LLM_RESERVE_MS;
  const deadline = now() + (deps.budgetMs ?? BUDGET_MS);
  const toolTimeLeft = () => Math.max(1, deadline - now() - reserve);
  let searched: SearchedEntry[] = [];
  try {
    const search = await runSearches(deps, toolTimeLeft);
    searched = search.searched;

    const items = new Map<string, SearchItem>();
    const sources: SourceMap = new Map();
    const sourceNames = new Map<string, string>();
    for (const r of search.lists.flat()) {
      const key = normaliseUrl(r.url);
      if (!key) continue;
      addSource(sources, r.url, [r.title, r.snippet]);
      if (r.source) sourceNames.set(key, r.source);
      if (!items.has(key)) items.set(key, { ...r, text: '' });
    }

    const pageTime = Math.min(TOOL_TIMEOUT_MS, deadline - now() - reserve);
    const pages = await readPages(deps, pickPages(search.lists, MAX_PAGES), pageTime);
    searched = [...searched, ...pages.searched];
    for (const [key, text] of pages.texts) {
      addSource(sources, key, [text]);
      const item = items.get(key);
      if (item) items.set(key, { ...item, text });
    }

    if (items.size === 0) {
      return { ok: true, record: buildRecord(deps, { lenders: [], late_payment_evidence: [] }, searched) };
    }

    let raw: unknown;
    try {
      raw = await withTimeout(
        deps.invokeLLM({ prompt: buildTagPrompt(deps.borrower, [...items.values()]), response_json_schema: TAG_SCHEMA }),
        Math.max(deadline - now(), reserve),
        'Lender tagging call',
      );
    } catch (error) {
      return {
        ok: false,
        code: 'llm_unavailable',
        error: `The AI tagger is unavailable right now (${errorMessage(error)}). Try again in a minute.`,
        searched,
      };
    }
    const tags = parseTags(raw);
    if (!tags) {
      return { ok: false, code: 'llm_unavailable', error: 'The AI tagger returned an unreadable answer. Try again.', searched };
    }
    const collected = collectLenders(tags, sources, deps.borrower.name, sourceNames);
    return { ok: true, record: buildRecord(deps, collected, searched) };
  } catch (error) {
    return { ok: false, code: 'internal_error', error: `Lender check failed: ${errorMessage(error)}`, searched };
  }
}
