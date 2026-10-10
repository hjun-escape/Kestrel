// Copied from analyzeBorrower/logic.ts: Base44 bundles each function folder separately
// (no imports across function folders). Keep in sync with the original.
// Pure: no npm: imports and no Deno globals.

export interface NewsResult {
  title: string;
  url: string;
  source: string;
  date: string;
  snippet: string;
}

export interface LLMParams {
  prompt: string;
  response_json_schema: object;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export const PAGE_TEXT_CAP = 15_000;
const MAX_SEARCH_RESULTS = 10;

export const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const BRIGHTDATA_ZONE = 'mcp_unlocker';

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse an LLM reply that may be an object, a JSON string, or JSON wrapped in prose/fences. */
export function coerceJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Canonical form of an http(s) URL for comparison, or null if it is not one. */
export function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';
  return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
}

/** Whitespace-normalised, case-insensitive form used for quote matching. */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function buildBrightDataRequest(apiKey: string, targetUrl: string) {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: BRIGHTDATA_ZONE, url: targetUrl, format: 'raw' }),
  };
}

/** Bright Data SERP JSON (results under `news`) -> NewsResult[]. Skips anything malformed. */
export function normaliseSerpJson(raw: unknown): NewsResult[] {
  const data = coerceJson(raw);
  if (!isRecord(data)) return [];
  const list = Array.isArray(data.news) ? data.news : Array.isArray(data.news_results) ? data.news_results : [];
  const results: NewsResult[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const title = str(item.title);
    const url = str(item.link) || str(item.url);
    if (!title || !normaliseUrl(url)) continue;
    const source = isRecord(item.source) ? str(item.source.name) : str(item.source) || str(item.source_name);
    results.push({
      title,
      url,
      source,
      date: str(item.date),
      snippet: str(item.description) || str(item.snippet),
    });
    if (results.length >= MAX_SEARCH_RESULTS) break;
  }
  return results;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
  copy: '©', reg: '®', trade: '™', middot: '·', bull: '•',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    const lower = code.toLowerCase();
    if (lower === 'amp') return '&';
    return NAMED_ENTITIES[lower] ?? match;
  });
}

/** HTML -> readable text: drops scripts/styles, tags and entities, collapses whitespace, caps length. */
export function htmlToText(html: string, cap: number = PAGE_TEXT_CAP): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().slice(0, cap);
}

