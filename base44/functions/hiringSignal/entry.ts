// hiringSignal (P3): open job postings now vs what a company of this size and industry normally has open.
// Expected openings = employees x the industry's job-openings rate (BLS JOLTS). Postings >= 75% below expected
// = strong, 50-75% below = weak. Skipped when fewer than MIN_EXPECTED openings would be normal (too small to judge).
//
// Why not "last 30 days vs prior 60": LinkedIn only lists open postings, so older ones have already been taken
// down and the earlier window is nearly always empty (seen live on Gravie: 34 recent, 0 prior).
//
// Input:  { borrower: Borrower, today?: "YYYY-MM-DD", snapshot_id?: string }  (refreshBorrower sends { borrower })
// Output: Signal[] (0 or 1 hiring_drop). Never writes status.
// On failure it throws an Error whose message starts with "Jobs" (the sources_unavailable value).
// If Bright Data is still building the company snapshot, the error carries snapshot_id so a later call can resume.
//
// Data (Bright Data, confirmed live 2026-10-10), about 5-10 s in total:
//   1. LinkedIn company information dataset, collected by URL (~3 s): employees_in_linkedin, industries, company_id.
//   2. LinkedIn's public jobs page for that company_id, through the Web Unlocker (~2-6 s). Its title states the exact
//      open count, e.g. "Jobs at Gravie in Worldwide (34 Open Roles)". A company with none has no count in the
//      title and a no-results list. Anything else (blocked page, new layout) fails as Jobs unavailable.
// This replaced the LinkedIn job listings dataset (~40 s, and capped at 200 results: Rivian has 994 open roles but
// was counted as 200 and wrongly flagged).
// Known limits: a company that posts jobs only on its own site or Indeed looks like it is not hiring, and
// employees_in_linkedin undercounts staff who are not on LinkedIn.

export interface Borrower {
  id?: string;
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
  industry?: string;
  linkedin_url?: string;
}

export interface Signal {
  borrower_id?: string;
  type: "hiring_drop";
  severity: "strong" | "weak";
  date: string;
  title: string;
  snippet: string;
  source_name: string;
  source_url: string;
}

export interface Company {
  employees_in_linkedin?: unknown;
  company_size?: unknown;
  industries?: unknown;
  company_id?: unknown;
  [k: string]: unknown;
}

const API = "https://api.brightdata.com/datasets/v3";
const UNLOCKER = "https://api.brightdata.com/request";
const UNLOCKER_ZONE = "mcp_unlocker"; // same zone as newsSignals
export const COMPANY_DATASET_ID = "gd_l1vikfnt1wgvvqz95w"; // "LinkedIn company information"
// refreshBorrower gives each source 120 s: up to ~60 s for the sync scrape plus this budget.
const POLL_BUDGET_MS = 50_000;
const POLL_EVERY_MS = 10_000;

// ---------- pure logic (tested) ----------

// Job openings rate by industry, % of employment. BLS JOLTS, March 2026:
// https://www.bls.gov/opub/ted/2026/job-openings-rate-2-3-percent-in-wholesale-trade-5-5-percent-in-accommodation-and-food-services.htm
// Matched against the LinkedIn industry text in order; the first match wins.
export const INDUSTRY_RATES: { sector: string; rate: number; re: RegExp }[] = [
  { sector: "Manufacturing", rate: 3.5, re: /manufactur|machinery|automotive|chemical|plastics|packaging|semiconductor/ },
  { sector: "Wholesale trade", rate: 2.3, re: /wholesale/ },
  { sector: "Professional and business services", rate: 4.2, re: /consult|legal|law practice|accounting|staffing|recruit|advertising|marketing|it services|engineering services|architecture|design services|business services|security and investigations/ },
  { sector: "Accommodation and food services", rate: 5.5, re: /restaurant|food and beverage services|food & beverages|hospitality|hotel|accommodation/ },
  { sector: "Health care and social assistance", rate: 5.4, re: /hospital|health|medical|wellness|mental health|nursing|individual and family services|social/ },
  { sector: "Financial activities", rate: 5.1, re: /insurance|bank|financial|credit|investment|capital markets|real estate|leasing/ },
  { sector: "Arts, entertainment, and recreation", rate: 4.7, re: /entertainment|recreation|sports|fitness|gambling|museum|performing arts/ },
  { sector: "Retail trade", rate: 4.6, re: /retail/ },
  { sector: "Transportation, warehousing, and utilities", rate: 4.0, re: /transport|logistics|trucking|freight|warehous|airline|aviation|utilities|maritime/ },
  { sector: "Mining and logging", rate: 3.2, re: /mining|oil|gas|forestry|logging/ },
  { sector: "Information", rate: 2.8, re: /software|internet|information|media|publishing|telecom|broadcast|data infrastructure/ },
  { sector: "Construction", rate: 2.6, re: /construction|building|civil engineering|contractor/ },
  { sector: "Private educational services", rate: 2.6, re: /education|e-learning|training/ },
];
export const ALL_INDUSTRIES = { sector: "All industries", rate: 4.1 };

export function industryRate(industry: unknown): { sector: string; rate: number } {
  const text = String(industry ?? "").toLowerCase();
  const hit = text ? INDUSTRY_RATES.find((r) => r.re.test(text)) : undefined;
  return hit ? { sector: hit.sector, rate: hit.rate } : ALL_INDUSTRIES;
}

// employees_in_linkedin, or the middle of LinkedIn's size band ("201-500 employees" -> 350, "10,001+" -> 10001).
export function employeeCount(c: Company): number | null {
  const n = Number(c.employees_in_linkedin);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  const m = /([\d,]+)\s*(?:-\s*([\d,]+))?/.exec(String(c.company_size ?? ""));
  if (!m) return null;
  const lo = Number(m[1].replace(/,/g, ""));
  const hi = m[2] ? Number(m[2].replace(/,/g, "")) : lo;
  return lo > 0 ? Math.round((lo + hi) / 2) : null;
}

function linkedinSlug(url?: string): string | null {
  const m = /linkedin\.com\/company\/([^/?#]+)/i.exec(url ?? "");
  return m ? m[1].toLowerCase() : null;
}

// LinkedIn's public jobs page for one company. f_C filters to that company exactly; geoId 92000000 = worldwide.
export function jobsPageUrl(companyId: string): string {
  return `https://www.linkedin.com/jobs/search?f_C=${encodeURIComponent(companyId)}&geoId=92000000`;
}

// The open-role count from that page. LinkedIn serves two layouts (both seen live 2026-10-10):
//   A: title "Jobs at Gravie in Worldwide (34 Open Roles)"; with none: "Jobs at X in Worldwide" + a no-results list
//   B: title "34 Jobs jobs in Worldwide";                     with none: "0 Jobs jobs in Worldwide" + no-results
// With openings both also carry a results-context-header__job-count element. Read that first, then either title
// form, then no-results as 0. Anything else (sign-in wall, new layout) throws rather than reading as 0.
export function parseOpenRoles(html: string): number {
  const num = (s: string) => Number(s.replace(/[,+\s]/g, ""));
  const span = /results-context-header__job-count[^>]*>\s*([\d,]+)\+?\s*</.exec(html);
  if (span) return num(span[1]);
  const title = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const a = /\(([\d,]+)\+?\s+Open Roles?\)/i.exec(title);
  if (a) return num(a[1]);
  const b = /^([\d,]+)\+?\s+.*\bjobs?\s+in\b/i.exec(title);
  if (b) return num(b[1]);
  if (/\bjobs?\b/i.test(title) && /no-results/.test(html)) return 0;
  throw new Error(`Jobs: could not read the open-role count from LinkedIn (title: ${title.slice(0, 80) || "none"})`);
}

// Below this many expected openings a gap is noise (a 60-person company "should" have ~2.5).
export const MIN_EXPECTED = 5;

export interface HiringGap {
  open: number;
  employees: number;
  sector: string;
  rate: number;
  expected: number;
  gapPct: number; // % below expected; negative = more postings than expected
}

export function hiringGap(open: number, employees: number, industry: unknown): HiringGap {
  const { sector, rate } = industryRate(industry);
  const expected = (employees * rate) / 100;
  const gapPct = Math.round((1 - open / expected) * 100);
  return { open, employees, sector, rate, expected, gapPct };
}

export function hiringSignalFromData(b: Borrower, open: number, company: Company, today: string): Signal[] {
  const employees = employeeCount(company);
  if (employees === null) throw new Error("Jobs: LinkedIn company page has no employee count");
  const g = hiringGap(open, employees, company.industries ?? b.industry);
  if (g.expected < MIN_EXPECTED || g.gapPct < 50) return [];
  return [
    {
      borrower_id: b.id,
      type: "hiring_drop",
      severity: g.gapPct >= 75 ? "strong" : "weak",
      date: today,
      title: `Job postings ${g.gapPct}% below normal for company size`,
      snippet: `${g.open} open postings vs ~${Math.round(g.expected)} expected for ${g.employees} employees (${g.sector}: ${g.rate}% openings rate, BLS)`,
      source_name: "LinkedIn Jobs",
      source_url: company.company_id ? jobsPageUrl(String(company.company_id)) : "https://www.linkedin.com/jobs/",
    },
  ];
}

// ---------- Bright Data (network) ----------

export class JobsPendingError extends Error {
  snapshot_id: string;
  constructor(snapshot_id: string) {
    super(`Jobs: snapshot ${snapshot_id} not ready`);
    this.snapshot_id = snapshot_id;
  }
}

// Bright Data snapshot ids look like "sd_mv2ukg5rk1k28ztor". Anything else is refused, so a caller can never steer
// our API key to another Bright Data endpoint through the path.
export function checkSnapshotId(id: unknown): string {
  if (typeof id !== "string" || !/^sd?_[a-z0-9]{4,40}$/.test(id)) throw new Error("Jobs: invalid snapshot_id");
  return id;
}

const NOT_READY = new Set(["building", "running", "starting", "collecting", "digesting", "scheduled"]);

function isNotReady(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as { status?: unknown; message?: unknown };
  return NOT_READY.has(String(b.status)) || /not ready/i.test(String(b.message ?? ""));
}

// A Bright Data reply must be a list holding at least one real record. Error records (include_errors), an empty
// list, or any other shape is a failure, so refreshBorrower keeps the old signals and marks Jobs unavailable
// instead of replacing them with "nothing found".
export function usableRecords(body: unknown): Company[] {
  if (!Array.isArray(body)) throw new Error(`Jobs: unexpected Bright Data reply ${JSON.stringify(body).slice(0, 120)}`);
  const records = body.filter((r) => r && typeof r === "object" && !("error" in r) && !("error_code" in r));
  if (records.length === 0) {
    const firstError = body.find((r) => r && typeof r === "object" && ("error" in r || "error_code" in r));
    throw new Error(`Jobs: Bright Data returned no records${firstError ? `: ${String(firstError.error ?? firstError.error_code)}` : ""}`);
  }
  return records;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bd(apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(75_000),
  });
  if (!res.ok && res.status !== 202) throw new Error(`Jobs: Bright Data ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function waitForSnapshot(apiKey: string, rawId: unknown): Promise<Company[]> {
  const id = encodeURIComponent(checkSnapshotId(rawId));
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    const p = await (await bd(apiKey, `/progress/${id}`)).json();
    if (p.status === "failed") throw new Error(`Jobs: snapshot ${id} failed`);
    if (p.status === "ready") {
      // The download can still answer "not ready" for a moment after progress says ready.
      const res = await bd(apiKey, `/snapshot/${id}?format=json`);
      const body = res.status === 202 ? { status: "building" } : await res.json();
      if (!isNotReady(body)) return usableRecords(body);
    }
    await sleep(POLL_EVERY_MS);
  }
  throw new JobsPendingError(id);
}

// LinkedIn company information for the borrower's page: employees, industry and company_id. Usually ~3 s.
export async function fetchCompany(b: Borrower, apiKey: string, snapshotId?: unknown): Promise<Company> {
  if (snapshotId !== undefined) return (await waitForSnapshot(apiKey, snapshotId))[0];
  if (!linkedinSlug(b.linkedin_url)) throw new Error("Jobs: borrower needs a linkedin.com/company/ URL");
  const url = `https://www.linkedin.com/company/${linkedinSlug(b.linkedin_url)}`;
  const qs = new URLSearchParams({ dataset_id: COMPANY_DATASET_ID, format: "json", include_errors: "true" });
  const res = await bd(apiKey, `/scrape?${qs}`, { method: "POST", body: JSON.stringify({ input: [{ url }] }) });
  const body = await res.json();
  if (res.status === 202) return (await waitForSnapshot(apiKey, body?.snapshot_id))[0];
  return usableRecords(body)[0];
}

// Open roles on LinkedIn for one company_id, read from its public jobs page through the Web Unlocker.
export async function fetchOpenRoles(companyId: string, apiKey: string): Promise<number> {
  const res = await fetch(UNLOCKER, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone: UNLOCKER_ZONE, url: jobsPageUrl(companyId), format: "raw" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Jobs: Bright Data unlocker ${res.status} ${(await res.text()).slice(0, 200)}`);
  return parseOpenRoles(await res.text());
}

export async function hiringSignal(b: Borrower, apiKey: string, today: string, snapshotId?: unknown): Promise<Signal[]> {
  const company = await fetchCompany(b, apiKey, snapshotId);
  const companyId = /^\d+$/.test(String(company?.company_id ?? "")) ? String(company.company_id) : null;
  if (!companyId) throw new Error("Jobs: LinkedIn company page has no company_id");
  return hiringSignalFromData(b, await fetchOpenRoles(companyId, apiKey), company, today);
}

// Base44 backend function. Reads the BRIGHTDATA_API_KEY secret.
// A snapshot that is still building returns 503 with its snapshot_id, so a later call can pass it back.
declare const Deno: { env: { get(k: string): string | undefined } };

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    if (!body?.borrower?.name) return Response.json({ error: "Jobs: borrower is required" }, { status: 400 });
    const apiKey = Deno.env.get("BRIGHTDATA_API_KEY");
    if (!apiKey) throw new Error("Jobs: BRIGHTDATA_API_KEY secret not set");
    const today = body.today ?? new Date().toISOString().slice(0, 10);
    return Response.json(await hiringSignal(body.borrower, apiKey, today, body.snapshot_id));
  } catch (error) {
    const snapshot_id = error instanceof JobsPendingError ? error.snapshot_id : undefined;
    return Response.json({ error: (error as Error).message, snapshot_id }, { status: snapshot_id ? 503 : 502 });
  }
}
