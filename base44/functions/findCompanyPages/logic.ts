// findCompanyPages: find a borrower's LinkedIn company page and Glassdoor reviews page from its name, website
// domain and city, so "Screen new applicant" can run the Jobs and Reviews checks without the officer typing URLs.
//
// Input:  { borrower: { name, website_domain, hq_city?, hq_state?, linkedin_url?, glassdoor_url? } }
// Output: { linkedin_url, glassdoor_url, linkedin, glassdoor, notes }
//   linkedin / glassdoor: 'user'      the borrower already had this URL; it is returned unchanged, never replaced
//                         'found'     found by search and verified (URL returned)
//                         'not_found' no search result passed verification (URL null)
//                         'error'     a Bright Data call failed or timed out (URL null)
//   notes: short human-readable lines saying what was checked.
// Always 200 with that shape, except 400 for invalid input. Total time stays under ~60 s.
//
// How it decides (CLAUDE.md: "If unsure, same_company = false". An empty field is better than the wrong company):
//   1. Search: Google web search through Bright Data SERP, same request as newsSignals/linkedin.ts searchWeb
//      (zone mcp_unlocker, https://api.brightdata.com/request, &hl=en&gl=us&brd_json=1, results under `organic`).
//   2. Pick: LinkedIn https://<sub>.linkedin.com/company/<slug> (country subdomains -> www, query and sub-path
//      dropped; jobs/people/posts/life and showcase pages skipped). Glassdoor glassdoor.<tld>/Reviews/
//      <Name>-Reviews-E<id>.htm only (location/job-filtered or paged variants skipped), rewritten to glassdoor.com.
//   3. Verify LinkedIn: the "LinkedIn company information" dataset (the lookup hiringSignal already makes, ~3 s)
//      must list a website whose registrable domain equals the one the officer entered.
//   4. Verify Glassdoor: the repo has no Glassdoor company dataset with a website, so a Glassdoor page is accepted
//      only when its company name (from the URL) equals the name on a LinkedIn page whose website matched step 3.
//
// Needs the Base44 secret BRIGHTDATA_API_KEY (Deno.env.get, never in code). Pure helpers below have no Deno globals.

export interface Borrower {
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
  linkedin_url?: string | null;
  glassdoor_url?: string | null;
  [k: string]: unknown;
}

export type PageStatus = 'user' | 'found' | 'not_found' | 'error';

export interface FindResult {
  linkedin_url: string | null;
  glassdoor_url: string | null;
  linkedin: PageStatus;
  glassdoor: PageStatus;
  notes: string[];
}

export interface WebResult {
  title: string;
  link: string;
  description: string;
}

export interface LinkedInCompany {
  url: string;
  /** The page we asked for (Bright Data echoes it as input.url); LinkedIn may redirect `url` to another slug. */
  inputUrl: string;
  name: string;
  website: string | null;
}

type FetchResponse = { ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> };
export type FetchLike = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<FetchResponse>;

export interface Deps {
  fetch: FetchLike;
  apiKey: string;
  zone?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const SERP_ENDPOINT = 'https://api.brightdata.com/request';
const SERP_ZONE = 'mcp_unlocker';
const DATASETS_API = 'https://api.brightdata.com/datasets/v3';
// Same dataset hiringSignal/entry.ts uses (COMPANY_DATASET_ID, "LinkedIn company information").
export const LINKEDIN_COMPANY_DATASET_ID = 'gd_l1vikfnt1wgvvqz95w';

const SERP_TIMEOUT_MS = 20_000;
const COMPANY_TIMEOUT_MS = 30_000;
const TOTAL_BUDGET_MS = 55_000;
const POLL_EVERY_MS = 3_000;
const MAX_LINKEDIN_CANDIDATES = 2;

// ---------- pure helpers ----------

/** Host of a URL or bare domain, lowercased, without "www." or port; null if it is not one. */
export function hostOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\d*\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

// Second-level suffixes where the registrable domain has three labels (example.co.uk).
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.in', 'co.kr',
  'com.br', 'com.mx', 'com.sg', 'com.hk', 'com.cn', 'co.za', 'com.tr', 'com.ar',
]);

/** Registrable domain: "careers.gravie.com" -> "gravie.com", "shop.acme.co.uk" -> "acme.co.uk". */
export function registrableDomain(host: string): string {
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * True when the page's website is the domain the officer entered, or a subdomain of it
 * ("careers.gravie.com" for "gravie.com"). Comparing registrable domains is not enough: on shared
 * hosts (github.io, vercel.app, base44.app) any other site on the same suffix would match.
 */
export function domainMatches(website: unknown, enteredDomain: unknown): boolean {
  const a = hostOf(website);
  const b = hostOf(enteredDomain);
  return !!a && !!b && (a === b || a.endsWith(`.${b}`));
}

/** Company name compared loosely: case, punctuation, hyphens and legal suffixes ignored. */
export function normalizeName(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|lp|llp)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LINKEDIN_COMPANY = /^https?:\/\/(?:(?:[a-z]{2,3}|www)\.)?linkedin\.com\/company\/([^/?#]+)(\/[^?#]*)?/i;
const LINKEDIN_SKIP_SUBPAGES = /^\/(jobs|people|posts|life)(\/|$)/i;

/** A LinkedIn company page URL normalized to https://www.linkedin.com/company/<slug>, or null if the shape is wrong. */
export function linkedinCompanyUrl(link: string): string | null {
  const m = LINKEDIN_COMPANY.exec(link.trim());
  if (!m) return null;
  const sub = m[2] ?? '';
  if (LINKEDIN_SKIP_SUBPAGES.test(sub)) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9-_.%]*$/i.test(slug)) return null;
  return `https://www.linkedin.com/company/${encodeURIComponent(slug)}`;
}

/** Up to `max` distinct LinkedIn company pages from search results, in rank order. Showcase pages never match. */
export function pickLinkedInCandidates(results: WebResult[], max = MAX_LINKEDIN_CANDIDATES): string[] {
  const out: string[] = [];
  for (const r of results) {
    const url = linkedinCompanyUrl(r.link);
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

// Glassdoor's own sites. Anything else is ignored, so a look-alike host such as glassdoor.com.evil
// cannot pass a chosen company slug (checked below) with a different company's E-number.
const GLASSDOOR_HOSTS = new Set([
  'glassdoor.com', 'glassdoor.co.uk', 'glassdoor.ca', 'glassdoor.com.au', 'glassdoor.co.in', 'glassdoor.ie',
  'glassdoor.co.nz', 'glassdoor.sg', 'glassdoor.com.hk', 'glassdoor.de', 'glassdoor.fr', 'glassdoor.nl',
  'glassdoor.be', 'glassdoor.at', 'glassdoor.ch', 'glassdoor.es', 'glassdoor.it', 'glassdoor.com.br',
  'glassdoor.com.mx', 'glassdoor.com.ar',
]);
const GLASSDOOR_REVIEWS_PATH = /^\/Reviews\/([A-Za-z0-9-]+)-Reviews-E(\d+)\.htm$/;

/** A Glassdoor company reviews page rewritten to glassdoor.com, or null for any other shape or host. */
export function glassdoorReviewsUrl(link: string): { url: string; companySlug: string } | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.port) return null;
  if (!GLASSDOOR_HOSTS.has(u.hostname.toLowerCase().replace(/^www\./, ''))) return null;
  const m = GLASSDOOR_REVIEWS_PATH.exec(u.pathname);
  if (!m) return null;
  return { url: `https://www.glassdoor.com/Reviews/${m[1]}-Reviews-E${m[2]}.htm`, companySlug: m[1] };
}

/** The first Glassdoor company reviews page in rank order. */
export function pickGlassdoor(results: WebResult[]): { url: string; companySlug: string } | null {
  for (const r of results) {
    const hit = glassdoorReviewsUrl(r.link);
    if (hit) return hit;
  }
  return null;
}

/** Company name as Glassdoor writes it in the URL: "Acme-Widgets" -> "acme widgets". */
export function glassdoorCompanyName(companySlug: string): string {
  return normalizeName(companySlug.replace(/-/g, ' '));
}

// The website field name in the LinkedIn company dataset is not shown in this repo's fixtures; read the
// likely spellings and take the first that parses as a domain.
const WEBSITE_KEYS = ['website', 'website_simplified', 'company_website', 'domain'];

/** Bright Data company record -> LinkedInCompany, or null for error records and anything malformed. */
export function toLinkedInCompany(raw: unknown): LinkedInCompany | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if ('error' in r || 'error_code' in r) return null;
  const website = WEBSITE_KEYS.map((k) => r[k]).find((v) => hostOf(v) !== null);
  const own = typeof r.url === 'string' ? linkedinCompanyUrl(r.url) : null;
  const inputRaw = r.input && typeof r.input === 'object' ? (r.input as Record<string, unknown>).url : r.input_url;
  const input = typeof inputRaw === 'string' ? linkedinCompanyUrl(inputRaw) : null;
  return {
    url: own ?? input ?? '',
    inputUrl: input ?? own ?? '',
    name: typeof r.name === 'string' ? r.name.trim() : '',
    website: typeof website === 'string' ? website.trim() : null,
  };
}

/** Bright Data organic results -> WebResult[]; anything malformed is dropped. */
export function toWebResults(body: unknown): WebResult[] {
  const organic = body && typeof body === 'object' ? (body as { organic?: unknown }).organic : undefined;
  if (!Array.isArray(organic)) return [];
  return organic.flatMap((o) => {
    if (!o || typeof o !== 'object') return [];
    const r = o as Record<string, unknown>;
    const link = typeof r.link === 'string' ? r.link : typeof r.url === 'string' ? r.url : '';
    if (!/^https?:\/\//i.test(link)) return [];
    return [{ title: String(r.title ?? ''), link, description: String(r.description ?? '') }];
  });
}

export function linkedinQuery(b: Borrower): string {
  return [`"${b.name.trim()}"`, b.hq_city?.trim(), 'LinkedIn'].filter(Boolean).join(' ');
}

/** Second try when the first search shows no company page: LinkedIn company pages only, name only. */
export function linkedinFallbackQuery(b: Borrower): string {
  return `site:linkedin.com/company "${b.name.trim()}"`;
}

export function glassdoorQuery(b: Borrower): string {
  return `"${b.name.trim()}" Glassdoor reviews`;
}

// ---------- Bright Data calls (fetch injected for tests) ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function searchWeb(query: string, deps: Deps): Promise<WebResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&brd_json=1`;
  const res = await deps.fetch(SERP_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: deps.zone ?? SERP_ZONE, url, format: 'raw' }),
    signal: AbortSignal.timeout(SERP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  return toWebResults(await res.json());
}

// Bright Data snapshot ids look like "sd_mv2ukg5rk1k28ztor"; anything else is refused before it reaches a URL path.
function checkSnapshotId(id: unknown): string {
  if (typeof id !== 'string' || !/^sd?_[a-z0-9]{4,40}$/.test(id)) throw new Error('invalid snapshot_id');
  return encodeURIComponent(id);
}

/** LinkedIn company information for up to MAX_LINKEDIN_CANDIDATES pages in one call (usually ~3 s). */
export async function fetchLinkedInCompanies(urls: string[], deps: Deps, deadline: number): Promise<LinkedInCompany[]> {
  if (urls.length === 0) return [];
  const now = deps.now ?? Date.now;
  const headers = { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' };
  const timeout = () => AbortSignal.timeout(Math.max(1_000, Math.min(COMPANY_TIMEOUT_MS, deadline - now())));
  const qs = new URLSearchParams({ dataset_id: LINKEDIN_COMPANY_DATASET_ID, format: 'json', include_errors: 'true' });
  const res = await deps.fetch(`${DATASETS_API}/scrape?${qs}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input: urls.map((url) => ({ url })) }),
    signal: timeout(),
  });
  if (!res.ok && res.status !== 202) throw new Error(`LinkedIn company lookup HTTP ${res.status}`);
  let body = await res.json();
  if (res.status === 202) {
    const id = checkSnapshotId((body as { snapshot_id?: unknown })?.snapshot_id);
    body = null;
    while (now() + POLL_EVERY_MS < deadline) {
      await (deps.sleep ?? sleep)(POLL_EVERY_MS);
      const p = await deps.fetch(`${DATASETS_API}/progress/${id}`, { headers, signal: timeout() });
      const progress = (await p.json()) as { status?: string };
      if (progress?.status === 'failed') throw new Error('LinkedIn company lookup failed');
      if (progress?.status === 'ready') {
        const snap = await deps.fetch(`${DATASETS_API}/snapshot/${id}?format=json`, { headers, signal: timeout() });
        if (snap.status !== 202) body = await snap.json();
        if (Array.isArray(body)) break;
      }
    }
    if (!Array.isArray(body)) throw new Error('LinkedIn company lookup timed out');
  }
  const rows = Array.isArray(body) ? body : [body];
  return rows.map(toLinkedInCompany).filter((c): c is LinkedInCompany => c !== null);
}

// ---------- orchestration ----------

export async function findCompanyPages(b: Borrower, deps: Deps): Promise<FindResult> {
  const now = deps.now ?? Date.now;
  const deadline = now() + TOTAL_BUDGET_MS;
  const notes: string[] = [];
  const domain = hostOf(b.website_domain);
  const result: FindResult = { linkedin_url: null, glassdoor_url: null, linkedin: 'not_found', glassdoor: 'not_found', notes };

  const userLinkedIn = typeof b.linkedin_url === 'string' && b.linkedin_url.trim() ? b.linkedin_url.trim() : null;
  const userGlassdoor = typeof b.glassdoor_url === 'string' && b.glassdoor_url.trim() ? b.glassdoor_url.trim() : null;
  if (userLinkedIn) {
    result.linkedin = 'user';
    result.linkedin_url = userLinkedIn;
  }
  if (userGlassdoor) {
    result.glassdoor = 'user';
    result.glassdoor_url = userGlassdoor;
  }
  if (userLinkedIn && userGlassdoor) return result;

  if (!domain) {
    notes.push('No website domain to verify against, so nothing was searched.');
    return result;
  }

  // Both searches in parallel; only for the pages that are missing.
  const [linkedinSearch, glassdoorSearch] = await Promise.allSettled([
    userLinkedIn ? Promise.resolve<WebResult[]>([]) : searchWeb(linkedinQuery(b), deps),
    userGlassdoor ? Promise.resolve<WebResult[]>([]) : searchWeb(glassdoorQuery(b), deps),
  ]);

  // LinkedIn pages to look up: the user's own (to learn its name for the Glassdoor check) or the top candidates.
  let candidates: string[] = [];
  if (userLinkedIn) {
    const own = linkedinCompanyUrl(userLinkedIn);
    if (own && !userGlassdoor) candidates = [own];
  } else if (linkedinSearch.status === 'rejected') {
    result.linkedin = 'error';
    notes.push(`LinkedIn search failed: ${(linkedinSearch.reason as Error)?.message ?? linkedinSearch.reason}`);
  } else {
    candidates = pickLinkedInCandidates(linkedinSearch.value);
    if (candidates.length === 0) {
      // Names with apostrophes or a city that is not on the page can hide the company page; try once more.
      try {
        candidates = pickLinkedInCandidates(await searchWeb(linkedinFallbackQuery(b), deps));
      } catch (e) {
        notes.push(`LinkedIn second search failed: ${(e as Error)?.message ?? e}`);
      }
      if (candidates.length === 0) notes.push('LinkedIn: no company page in the search results.');
    }
  }

  let verified: LinkedInCompany | null = null;
  if (candidates.length > 0) {
    try {
      const companies = await fetchLinkedInCompanies(candidates, deps, deadline);
      // Keep rank order: the first candidate whose listed website matches the entered domain wins.
      for (const url of candidates) {
        const c = companies.find((x) => x.inputUrl === url || x.url === url) ?? (candidates.length === 1 ? companies[0] : undefined);
        if (!c) continue;
        if (domainMatches(c.website, domain)) {
          verified = { ...c, url };
          break;
        }
        notes.push(`LinkedIn: ${url} lists ${c.website ? hostOf(c.website) : 'no website'}, not ${domain}.`);
      }
      if (!userLinkedIn) {
        if (verified) {
          result.linkedin = 'found';
          result.linkedin_url = verified.url;
          notes.push(`LinkedIn: ${verified.url} lists ${hostOf(verified.website)}, which matches ${domain}.`);
        } else {
          result.linkedin = 'not_found';
        }
      }
    } catch (e) {
      if (!userLinkedIn) result.linkedin = 'error';
      notes.push(`LinkedIn company lookup failed: ${(e as Error).message}`);
    }
  }

  if (!userGlassdoor) {
    if (glassdoorSearch.status === 'rejected') {
      result.glassdoor = 'error';
      notes.push(`Glassdoor search failed: ${(glassdoorSearch.reason as Error)?.message ?? glassdoorSearch.reason}`);
    } else {
      const hit = pickGlassdoor(glassdoorSearch.value);
      if (!hit) {
        notes.push('Glassdoor: no company reviews page in the search results.');
      } else if (!verified || !verified.name) {
        notes.push(`Glassdoor: ${hit.url} not used, because no LinkedIn page with a matching website confirmed the company name.`);
      } else if (glassdoorCompanyName(hit.companySlug) === normalizeName(verified.name)) {
        result.glassdoor = 'found';
        result.glassdoor_url = hit.url;
        notes.push(`Glassdoor: ${hit.url} matches the verified LinkedIn name "${verified.name}".`);
      } else {
        notes.push(`Glassdoor: ${hit.url} names a different company than "${verified.name}".`);
      }
    }
  }

  return result;
}
