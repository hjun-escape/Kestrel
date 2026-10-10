// reviewSignals (P3): Glassdoor employee reviews -> review_distress signals.
//
// Input:  { borrower: Borrower, today?: "YYYY-MM-DD", snapshot_id?: string }  (refreshBorrower sends { borrower })
// Output: Signal[] (0-2 review_distress). Never writes status.
// On failure it throws an Error whose message starts with "Reviews" (the sources_unavailable value).
//
// Rules (CLAUDE.md):
//   strong: a review in the last 90 days mentioning layoffs, furloughs, late or missed pay, or closing.
//           One signal for the newest such review, so reviews alone can't turn a company red.
//   weak:   90-day average rating >= 0.5 below the prior 12 months (needs MIN_REVIEWS in each window).
//
// The strong case is matched with keywords, and the snippet is the matching sentence copied exactly from the
// review. When P2's tagItem is deployed, set TAG_ITEM_ENABLED to have it confirm each match (CLAUDE.md:
// the LLM only tags; the snippet guard still applies). Glassdoor pages belong to one company, so
// same-company matching is not needed here.
//
// TO CONFIRM with the Bright Data MCP or scripts/brightdata-datasets.mjs (PLAN.md §8):
// GLASSDOOR_REVIEWS_DATASET_ID and the field names. normalizeReview accepts several likely spellings.

export interface Borrower {
  id?: string;
  name: string;
  website_domain?: string;
  hq_city?: string;
  glassdoor_url?: string;
}

export interface Signal {
  borrower_id?: string;
  type: "review_distress";
  severity: "strong" | "weak";
  date: string;
  title: string;
  snippet: string;
  source_name: string;
  source_url: string;
}

export interface Review {
  date: string; // YYYY-MM-DD
  rating: number | null;
  texts: string[]; // title, pros, cons, advice: each kept exactly as scraped
  url?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const API = "https://api.brightdata.com/datasets/v3";
export const GLASSDOOR_REVIEWS_DATASET_ID = "gd_l7j1po0921hbu0ri1z"; // Glassdoor company reviews. TO CONFIRM.
// refreshBorrower gives each source 120 s: up to ~60 s for the sync scrape plus this budget.
const POLL_BUDGET_MS = 50_000;
const POLL_EVERY_MS = 10_000;
export const MIN_REVIEWS = 3;
const TAG_ITEM_ENABLED = false;

// ---------- pure logic (tested) ----------

function parseDay(s: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof s === "string" ? s.trim() : "");
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Glassdoor's "Oct 5, 2026", parsed as UTC so the day never shifts with the server's time zone.
function parseMonthDay(s: unknown): number | null {
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(typeof s === "string" ? s.trim() : "");
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return m && month >= 0 ? Date.UTC(+m[3], month, +m[2]) : null;
}

function iso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function firstOf(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") return raw[k];
  return undefined;
}

// Maps a scraped record to a Review, or null if it has no usable date.
export function normalizeReview(raw: Record<string, unknown>): Review | null {
  const dateRaw = firstOf(raw, ["review_date", "date", "date_of_review", "review_date_time", "reviewDateTime", "date_posted"]);
  const t = parseDay(dateRaw) ?? parseMonthDay(dateRaw);
  if (t === null) return null;
  const r = Number(firstOf(raw, ["rating", "overall_rating", "rating_overall", "review_rating", "ratingOverall"]));
  const texts = ["review_title", "title", "summary", "pros", "cons", "review_pros", "review_cons", "advice", "advice_to_management"]
    .map((k) => raw[k])
    .filter((v): v is string => typeof v === "string" && v.trim() !== "");
  const url = firstOf(raw, ["review_url", "url"]);
  return { date: iso(t), rating: Number.isFinite(r) && r > 0 ? r : null, texts, url: typeof url === "string" ? url : undefined };
}

const DISTRESS: { label: string; re: RegExp }[] = [
  { label: "layoffs", re: /\b(lay ?offs?|laid off|laying off|reductions? in force|RIFs?)\b/i },
  { label: "furloughs", re: /\bfurlough(s|ed|ing)?\b/i },
  {
    label: "late or missed pay",
    re: /\b(late (pay|paychecks?|payroll|wages)|pay(checks?|roll)? (was |were |is |are |came |comes )?(late|delayed|missed|bounced)|missed (pay|paychecks?|payroll)|(didn'?t|did not) get paid|(haven'?t|have not|weren'?t|were not|wasn'?t|was not|not) (been |being |getting )?paid(?! (enough|well|fairly|much|competitively|market))|bounced paychecks?)\b/i,
  },
  {
    label: "closing",
    re: /\b(clos(ing|ed|es) (down|its doors|the (plant|office|location|facility|warehouse|store))|shutting down|shut down|going out of business|out of business|bankrupt(cy)?)\b/i,
  },
];

const NEGATION = /\b(no|never|zero|without|not any|haven'?t had|have not had)\b[^.!?\n]{0,15}$/i;

// Returns the exact sentence around index i (substring of text), trimmed to at most ~240 chars.
function sentenceAt(text: string, i: number, len: number): string {
  let start = i;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) start--;
  let end = i + len;
  while (end < text.length && !/[.!?\n]/.test(text[end])) end++;
  if (end < text.length && /[.!?]/.test(text[end])) end++;
  if (end - start > 240) {
    start = Math.max(start, i - 100);
    end = Math.min(end, i + len + 100);
  }
  return text.slice(start, end).trim();
}

export interface DistressHit {
  label: string;
  snippet: string;
}

// First distress mention in the review, skipping negated ones like "no layoffs".
export function findDistress(review: Review): DistressHit | null {
  for (const text of review.texts) {
    for (const { label, re } of DISTRESS) {
      const g = new RegExp(re.source, "gi");
      let m: RegExpExecArray | null;
      while ((m = g.exec(text))) {
        if (NEGATION.test(text.slice(Math.max(0, m.index - 30), m.index))) continue;
        return { label, snippet: sentenceAt(text, m.index, m[0].length) };
      }
    }
  }
  return null;
}

function ageDays(date: string, today: string): number | null {
  const t = parseDay(date);
  const now = parseDay(today);
  if (t === null || now === null) return null;
  return Math.floor((now - t) / DAY_MS);
}

export interface RatingTrend {
  recentAvg: number | null;
  recentCount: number;
  priorAvg: number | null;
  priorCount: number;
}

// Recent = 0-89 days ago. Prior 12 months = 90-454 days ago.
export function ratingTrend(reviews: Review[], today: string): RatingTrend {
  const recent: number[] = [];
  const prior: number[] = [];
  for (const r of reviews) {
    const age = ageDays(r.date, today);
    if (age === null || age < 0 || r.rating === null) continue;
    if (age < 90) recent.push(r.rating);
    else if (age < 455) prior.push(r.rating);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { recentAvg: avg(recent), recentCount: recent.length, priorAvg: avg(prior), priorCount: prior.length };
}

export interface Tagger {
  (text: string, url: string): Promise<{ relevant?: boolean; signal_type?: string; snippet?: string } | null>;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export async function reviewSignalsFromReviews(b: Borrower, raw: Record<string, unknown>[], today: string, tag?: Tagger): Promise<Signal[]> {
  if (parseDay(today) === null) throw new Error(`Reviews: invalid today ${today}`);
  const reviews = raw.map(normalizeReview).filter((r): r is Review => r !== null);
  const pageUrl = b.glassdoor_url ?? "https://www.glassdoor.com";
  const out: Signal[] = [];

  // Strong: newest review in the last 90 days with a distress mention.
  const recent = reviews
    .filter((r) => {
      const age = ageDays(r.date, today);
      return age !== null && age >= 0 && age < 90;
    })
    .sort((a, z) => z.date.localeCompare(a.date));
  for (const r of recent) {
    const hit = findDistress(r);
    if (!hit) continue;
    let snippet = hit.snippet;
    if (tag) {
      const t = await tag(r.texts.join("\n"), r.url ?? pageUrl);
      if (!t?.relevant || t.signal_type !== "review_distress") continue;
      // Snippet guard: keep the model's snippet only if it is copied exactly from the review.
      if (t.snippet && r.texts.some((x) => squash(x).includes(squash(t.snippet!)))) snippet = t.snippet;
    }
    out.push({
      borrower_id: b.id,
      type: "review_distress",
      severity: "strong",
      date: r.date,
      title: `Employee review mentions ${hit.label}`,
      snippet,
      source_name: "Glassdoor",
      source_url: r.url ?? pageUrl,
    });
    break;
  }

  // Weak: 90-day average rating at least 0.5 below the prior 12 months.
  const t = ratingTrend(reviews, today);
  if (t.recentAvg !== null && t.priorAvg !== null && t.recentCount >= MIN_REVIEWS && t.priorCount >= MIN_REVIEWS) {
    const drop = Math.round((t.priorAvg - t.recentAvg) * 100) / 100;
    if (drop >= 0.5) {
      out.push({
        borrower_id: b.id,
        type: "review_distress",
        severity: "weak",
        date: today,
        title: `Glassdoor rating down ${drop.toFixed(1)} in 90 days`,
        snippet: `${t.recentAvg.toFixed(1)} average over ${t.recentCount} reviews in last 90 days vs ${t.priorAvg.toFixed(1)} over ${t.priorCount} in the prior 12 months`,
        source_name: "Glassdoor",
        source_url: pageUrl,
      });
    }
  }
  return out;
}

// ---------- Bright Data (network) ----------

export class ReviewsPendingError extends Error {
  snapshot_id: string;
  constructor(snapshot_id: string) {
    super(`Reviews: snapshot ${snapshot_id} not ready`);
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
  if (!res.ok && res.status !== 202) throw new Error(`Reviews: Bright Data ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function waitForSnapshot(apiKey: string, id: string): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    const p = await (await bd(apiKey, `/progress/${id}`)).json();
    if (p.status === "ready") return await (await bd(apiKey, `/snapshot/${id}?format=json`)).json();
    if (p.status === "failed") throw new Error(`Reviews: snapshot ${id} failed`);
    await sleep(POLL_EVERY_MS);
  }
  throw new ReviewsPendingError(id);
}

export async function fetchReviews(b: Borrower, apiKey: string, snapshotId?: string): Promise<Record<string, unknown>[]> {
  if (snapshotId) return waitForSnapshot(apiKey, snapshotId);
  if (!b.glassdoor_url) throw new Error("Reviews: borrower has no glassdoor_url");
  const qs = new URLSearchParams({ dataset_id: GLASSDOOR_REVIEWS_DATASET_ID, format: "json", include_errors: "true" });
  const body = JSON.stringify({ input: [{ url: b.glassdoor_url }], limit_per_input: 300 });
  const res = await bd(apiKey, `/scrape?${qs}`, { method: "POST", body });
  const data = await res.json();
  if (res.status === 202) return waitForSnapshot(apiKey, data.snapshot_id);
  // Error records from include_errors have no review date and are dropped by normalizeReview.
  return Array.isArray(data) ? data : [];
}

// Base44 backend function. Reads the BRIGHTDATA_API_KEY secret.
// A snapshot that is still building returns 503 with its snapshot_id, so a later call can pass it back.
declare const Deno: { env: { get(k: string): string | undefined } };

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const borrower: Borrower | undefined = body?.borrower;
    if (!borrower?.name) return Response.json({ error: "Reviews: borrower is required" }, { status: 400 });
    const apiKey = Deno.env.get("BRIGHTDATA_API_KEY");
    if (!apiKey) throw new Error("Reviews: BRIGHTDATA_API_KEY secret not set");
    const today = body.today ?? new Date().toISOString().slice(0, 10);

    let tag: Tagger | undefined;
    if (TAG_ITEM_ENABLED) {
      // Loaded only when tagging is on, so the tests (Node) never import the Deno-only SDK URL.
      const { createClientFromRequest } = await import("npm:@base44/sdk@0.8.52");
      const base44 = createClientFromRequest(req);
      tag = async (text, url) => (await base44.asServiceRole.functions.invoke("tagItem", { text, url, borrower }))?.data ?? null;
    }

    const raw = await fetchReviews(borrower, apiKey, body.snapshot_id);
    return Response.json(await reviewSignalsFromReviews(borrower, raw, today, tag));
  } catch (error) {
    const snapshot_id = error instanceof ReviewsPendingError ? error.snapshot_id : undefined;
    return Response.json({ error: (error as Error).message, snapshot_id }, { status: snapshot_id ? 503 : 502 });
  }
}
