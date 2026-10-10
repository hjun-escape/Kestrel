// suggestCompany logic (P2): fill in the "Screen new applicant" form from a company name.
// Pure except for the injected fetch and LLM, so it runs under Node's test runner.
//
// 1. Two Google web searches via Bright Data: the company's site and HQ, and its LinkedIn / Glassdoor pages.
// 2. The LLM (Base44 InvokeLLM in the app) picks values ONLY from those results and cites which result.
// 3. Code verifies every value against the results and drops anything it cannot confirm:
//    - website_domain must be the host of a result link (not a news or directory site)
//    - linkedin_url / glassdoor_url must be real result links of the right shape
//    - hq_city must appear in the cited result's text; hq_state is kept only alongside a verified city
//    - industry is a short label taken from the results (the officer can edit it)
// A blank field is better than a wrong one: domain and city are what the news check uses to tell
// this company apart from others with a similar name.

export interface WebResult {
  title: string;
  link: string;
  description: string;
}

export type LLMParams = { prompt: string; response_json_schema: Record<string, unknown> };
export type InvokeLLM = (params: LLMParams) => Promise<unknown>;
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface Suggestion {
  value: string;
  source_url: string;
}

export interface SuggestResult {
  suggestions: Partial<Record<'website_domain' | 'industry' | 'hq_city' | 'hq_state' | 'linkedin_url' | 'glassdoor_url', Suggestion>>;
  dropped: string[]; // fields the model proposed but code could not verify, with why
}

const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const SEARCH_TIMEOUT_MS = 30_000;
const MAX_RESULTS = 10;

// Hosts that are never a company's own website.
const NOT_A_COMPANY_SITE = [
  'linkedin.com', 'glassdoor.com', 'wikipedia.org', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com',
  'youtube.com', 'crunchbase.com', 'bloomberg.com', 'reuters.com', 'zoominfo.com', 'indeed.com', 'yelp.com',
  'google.com', 'apple.com', 'tiktok.com', 'reddit.com', 'cnbc.com', 'forbes.com', 'yahoo.com', 'pitchbook.com',
  'dnb.com', 'bbb.org', 'opencorporates.com', 'craft.co', 'cbinsights.com', 'owler.com', 'macrotrends.net',
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const isCompanySiteHost = (host: string) =>
  !!host && host.includes('.') && !NOT_A_COMPANY_SITE.some((d) => host === d || host.endsWith(`.${d}`));

// "investors.rivian.com" -> "rivian.com" (keeps two-part public suffixes like "co.uk").
export function rootDomain(host: string): string {
  const parts = host.split('.');
  const twoPart = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoPart ? -3 : -2).join('.');
}

export function normaliseLinkedIn(url: string): string | null {
  const m = /^https?:\/\/(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/company\/([^/?#]+)/i.exec(url.trim());
  return m ? `https://www.linkedin.com/company/${m[1]}` : null;
}

export function normaliseGlassdoor(url: string): string | null {
  const m = /^https?:\/\/(?:www\.)?glassdoor\.[a-z.]+\/(Overview|Reviews)\/[^?#]+\.htm/i.exec(url.trim());
  return m ? m[0].replace(/^http:/, 'https:') : null;
}

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function buildQueries(name: string): string[] {
  const n = `"${name.replace(/"/g, '').trim()}"`;
  return [`${n} company headquarters official website`, `${n} linkedin glassdoor`];
}

async function search(query: string, fetchFn: FetchLike, apiKey: string): Promise<WebResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&brd_json=1`;
  const res = await fetchFn(BRIGHTDATA_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: 'mcp_unlocker', url, format: 'raw' }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
  let data: unknown;
  try {
    data = JSON.parse(await res.text());
  } catch {
    return [];
  }
  const organic = ((data as { organic?: unknown[] })?.organic ?? []) as Record<string, unknown>[];
  return organic
    .map((o) => ({ title: String(o.title ?? ''), link: String(o.link ?? ''), description: String(o.description ?? '') }))
    .filter((r) => /^https?:\/\//.test(r.link))
    .slice(0, MAX_RESULTS);
}

export const SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    website_domain: { type: 'string' },
    website_result: { type: 'integer' },
    industry: { type: 'string' },
    industry_result: { type: 'integer' },
    hq_city: { type: 'string' },
    hq_state: { type: 'string' },
    hq_result: { type: 'integer' },
    linkedin_result: { type: 'integer' },
    glassdoor_result: { type: 'integer' },
  },
  required: ['website_domain', 'website_result', 'industry', 'industry_result', 'hq_city', 'hq_state', 'hq_result', 'linkedin_result', 'glassdoor_result'],
};

export function buildPrompt(name: string, results: WebResult[]): string {
  return [
    `Fill in a bank's company form for "${name}" using ONLY the search results below. Never use outside knowledge.`,
    'For each field give the value and the index [n] of the result that shows it. Use "" and -1 when no result shows it.',
    '- website_domain: the company\'s own website domain, e.g. "acme.com" (not a news, social or directory site).',
    '- industry: a short label of 1-3 words, e.g. "Electric vehicles", "Packaging".',
    '- hq_city and hq_state: the headquarters city and US state (2-letter code, or the country if outside the US).',
    '- linkedin_result: the result that is this company\'s LinkedIn company page (linkedin.com/company/...).',
    '- glassdoor_result: the result that is this company\'s Glassdoor page.',
    'If results are about several different companies with this name, use the most prominent one.',
    '',
    ...results.map((r, i) => `[${i}] ${r.link}\n${r.title}\n${r.description}`),
  ].join('\n');
}

function coerce(raw: unknown): Record<string, unknown> | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Checks the model's picks against the results. Exported for tests. */
export function verify(name: string, results: WebResult[], raw: unknown): SuggestResult {
  const out: SuggestResult = { suggestions: {}, dropped: [] };
  const data = coerce(raw);
  if (!data) {
    out.dropped.push('unreadable model reply');
    return out;
  }
  const at = (key: string) => {
    const i = Number(data[key]);
    return Number.isInteger(i) && i >= 0 && i < results.length ? results[i] : null;
  };
  const text = (r: WebResult) => `${r.title}\n${r.description}`;

  // Website: the cited result's host must be the proposed domain (or a subdomain of it).
  const domain = String(data.website_domain ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (domain) {
    const r = at('website_result');
    const host = r ? hostOf(r.link) : '';
    if (r && isCompanySiteHost(host) && (host === domain || host.endsWith(`.${domain}`)) && rootDomain(host) === rootDomain(domain)) {
      out.suggestions.website_domain = { value: rootDomain(domain), source_url: r.link };
    } else {
      out.dropped.push(`website_domain "${domain}": not the site of a cited result`);
    }
  }

  // HQ: the city must appear in the cited result's text.
  const city = String(data.hq_city ?? '').trim();
  const state = String(data.hq_state ?? '').trim();
  if (city) {
    const r = at('hq_result');
    if (r && norm(text(r)).includes(norm(city))) {
      out.suggestions.hq_city = { value: city, source_url: r.link };
      if (state && state.length <= 20) out.suggestions.hq_state = { value: state, source_url: r.link };
    } else {
      out.dropped.push(`hq_city "${city}": not in the cited result`);
    }
  }

  const industry = String(data.industry ?? '').trim();
  if (industry) {
    const r = at('industry_result');
    if (r && industry.split(/\s+/).length <= 4 && industry.length <= 40) out.suggestions.industry = { value: industry, source_url: r.link };
    else out.dropped.push(`industry "${industry}": no cited result or too long`);
  }

  // Profiles: must be real result links. Fall back to the first matching link whose title names the company.
  const nameWord = norm(name).split(' ')[0] ?? '';
  const pick = (key: string, normalise: (u: string) => string | null) => {
    const cited = at(key);
    const cand = cited && normalise(cited.link) ? cited : results.find((r) => normalise(r.link) && norm(r.title).includes(nameWord));
    return cand ? { value: normalise(cand.link)!, source_url: cand.link } : null;
  };
  const li = pick('linkedin_result', normaliseLinkedIn);
  if (li) out.suggestions.linkedin_url = li;
  const gd = pick('glassdoor_result', normaliseGlassdoor);
  if (gd) out.suggestions.glassdoor_url = gd;

  return out;
}

export async function suggestCompany(deps: { name: string; fetch: FetchLike; apiKey: string | undefined; invokeLLM: InvokeLLM }): Promise<SuggestResult> {
  const name = deps.name.trim();
  if (!name) throw new Error('Enter the company name first.');
  if (!deps.apiKey) throw new Error('BRIGHTDATA_API_KEY secret not set');
  const lists = await Promise.all(buildQueries(name).map((q) => search(q, deps.fetch, deps.apiKey!).catch(() => [] as WebResult[])));
  const seen = new Set<string>();
  const results = lists.flat().filter((r) => (seen.has(r.link) ? false : (seen.add(r.link), true)));
  if (results.length === 0) return { suggestions: {}, dropped: ['no search results'] };
  const raw = await deps.invokeLLM({ prompt: buildPrompt(name, results), response_json_schema: SUGGEST_SCHEMA });
  return verify(name, results, raw);
}
