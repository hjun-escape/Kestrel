// hiringSignal (P3): job postings in the last 30 days vs the prior 60 days (normalized per 30 days).
// Drop >= 50% = strong, 25-50% = weak. Skipped if the prior 60 days had 0 postings.
//
// Input:  { borrower: Borrower, today?: "YYYY-MM-DD", snapshot_id?: string }  (refreshBorrower sends { borrower })
// Output: Signal[] (0 or 1 hiring_drop). Never writes status.
// On failure it throws an Error whose message starts with "Jobs" (the sources_unavailable value).
// If Bright Data is still building the snapshot, the error carries snapshot_id so a later call can resume.
//
// Data: Bright Data Web Scraper API, LinkedIn job listings dataset, discovered by company keyword.
// Confirmed live 2026-10-10 on Gravie: dataset, keyword discovery input, and fields (job_posted_date is an ISO
// timestamp, job_posted_time is "1 week ago"). 34 postings in ~41 s, all Gravie's own.
//
// Known limit, seen live: the dataset returns open postings only, so nearly all are under 30 days old and the
// prior-60-day window is usually empty (no signal). Gravie: 34 recent, 0 prior. Needs a team decision (see PR).

export interface Borrower {
  id?: string;
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
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
  job_posted_date?: string;
  job_posted_time?: string;
  date_posted?: string;
  url?: string;
  [k: string]: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const API = "https://api.brightdata.com/datasets/v3";
export const JOBS_DATASET_ID = "gd_lpfll7v5hcqtkxl6l"; // "Linkedin job listings information"
// refreshBorrower gives each source 120 s: up to ~60 s for the sync scrape plus this budget.
const POLL_BUDGET_MS = 50_000;
const POLL_EVERY_MS = 10_000;

// ---------- pure logic (tested) ----------

function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// Accepts "2026-09-14", "2026-09-14T10:00:00.000Z", "3 weeks ago", "1 month ago", "Just now", "30+ days ago".
export function parsePostedDate(raw: unknown, today: string): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const iso = parseDay(raw.trim());
  if (iso !== null) return iso;
  const now = parseDay(today);
  if (now === null) return null;
  const s = raw.toLowerCase();
  if (/just now|today|hour|minute|second/.test(s)) return now;
  if (/yesterday/.test(s)) return now - DAY_MS;
  const m = /(\d+)\+?\s*(day|week|month|year)s?\s+ago/.exec(s);
  if (!m) return null;
  const days = { day: 1, week: 7, month: 30, year: 365 }[m[2] as "day" | "week" | "month" | "year"];
  return now - +m[1] * days * DAY_MS;
}

function postedAt(job: Job, today: string): number | null {
  return (
    parsePostedDate(job.job_posted_date, today) ??
    parsePostedDate(job.date_posted, today) ??
    parsePostedDate(job.job_posted_time, today)
  );
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

export interface HiringCounts {
  recent: number; // postings dated 0-29 days ago
  prior60: number; // postings dated 30-89 days ago
  priorPer30: number;
  dropPct: number | null; // null when prior60 == 0
}

export function countPostings(jobs: Job[], today: string): HiringCounts {
  const now = parseDay(today);
  if (now === null) throw new Error(`Invalid today: ${today}`);
  let recent = 0;
  let prior60 = 0;
  const seen = new Set<string>();
  for (const job of jobs) {
    if (job.url) {
      if (seen.has(job.url)) continue;
      seen.add(job.url);
    }
    const t = postedAt(job, today);
    if (t === null) continue;
    const age = Math.floor((now - t) / DAY_MS);
    if (age < 0) continue;
    if (age < 30) recent++;
    else if (age < 90) prior60++;
  }
  const priorPer30 = prior60 / 2;
  const dropPct = prior60 === 0 ? null : Math.round(((priorPer30 - recent) / priorPer30) * 100);
  return { recent, prior60, priorPer30, dropPct };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function hiringSignalFromJobs(b: Borrower, jobs: Job[], today: string): Signal[] {
  const c = countPostings(jobs.filter((j) => isSameCompany(j, b)), today);
  if (c.dropPct === null || c.dropPct < 25) return [];
  return [
    {
      borrower_id: b.id,
      type: "hiring_drop",
      severity: c.dropPct >= 50 ? "strong" : "weak",
      date: today,
      title: `Job postings down ${c.dropPct}% in 30 days`,
      snippet: `${c.recent} postings in last 30 days vs ${fmt(c.priorPer30)}/month before`,
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

async function waitForSnapshot(apiKey: string, id: string): Promise<Job[]> {
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    const p = await (await bd(apiKey, `/progress/${id}`)).json();
    if (p.status === "ready") return await (await bd(apiKey, `/snapshot/${id}?format=json`)).json();
    if (p.status === "failed") throw new Error(`Jobs: snapshot ${id} failed`);
    await sleep(POLL_EVERY_MS);
  }
  throw new JobsPendingError(id);
}

export async function fetchJobs(b: Borrower, apiKey: string, snapshotId?: string): Promise<Job[]> {
  if (snapshotId) return waitForSnapshot(apiKey, snapshotId);
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
  if (res.status === 202) return waitForSnapshot(apiKey, body.snapshot_id);
  return Array.isArray(body) ? body : [];
}

export async function hiringSignal(b: Borrower, apiKey: string, today: string, snapshotId?: string): Promise<Signal[]> {
  return hiringSignalFromJobs(b, await fetchJobs(b, apiKey, snapshotId), today);
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
