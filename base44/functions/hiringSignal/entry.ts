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
// If Bright Data is still building the jobs snapshot, the error carries snapshot_id so a later call can resume.
//
// Data (Bright Data Web Scraper API, confirmed live 2026-10-10 on Gravie):
//   - LinkedIn job listings, discovered by company keyword: 34 open postings in ~45 s, all Gravie's own.
//   - LinkedIn company information, collected by URL: employees_in_linkedin 490, industries "Insurance", ~3 s.
// Known limits: a company that posts jobs only on its own site or Indeed looks like it is not hiring, and
// employees_in_linkedin undercounts staff who are not on LinkedIn. Zero postings comes back from Bright Data as
// an empty result, which counts as a failed search (Jobs unavailable), never as a strong signal.

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

export interface Job {
  company_name?: string;
  company_url?: string;
  url?: string;
  [k: string]: unknown;
}

export interface Company {
  employees_in_linkedin?: unknown;
  company_size?: unknown;
  industries?: unknown;
  [k: string]: unknown;
}

const API = "https://api.brightdata.com/datasets/v3";
export const JOBS_DATASET_ID = "gd_lpfll7v5hcqtkxl6l"; // "Linkedin job listings information"
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

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|holdings)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linkedinSlug(url?: string): string | null {
  const m = /linkedin\.com\/company\/([^/?#]+)/i.exec(url ?? "");
  return m ? m[1].toLowerCase() : null;
}

// Keyword discovery returns other companies too. Keep a job only if its company URL slug matches the
// borrower's LinkedIn page, or (when either has no URL) the normalized company names match exactly.
export function isSameCompany(job: Job, b: Borrower): boolean {
  const want = linkedinSlug(b.linkedin_url);
  const got = linkedinSlug(job.company_url);
  if (want && got) return want === got;
  return !!job.company_name && norm(job.company_name) === norm(b.name);
}

// The borrower's own open postings, each counted once.
export function openPostings(jobs: Job[], b: Borrower): number {
  const seen = new Set<string>();
  let n = 0;
  for (const j of jobs) {
    if (!isSameCompany(j, b)) continue;
    const key = j.url ? String(j.url).replace(/[?#].*$/, "") : "";
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    n++;
  }
  return n;
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

export function hiringSignalFromData(b: Borrower, jobs: Job[], company: Company, today: string): Signal[] {
  const employees = employeeCount(company);
  if (employees === null) throw new Error("Jobs: LinkedIn company page has no employee count");
  const g = hiringGap(openPostings(jobs, b), employees, company.industries ?? b.industry);
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
      source_url: b.linkedin_url ? `${b.linkedin_url.replace(/\/+$/, "")}/jobs/` : "https://www.linkedin.com/jobs/",
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
export function usableRecords(body: unknown): Job[] {
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

async function waitForSnapshot(apiKey: string, rawId: unknown): Promise<Job[]> {
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

export async function fetchJobs(b: Borrower, apiKey: string, snapshotId?: unknown): Promise<Job[]> {
  if (snapshotId !== undefined) return waitForSnapshot(apiKey, snapshotId);
  const qs = new URLSearchParams({
    dataset_id: JOBS_DATASET_ID,
    format: "json",
    include_errors: "true",
    type: "discover_new",
    discover_by: "keyword",
  });
  const input = [{ keyword: b.name, company: b.name, location: "United States", time_range: "Any time" }];
  const res = await bd(apiKey, `/scrape?${qs}`, { method: "POST", body: JSON.stringify({ input, limit_per_input: 200 }) });
  const body = await res.json();
  if (res.status === 202) return waitForSnapshot(apiKey, body?.snapshot_id);
  return usableRecords(body);
}

// LinkedIn company information for the borrower's page: employee count and industry. Usually ~3 s.
export async function fetchCompany(b: Borrower, apiKey: string): Promise<Company> {
  if (!linkedinSlug(b.linkedin_url)) throw new Error("Jobs: borrower needs a linkedin.com/company/ URL");
  const url = `https://www.linkedin.com/company/${linkedinSlug(b.linkedin_url)}`;
  const qs = new URLSearchParams({ dataset_id: COMPANY_DATASET_ID, format: "json", include_errors: "true" });
  const res = await bd(apiKey, `/scrape?${qs}`, { method: "POST", body: JSON.stringify({ input: [{ url }] }) });
  const body = await res.json();
  if (res.status === 202) return (await waitForSnapshot(apiKey, body?.snapshot_id))[0] as Company;
  return usableRecords(body)[0] as Company;
}

export async function hiringSignal(b: Borrower, apiKey: string, today: string, snapshotId?: unknown): Promise<Signal[]> {
  const [jobs, company] = await Promise.all([fetchJobs(b, apiKey, snapshotId), fetchCompany(b, apiKey)]);
  return hiringSignalFromData(b, jobs, company, today);
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
