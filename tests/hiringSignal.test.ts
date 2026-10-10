// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  employeeCount,
  fetchJobs,
  hiringGap,
  hiringSignal,
  hiringSignalFromData,
  industryRate,
  isSameCompany,
  openPostings,
  type Borrower,
  type Job,
} from "../base44/functions/hiringSignal/entry.ts";

const TODAY = "2026-10-10";
const B: Borrower = { id: "b1", name: "Acme Widgets, Inc.", linkedin_url: "https://www.linkedin.com/company/acme-widgets/" };

let n = 0;
// An open posting at Acme.
function job(_unused = 0, extra: Partial<Job> = {}): Job {
  return { company_name: "Acme Widgets", company_url: "https://www.linkedin.com/company/acme-widgets", url: `https://www.linkedin.com/jobs/view/${n++}`, ...extra };
}
const many = (count: number) => Array.from({ length: count }, () => job());
// 400 employees in manufacturing (3.5%) -> 14 expected openings.
const MFG = { employees_in_linkedin: 400, industries: "Machinery Manufacturing" };

test("industryRate maps LinkedIn industries to BLS sectors, first match wins", () => {
  assert.deepEqual(industryRate("Insurance"), { sector: "Financial activities", rate: 5.1 });
  assert.deepEqual(industryRate("Food and Beverage Manufacturing"), { sector: "Manufacturing", rate: 3.5 });
  assert.deepEqual(industryRate("Restaurants"), { sector: "Accommodation and food services", rate: 5.5 });
  assert.deepEqual(industryRate("Hospitals and Health Care"), { sector: "Health care and social assistance", rate: 5.4 });
  assert.deepEqual(industryRate("IT Services and IT Consulting"), { sector: "Professional and business services", rate: 4.2 });
  assert.deepEqual(industryRate("Software Development"), { sector: "Information", rate: 2.8 });
  assert.deepEqual(industryRate("Truck Transportation"), { sector: "Transportation, warehousing, and utilities", rate: 4.0 });
  assert.deepEqual(industryRate("Underwater Basket Weaving"), { sector: "All industries", rate: 4.1 });
  assert.deepEqual(industryRate(undefined), { sector: "All industries", rate: 4.1 });
});

test("employeeCount prefers employees_in_linkedin, else the middle of the size band", () => {
  assert.equal(employeeCount({ employees_in_linkedin: 490, company_size: "201-500 employees" }), 490);
  assert.equal(employeeCount({ employees_in_linkedin: 0, company_size: "201-500 employees" }), 351);
  assert.equal(employeeCount({ company_size: "1,001-5,000 employees" }), 3001);
  assert.equal(employeeCount({ company_size: "10,001+ employees" }), 10001);
  assert.equal(employeeCount({}), null);
});

test("openPostings keeps the borrower's own postings, each once", () => {
  const other = job(0, { company_name: "Acme Widgets", company_url: "https://www.linkedin.com/company/acme-widgets-uk" });
  const dup = job(0, { url: "https://www.linkedin.com/jobs/view/42?trk=a" });
  const dup2 = job(0, { url: "https://www.linkedin.com/jobs/view/42?trk=b" });
  assert.equal(openPostings([job(), job(), other, dup, dup2], B), 3);
});

test("hiringGap: expected = employees x industry rate", () => {
  assert.deepEqual(hiringGap(2, 400, "Machinery Manufacturing"), {
    open: 2, employees: 400, sector: "Manufacturing", rate: 3.5, expected: 14, gapPct: 86,
  });
  assert.equal(hiringGap(20, 400, "Machinery Manufacturing").gapPct, -43); // more than normal
});

test(">= 75% below expected is strong, with the computed snippet", () => {
  assert.deepEqual(hiringSignalFromData(B, many(2), MFG, TODAY), [
    {
      borrower_id: "b1",
      type: "hiring_drop",
      severity: "strong",
      date: TODAY,
      title: "Job postings 86% below normal for company size",
      snippet: "2 open postings vs ~14 expected for 400 employees (Manufacturing: 3.5% openings rate, BLS)",
      source_name: "LinkedIn Jobs",
      source_url: "https://www.linkedin.com/company/acme-widgets/jobs/",
    },
  ]);
});

test("50-75% below is weak; under 50% below or above normal is nothing", () => {
  // expected 14: 3 open = 79% below (strong), 4 = 71% (weak), 7 = exactly 50% (weak), 8 = 43% (none)
  assert.equal(hiringSignalFromData(B, many(3), MFG, TODAY)[0].severity, "strong");
  assert.equal(hiringSignalFromData(B, many(4), MFG, TODAY)[0].severity, "weak");
  assert.equal(hiringSignalFromData(B, many(7), MFG, TODAY)[0].severity, "weak");
  assert.deepEqual(hiringSignalFromData(B, many(8), MFG, TODAY), []);
  assert.deepEqual(hiringSignalFromData(B, many(30), MFG, TODAY), []);
});

test("too small to judge: fewer than 5 expected openings gives no signal", () => {
  // 100 employees x 4.1% = 4.1 expected
  assert.deepEqual(hiringSignalFromData(B, [job(0, { company_url: "https://www.linkedin.com/company/someone-else" })], { employees_in_linkedin: 100 }, TODAY), []);
});

test("search results with none of the borrower's postings count as 0 open", () => {
  const others = Array.from({ length: 5 }, () => job(0, { company_url: "https://www.linkedin.com/company/acme-widgets-uk" }));
  assert.equal(hiringSignalFromData(B, others, MFG, TODAY)[0].title, "Job postings 100% below normal for company size");
});

test("no employee count is a failure, not 'no signal'", () => {
  assert.throws(() => hiringSignalFromData(B, many(3), { industries: "Insurance" }, TODAY), /^Error: Jobs: LinkedIn company page has no employee count/);
});

test("other companies from keyword discovery are ignored", () => {
  assert.equal(isSameCompany(job(0, { company_url: "https://www.linkedin.com/company/acme-widgets-uk" }), B), false);
  assert.equal(isSameCompany(job(0, { company_url: undefined, company_name: "ACME WIDGETS LLC" }), B), true);
  assert.equal(isSameCompany(job(0, { company_url: undefined, company_name: "Acme Widget Supply" }), B), false);
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


test("hiringSignal fetches jobs and the company page in parallel and scores them", async () => {
  fakeFetch({
    gd_lpfll7v5hcqtkxl6l: [[200, many(2)]],
    gd_l1vikfnt1wgvvqz95w: [[200, [MFG]]],
  });
  try {
    const s = await hiringSignal(B, "k", TODAY);
    assert.equal(s[0].severity, "strong");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a company page that fails makes Jobs unavailable", async () => {
  fakeFetch({
    gd_lpfll7v5hcqtkxl6l: [[200, many(2)]],
    gd_l1vikfnt1wgvvqz95w: [[200, [{ error: "dead_page" }]]],
  });
  try {
    await assert.rejects(hiringSignal(B, "k", TODAY), /Jobs: Bright Data returned no records: dead_page/);
    await assert.rejects(hiringSignal({ ...B, linkedin_url: "https://example.com/acme" }, "k", TODAY), /Jobs: borrower needs a linkedin.com\/company\/ URL/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
