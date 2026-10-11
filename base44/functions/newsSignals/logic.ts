// Pure logic for newsSignals (P2): Google News -> exec_departure and legal_layoffs signals.
// No npm: imports and no Deno globals, so it runs under Node's test runner.
// The Deno handler (entry.ts) injects fetch, the LLM and the Bright Data key.
//
// Rules (CLAUDE.md):
//   exec_departure: CEO/CFO leaving = strong, other senior roles = weak.
//   legal_layoffs:  WARN notice, bankruptcy, or a lender/supplier lawsuit = strong; other lawsuits/layoffs = weak.
//   Last 180 days only. Never writes status.
//
// Flow: both searches run in parallel; the top results per search are read (HTML -> text) and the LLM
// tags ONE item at a time. Code keeps a tag only if it is relevant, about the same company, has a
// strong/weak severity, and its snippet is found verbatim (whitespace-normalised, case-insensitive)
// in that item's own text. The signal's snippet is then copied from the source text itself.
// One search failing still returns the other's signals; both failing throws.

import {
  BRIGHTDATA_ENDPOINT,
  buildBrightDataRequest,
  coerceJson,
  errorMessage,
  htmlToText,
  isRecord,
  normaliseForMatch,
  normaliseSerpJson,
  normaliseUrl,
  str,
  withTimeout,
} from './shared.ts';
import type { FetchLike, LLMParams, NewsResult } from './shared.ts';

export type { FetchLike, LLMParams };

// ---------- limits ----------

export const BUDGET_MS = 90_000;
export const MAX_AGE_DAYS = 180;
export const MAX_ITEMS_PER_QUERY = 5;
const SEARCH_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 20_000;
/** Page reads stop once less than this is left, so tagging still fits in the budget. */
const LLM_RESERVE_MS = 20_000;
/** Every tagging call gets at least this long, even near the deadline. */
const LLM_MIN_MS = 5_000;
/** Text shown to the LLM per item; verification uses the item's full text. */
const PROMPT_TEXT_CHARS = 8_000;
/** A shorter quote matches too easily to prove anything. */
const MIN_SNIPPET_CHARS = 12;
/** A SERP date this far in the future is a time-zone artefact and counts as today. */
const FUTURE_SLACK_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SIGNAL_TYPES = ['exec_departure', 'legal_layoffs'] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export type Severity = 'strong' | 'weak';

// ---------- types ----------

export interface Borrower {
  id?: string;
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
  industry?: string;
}

export interface Signal {
  type: SignalType;
  severity: Severity;
  date: string;
  date_approx?: boolean;
  title: string;
  snippet: string;
  source_name: string;
  source_url: string;
}

export interface NewsQuery {
  type: SignalType;
  query: string;
}

export interface NewsItem {
  url: string;
  title: string;
  source: string;
  /** YYYY-MM-DD */
  date: string;
  date_approx?: boolean;
  /** Readable text: SERP title and description, plus the article body when it could be read. */
  text: string;
  /** Which search found it. */
  query: SignalType;
}

export interface Tag {
  relevant: boolean;
  same_company: boolean;
  signal_type: string;
  severity: string;
  snippet: string;
  /** The model's one-line explanation. Logged for the team, never saved on a Signal. */
  reason?: string;
}

export interface NewsDeps {
  borrower: Borrower;
  invokeLLM: (params: LLMParams) => Promise<unknown>;
  fetch: FetchLike;
  apiKey: string | undefined;
  /** YYYY-MM-DD; defaults to the UTC date of now(). */
  today?: string;
  now?: () => number;
  budgetMs?: number;
  /** Optional progress log (Base44 function logs, local console). */
  log?: (msg: string) => void;
  /** Optional structured progress, saved as a CheckRun so the company page can show each step. */
  onEvent?: (e: NewsEvent) => void;
}

export type NewsEvent =
  | { kind: 'search'; query_type: SignalType; query: string; ok: boolean; count: number; error?: string }
  | { kind: 'read'; url: string; title: string; source: string; date: string; query: SignalType; read: boolean }
  | { kind: 'tag'; url: string; tag: Tag | null; decision: 'kept' | 'dropped' | 'failed'; why: string; snippet?: string };

// ---------- queries ----------

export function buildNewsQueries(name: string): NewsQuery[] {
  const quoted = `"${name.replace(/"/g, '').replace(/\s+/g, ' ').trim()}"`;
  return [
    {
      type: 'exec_departure',
      query: `${quoted} (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs OR leaves)`,
    },
    {
      type: 'legal_layoffs',
      query: `${quoted} (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)`,
    },
  ];
}

export function buildNewsSearchUrl(query: string): string {
  return (
    `https://www.google.com/search?q=${encodeURIComponent(query)}` +
    '&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1'
  );
}

// ---------- dates ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function utcDay(y: number, m: number, d: number): number | null {
  const t = Date.UTC(y, m, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m && back.getUTCDate() === d ? t : null;
}

function isoDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function parseIsoDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? utcDay(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Calendar subtraction of months, clamping the day (Mar 31 - 1 month = Feb 28). */
function minusMonths(today: number, months: number): number {
  const d = new Date(today);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), lastDay));
}

function parseRelative(s: string, today: number): number | null {
  if (/^(today|just now)$/.test(s)) return today;
  if (s === 'yesterday') return today - DAY_MS;
  const m = /^(\d+|an?|one)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?|mo|mos|months?|y|yrs?|years?)\s+ago$/.exec(s);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = m[2];
  if (/^(m|mins?|minutes?|h|hrs?|hours?)$/.test(unit)) return today;
  if (/^(d|days?)$/.test(unit)) return today - n * DAY_MS;
  if (/^(w|wks?|weeks?)$/.test(unit)) return today - n * 7 * DAY_MS;
  if (/^(mo|mos|months?)$/.test(unit)) return minusMonths(today, n);
  return minusMonths(today, 12 * n);
}

export function isApproximateDate(raw: string): boolean {
  const s = str(raw).toLowerCase().replace(/\s+/g, ' ');
  return /^(\d+|an?|one)\s*(w|wks?|weeks?|mo|mos|months?|y|yrs?|years?)\s+ago$/.test(s);
}

function parseAbsolute(s: string): number | null {
  const iso = parseIsoDay(s);
  if (iso !== null) return iso;
  const monthFirst = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  const dayFirst = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  const [monthName, day, year] = monthFirst
    ? [monthFirst[1], monthFirst[2], monthFirst[3]]
    : dayFirst
      ? [dayFirst[2], dayFirst[1], dayFirst[3]]
      : [null, null, null];
  if (!monthName) return null;
  const month = MONTHS.indexOf(monthName.slice(0, 3));
  return month < 0 ? null : utcDay(Number(year), month, Number(day));
}

/**
 * Publish date from a dated article path (/2026/08/21/), or null. More exact than Google's
 * relative dates: "1 month ago" covers 30-59 days, but parseRelative can only pick one end.
 */
export function dateFromUrl(url: string, today: string): string | null {
  const now = parseIsoDay(today);
  const m = /\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/.exec(str(url));
  if (now === null || !m) return null;
  const t = utcDay(+m[1], +m[2] - 1, +m[3]);
  return t === null || t > now ? null : isoDay(t);
}

/**
 * SERP date ("3 days ago", "Jun 18, 2026", "18 Jun 2026", ISO) -> YYYY-MM-DD against today (UTC),
 * or null if it can't be parsed or is clearly in the future.
 */
export function parseNewsDate(raw: string, today: string): string | null {
  const now = parseIsoDay(today);
  const s = str(raw).toLowerCase().replace(/\s+/g, ' ');
  if (now === null || !s) return null;
  const t = parseRelative(s, now) ?? parseAbsolute(s);
  if (t === null) return null;
  if (t > now) return t - now <= FUTURE_SLACK_DAYS * DAY_MS ? today : null;
  return isoDay(t);
}

function ageDays(date: string, today: string): number {
  return Math.round(((parseIsoDay(today) ?? 0) - (parseIsoDay(date) ?? 0)) / DAY_MS);
}

// ---------- tagging ----------

export const TAG_SCHEMA = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    same_company: { type: 'boolean' },
    signal_type: { type: 'string', enum: ['exec_departure', 'legal_layoffs', 'none'] },
    severity: { type: 'string', enum: ['strong', 'weak', 'none'] },
    snippet: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['relevant', 'same_company', 'signal_type', 'severity', 'snippet'],
};

const QUERY_LABEL: Record<SignalType, string> = {
  exec_departure: 'executive departures',
  legal_layoffs: 'lawsuits, liens, WARN notices, layoffs, bankruptcy',
};

export function buildTagPrompt(borrower: Borrower, item: Omit<NewsItem, 'text'> & { text: string }): string {
  const hq = [borrower.hq_city, borrower.hq_state].map(str).filter(Boolean).join(', ');
  return [
    'You tag ONE news article for a bank credit officer who watches a company the bank lends to.',
    'You only tag. Reply with JSON matching the schema and nothing else.',
    '',
    'Company the bank lends to:',
    `- Name: ${borrower.name}`,
    `- Website: ${str(borrower.website_domain) || 'unknown'}`,
    `- HQ: ${hq || 'unknown'}`,
    `- Industry: ${str(borrower.industry) || 'unknown'}`,
    '',
    'Article:',
    `URL: ${item.url}`,
    `Title: ${item.title}`,
    `Source: ${item.source || 'unknown'}`,
    `Date: ${item.date}`,
    `Found by a search for: ${QUERY_LABEL[item.query]}`,
    'Text:',
    '"""',
    item.text.slice(0, PROMPT_TEXT_CHARS),
    '"""',
    '',
    'Rules:',
    '- same_company: true only if the article is clearly about this company. Use the website, HQ city/state and',
    '  industry to rule out a different company with a similar name. If unsure, same_company = false.',
    '- relevant: true only if the article reports, about this company, a senior executive leaving, or a lawsuit,',
    '  lien, WARN notice, layoffs or bankruptcy. Otherwise false.',
    '- signal_type: "exec_departure" for an executive leaving (resigns, steps down, departs, leaves, is fired, retires);',
    '  "legal_layoffs" for a lawsuit, lien, WARN notice, layoffs or bankruptcy; "none" if not relevant.',
    '- severity for exec_departure: "strong" if the CEO or CFO is leaving; "weak" for any other senior role',
    '  (president, founder, COO, VP, board member).',
    '- severity for legal_layoffs: "strong" for a WARN notice, a bankruptcy filing, or a lawsuit brought against the',
    '  company by a lender, bank, creditor or supplier; "weak" for other lawsuits (including ones the company brings) and layoffs.',
    '- Stories about a FORMER employee, executive or alum (their new venture, new job, job search, book or award), or',
    '  about someone who left the company long ago, are NOT about this company: relevant = false. A lawsuit or wage',
    '  claim that former employees bring AGAINST this company is still relevant.',
    '- severity "none" if not relevant or not the same company.',
    '- snippet: copy one or two sentences EXACTLY, character for character, from the Text above that show the event.',
    '  Never paraphrase, summarise, shorten words or fix typos. Empty string if there is none.',
    '- reason: one short sentence explaining your decision (which company, what event).',
  ].join('\n');
}

export function parseTag(raw: unknown): Tag | null {
  const data = coerceJson(raw);
  if (!isRecord(data)) return null;
  if (typeof data.relevant !== 'boolean' || typeof data.same_company !== 'boolean') return null;
  return {
    relevant: data.relevant,
    same_company: data.same_company,
    signal_type: str(data.signal_type).toLowerCase(),
    severity: str(data.severity).toLowerCase(),
    snippet: str(data.snippet),
    ...(str(data.reason) ? { reason: str(data.reason) } : {}),
  };
}

function cleanQuote(quote: string): string {
  return quote
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, '');
}

/**
 * Finds quote in text (whitespace-normalised, case-insensitive, same rules as normaliseForMatch)
 * and returns the matching passage copied from text itself, or null if it is not there.
 */
export function findVerbatim(text: string, quote: string): string | null {
  const needle = normaliseForMatch(cleanQuote(quote));
  if (needle.length < MIN_SNIPPET_CHARS) return null;
  let hay = '';
  const at: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = normaliseForMatch(text[i]) || ' ';
    if (c === ' ' && (hay === '' || hay.endsWith(' '))) continue;
    for (const ch of c) {
      hay += ch;
      at.push(i);
    }
  }
  const idx = hay.indexOf(needle);
  if (idx < 0) return null;
  return text.slice(at[idx], at[idx + needle.length - 1] + 1).replace(/\s+/g, ' ');
}

/** An exec_departure must name a senior role; this catches e.g. a store closure tagged as a departure. */
const EXEC_TITLE = /\b(ceo|cfo|coo|chief [a-z]+ officer|chief executive|chief financial|president|founder|co-founder|chairman|executive|director|vp|vice president)\b/i;

// A headline whose subject is a former employee ("Ex-Acme manager launches…", "Former Acme exec joins…",
// "Acme alum starts…") is about that person, not the company. Claims they bring against the company still count.
const FORMER_SUBJECT = /^\s*(?:the\s+)?(?:ex[-‐–\s]|former\s|onetime\s|one-time\s)|^\s*\S+(?:\s+\S+)?\s+(?:alum|alumni|alumnus|alumna|alums)\b/i;
const AGAINST_COMPANY = /\b(sue[sd]?|suing|lawsuit|suit|alleg\w*|claims?|wages?|WARN|whistleblow\w*|testif\w*|accus\w*)\b/i;
export function isFormerEmployeeStory(title: string): boolean {
  const t = str(title);
  return FORMER_SUBJECT.test(t) && !AGAINST_COMPANY.test(t);
}

/** Decides whether a tagged item becomes a Signal, and says why not when it does not. */
export function judge(item: NewsItem, tag: Tag | null): { signal: Signal | null; reason: string } {
  const no = (reason: string) => ({ signal: null, reason });
  if (!tag) return no('unreadable tag');
  if (!tag.relevant) return no('not relevant');
  if (!tag.same_company) return no('not the same company');
  if (isFormerEmployeeStory(item.title)) return no('about a former employee, not the company');
  if (!(SIGNAL_TYPES as readonly string[]).includes(tag.signal_type)) return no(`type ${tag.signal_type || 'none'}`);
  if (tag.severity !== 'strong' && tag.severity !== 'weak') return no('no severity');
  if (tag.signal_type === 'exec_departure' && !EXEC_TITLE.test(item.text)) return no('exec_departure but no senior role named');
  const snippet = findVerbatim(item.text, tag.snippet);
  if (!snippet) return no('snippet guard: not an exact quote');
  return {
    reason: 'kept',
    signal: {
      type: tag.signal_type as SignalType,
      severity: tag.severity,
      date: item.date,
      title: item.title,
      snippet,
      source_name: item.source || hostOf(item.url),
      source_url: item.url,
      ...(item.date_approx ? { date_approx: true } : {}),
    },
  };
}

function toSignal(item: NewsItem, tag: Tag | null): Signal | null {
  return judge(item, tag).signal;
}

/**
 * Keeps the newest signal per type and severity, so several articles about one event
 * cannot count as several strong signals in scoring.
 */
export function capSignals(signals: Signal[]): Signal[] {
  const newestFirst = [...signals].sort((a, z) => z.date.localeCompare(a.date));
  const seen = new Set<string>();
  return newestFirst.filter((s) => {
    const key = `${s.type}|${s.severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Bright Data ----------

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function callBrightData(deps: NewsDeps, apiKey: string, targetUrl: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const request = buildBrightDataRequest(apiKey, targetUrl);
  const run = async () => {
    const res = await deps.fetch(BRIGHTDATA_ENDPOINT, { ...request, signal: controller.signal });
    if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
    return res.text();
  };
  try {
    return await withTimeout(run(), timeoutMs, 'Bright Data request');
  } finally {
    controller.abort();
  }
}

/** One Google News search -> up to MAX_ITEMS_PER_QUERY dated items from the last 180 days. Throws on failure. */
async function search(deps: NewsDeps, apiKey: string, q: NewsQuery, today: string, timeoutMs: number) {
  const url = buildNewsSearchUrl(q.query);
  const started = (deps.now ?? Date.now)();
  let data = coerceJson(await callBrightData(deps, apiKey, url, timeoutMs));
  // Bright Data occasionally answers 200 with an empty body; one retry turns that blip into an answer.
  if (!isRecord(data)) {
    const left = timeoutMs - ((deps.now ?? Date.now)() - started);
    if (left > 1_000) data = coerceJson(await callBrightData(deps, apiKey, url, left));
  }
  if (!isRecord(data)) throw new Error('unreadable search response');
  // Google's real "no results" reply is { general: { empty: true } } with no news key.
  // Anything else without a news list is a glitch, not proof there is no news.
  const empty = isRecord(data.general) && data.general.empty === true;
  if (!Array.isArray(data.news) && !Array.isArray(data.news_results) && !empty) {
    throw new Error('search response had no news results block');
  }
  return normaliseSerpJson(data)
    .map((r: NewsResult) => {
      const urlDate = dateFromUrl(r.url, today);
      return {
        ...r,
        date: urlDate ?? parseNewsDate(r.date, today),
        date_approx: !urlDate && isApproximateDate(r.date),
      };
    })
    .filter((r): r is NewsResult => r.date !== null && ageDays(r.date, today) <= MAX_AGE_DAYS)
    .slice(0, MAX_ITEMS_PER_QUERY);
}

// ---------- the pipeline ----------

type Outcome = { query: SignalType; ok: boolean; signal: Signal | null };

async function readAndTag(
  deps: NewsDeps,
  apiKey: string,
  result: NewsResult,
  query: SignalType,
  deadline: number,
): Promise<Outcome> {
  const now = deps.now ?? Date.now;
  const serpText = [result.title, result.snippet].filter(Boolean).join('\n');
  let pageText = '';
  const readTime = Math.min(PAGE_TIMEOUT_MS, deadline - now() - LLM_RESERVE_MS);
  if (readTime > 0) {
    try {
      pageText = htmlToText(await callBrightData(deps, apiKey, result.url, readTime));
    } catch {
      // Page read failed: tag using the SERP title and description only.
    }
  }
  const item: NewsItem = {
    url: result.url,
    title: result.title,
    source: result.source,
    date: result.date,
    date_approx: result.date_approx,
    text: [serpText, pageText].filter(Boolean).join('\n'),
    query,
  };
  deps.onEvent?.({ kind: 'read', url: item.url, title: item.title, source: item.source, date: item.date, query, read: !!pageText });
  try {
    const prompt = buildTagPrompt(deps.borrower, item);
    const raw = await withTimeout(
      deps.invokeLLM({ prompt, response_json_schema: TAG_SCHEMA }),
      Math.max(deadline - now(), LLM_MIN_MS),
      'Tagging call',
    );
    const tag = parseTag(raw);
    const { signal, reason } = judge(item, tag);
    deps.log?.(`${signal ? 'KEEP' : 'drop'} ${item.title.slice(0, 80)} -> ${reason}${tag?.reason ? ` | model: "${tag.reason}"` : ''}${pageText ? '' : ' (article not readable, used search preview)'}`);
    deps.onEvent?.({ kind: 'tag', url: item.url, tag, decision: signal ? 'kept' : 'dropped', why: reason, ...(signal ? { snippet: signal.snippet } : {}) });
    return { query, ok: true, signal };
  } catch (error) {
    deps.log?.(`fail ${item.title.slice(0, 80)} -> tagging failed: ${errorMessage(error)}`);
    deps.onEvent?.({ kind: 'tag', url: item.url, tag: null, decision: 'failed', why: `tagging failed: ${errorMessage(error)}` });
    return { query, ok: false, signal: null };
  }
}

/** Runs both searches, reads and tags the results, and returns verified signals. Throws on failure. */
export async function runNewsSignals(deps: NewsDeps): Promise<Signal[]> {
  const name = str(deps.borrower?.name);
  if (!name) throw new Error('News: borrower name is required');
  const apiKey = deps.apiKey;
  if (!apiKey) throw new Error('News: BRIGHTDATA_API_KEY secret not set');
  const now = deps.now ?? Date.now;
  const today = deps.today ?? isoDay(now());
  if (parseIsoDay(today) === null) throw new Error(`News: invalid today ${today}`);
  const deadline = now() + (deps.budgetMs ?? BUDGET_MS);

  const queries = buildNewsQueries(name);
  const searches = await Promise.all(
    queries.map((q) =>
      search(deps, apiKey, q, today, Math.min(SEARCH_TIMEOUT_MS, deadline - now())).then(
        (results) => ({ q, ok: true as const, results, error: '' }),
        (error: unknown) => ({ q, ok: false as const, results: [] as NewsResult[], error: errorMessage(error) }),
      ),
    ),
  );
  for (const s of searches) {
    deps.log?.(s.ok ? `1. Search ${s.q.type}: ${s.results.length} articles in the last 180 days` : `1. Search ${s.q.type} failed: ${s.error}`);
    deps.onEvent?.({ kind: 'search', query_type: s.q.type, query: s.q.query, ok: s.ok, count: s.results.length, ...(s.ok ? {} : { error: s.error }) });
  }
  const failures = searches.filter((s) => !s.ok).map((s) => `${s.q.type}: ${s.error}`);
  if (failures.length === searches.length) throw new Error(`News: both searches failed (${failures.join('; ')})`);

  // Dedupe by URL across both searches; the first search to find a URL owns it.
  const seen = new Set<string>();
  const work: Array<{ result: NewsResult; query: SignalType }> = [];
  for (const s of searches) {
    for (const result of s.results) {
      const key = normaliseUrl(result.url) ?? result.url;
      if (seen.has(key)) continue;
      seen.add(key);
      work.push({ result, query: s.q.type });
    }
  }

  deps.log?.(`2. Reading and tagging ${work.length} articles (one LLM call each)...`);
  const outcomes = await Promise.all(work.map((w) => readAndTag(deps, apiKey, w.result, w.query, deadline)));

  // A search whose every item failed to tag answered nothing; treat it like a failed search.
  const answered = searches.filter((s) => {
    if (!s.ok) return false;
    const mine = outcomes.filter((o) => o.query === s.q.type);
    return mine.length === 0 || mine.some((o) => o.ok);
  });
  if (answered.length === 0) throw new Error('News: tagging failed for every article');

  const signals = capSignals(outcomes.map((o) => o.signal).filter((s): s is Signal => s !== null));
  deps.log?.(`3. ${signals.length} signals (newest per type and severity)`);
  return signals;
}
