// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  fetchJobs,
  countPostings,
  hiringSignalFromJobs,
  isSameCompany,
  parsePostedDate,
  type Borrower,
  type Job,
} from "../base44/functions/hiringSignal/entry.ts";

const TODAY = "2026-10-10";
const B: Borrower = { id: "b1", name: "Acme Widgets, Inc.", linkedin_url: "https://www.linkedin.com/company/acme-widgets/" };

let n = 0;
// A job posted `daysAgo` days before TODAY at Acme.
function job(daysAgo: number, extra: Partial<Job> = {}): Job {
  const d = new Date(Date.UTC(2026, 9, 10) - daysAgo * 86400000).toISOString().slice(0, 10);
  return { company_name: "Acme Widgets", company_url: "https://www.linkedin.com/company/acme-widgets", job_posted_date: d, url: `u${n++}`, ...extra };
}
const many = (count: number, daysAgo: number) => Array.from({ length: count }, () => job(daysAgo));

test("parsePostedDate handles ISO and relative text", () => {
  const day = (s: string) => new Date(parsePostedDate(s, TODAY)!).toISOString().slice(0, 10);
  assert.equal(day("2026-09-14"), "2026-09-14");
  assert.equal(day("2026-09-14T22:10:00.000Z"), "2026-09-14");
  assert.equal(day("3 weeks ago"), "2026-09-19");
  assert.equal(day("1 month ago"), "2026-09-10");
  assert.equal(day("30+ days ago"), "2026-09-10");
  assert.equal(day("5 hours ago"), TODAY);
  assert.equal(parsePostedDate("whenever", TODAY), null);
  assert.equal(parsePostedDate(undefined, TODAY), null);
});

test("countPostings splits 0-29 / 30-89 days and dedupes by url", () => {
  const jobs = [...many(3, 0), ...many(2, 29), ...many(4, 30), ...many(6, 89), ...many(5, 90), job(-1), job(5, { url: "dup" }), job(5, { url: "dup" })];
  assert.deepEqual(countPostings(jobs, TODAY), { recent: 6, prior60: 10, priorPer30: 5, dropPct: -20 });
});

test("drop >= 50% is strong, with the computed snippet", () => {
  // prior 60 days: 74 postings = 37/month. last 30: 14. drop = 62%.
  const s = hiringSignalFromJobs(B, [...many(14, 10), ...many(74, 45)], TODAY);
  assert.deepEqual(s, [
    {
      borrower_id: "b1",
      type: "hiring_drop",
      severity: "strong",
      date: TODAY,
      title: "Job postings down 62% in 30 days",
      snippet: "14 postings in last 30 days vs 37/month before",
      source_name: "LinkedIn Jobs",
      source_url: "https://www.linkedin.com/company/acme-widgets/jobs/",
    },
  ]);
});

test("exactly 50% is strong, exactly 25% is weak, under 25% is nothing", () => {
  assert.equal(hiringSignalFromJobs(B, [...many(5, 1), ...many(20, 60)], TODAY)[0].severity, "strong");
  assert.equal(hiringSignalFromJobs(B, [...many(15, 1), ...many(40, 60)], TODAY)[0].severity, "weak");
  assert.deepEqual(hiringSignalFromJobs(B, [...many(16, 1), ...many(40, 60)], TODAY), []);
});

test("no prior postings means no signal", () => {
  assert.deepEqual(hiringSignalFromJobs(B, [], TODAY), []);
  assert.deepEqual(hiringSignalFromJobs(B, many(3, 1), TODAY), []);
});

test("fractional monthly rate is shown with one decimal", () => {
  const s = hiringSignalFromJobs(B, [...many(2, 1), ...many(9, 50)], TODAY);
  assert.equal(s[0].snippet, "2 postings in last 30 days vs 4.5/month before");
});

test("other companies from keyword discovery are ignored", () => {
  const other = { company_name: "Acme Widgets", company_url: "https://www.linkedin.com/company/acme-widgets-uk" };
  assert.equal(isSameCompany(job(1, other), B), false);
  assert.equal(isSameCompany(job(1, { company_url: undefined, company_name: "ACME WIDGETS LLC" }), B), true);
  assert.equal(isSameCompany(job(1, { company_url: undefined, company_name: "Acme Widget Supply" }), B), false);
  // 40 prior postings all belong to a different company -> no signal for Acme.
  const jobs = Array.from({ length: 40 }, () => job(60, other));
  assert.deepEqual(hiringSignalFromJobs(B, jobs, TODAY), []);
});

test("Base44 handler: missing borrower is 400, missing key fails as Jobs", async () => {
  (globalThis as any).Deno = { env: { get: () => undefined } };
  const call = (body: unknown) => handler(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await call({})).status, 400);
  const res = await call({ borrower: B });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /^Jobs: BRIGHTDATA_API_KEY/);
  delete (globalThis as any).Deno;
});

test("minimum sample: 1 or 5 prior postings then none is not a drop; 6 is", () => {
  assert.deepEqual(hiringSignalFromJobs(B, many(1, 45), TODAY), []);
  assert.deepEqual(hiringSignalFromJobs(B, many(5, 45), TODAY), []);
  assert.equal(hiringSignalFromJobs(B, many(6, 45), TODAY)[0].severity, "strong");
});

test("records with no readable date at all are a failure, not 'no signal'", () => {
  assert.throws(() => hiringSignalFromJobs(B, [{ company_name: "Acme Widgets", posted: "yesterday-ish" }], TODAY), /^Error: Jobs: no posting/);
});

// ---------- Bright Data replies (fetch is faked) ----------

function fakeFetch(routes: Record<string, unknown[]>) {
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const next = routes[key].length > 1 ? routes[key].shift() : routes[key][0];
    const [status, body] = next as [number, unknown];
    return new Response(JSON.stringify(body), { status });
  };
  return calls;
}
const realFetch = globalThis.fetch;

test("empty or error-only Bright Data result is a failure, not 'no signals'", async () => {
  fakeFetch({ "/scrape": [[200, []]] });
  await assert.rejects(fetchJobs(B, "k"), /Jobs: Bright Data returned no records/);
  fakeFetch({ "/scrape": [[200, [{ error: "blocked", error_code: "dead_page" }]]] });
  await assert.rejects(fetchJobs(B, "k"), /Jobs: Bright Data returned no records: blocked/);
  fakeFetch({ "/scrape": [[200, { message: "something odd" }]] });
  await assert.rejects(fetchJobs(B, "k"), /Jobs: unexpected Bright Data reply/);
  globalThis.fetch = realFetch;
});

test("error records are dropped, real ones kept", async () => {
  fakeFetch({ "/scrape": [[200, [{ error: "x" }, job(3)]]] });
  assert.equal((await fetchJobs(B, "k")).length, 1);
  globalThis.fetch = realFetch;
});

test("snapshot download that says 'not ready' is waited on, never parsed as jobs", async () => {
  fakeFetch({
    "/progress/": [[200, { status: "ready" }]],
    "/snapshot/": [[200, { status: "building", message: "Snapshot is not ready yet, try again in 10s" }], [200, [job(3)]]],
  });
  const realSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = ((f: () => void) => (f(), 0)) as any; // skip the 10 s poll sleep
  try {
    assert.equal((await fetchJobs(B, "k", "sd_abc123")).length, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.fetch = realFetch;
  }
});

test("crafted snapshot_id is refused before any request is made", async () => {
  const calls = fakeFetch({});
  for (const bad of ["../../zone/whitelist", "sd_abc/../../x", "sd_ABC?x=1", 42, "", "s_"]) {
    await assert.rejects(fetchJobs(B, "k", bad), /Jobs: invalid snapshot_id/);
  }
  assert.equal(calls.length, 0);
  globalThis.fetch = realFetch;
});
