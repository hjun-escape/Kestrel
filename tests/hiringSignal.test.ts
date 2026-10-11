// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  employeeCount,
  fetchCompany,
  hiringGap,
  hiringSignal,
  hiringSignalFromData,
  industryRate,
  jobsPageUrl,
  parseOpenRoles,
  type Borrower,
} from "../base44/functions/hiringSignal/entry.ts";

const TODAY = "2026-10-10";
const B: Borrower = { id: "b1", name: "Acme Widgets, Inc.", linkedin_url: "https://www.linkedin.com/company/acme-widgets/" };
// 400 employees in manufacturing (3.5%) -> 14 expected openings.
const MFG = { employees_in_linkedin: 400, industries: "Machinery Manufacturing", company_id: "123456" };

// Real page titles seen through the Web Unlocker on 2026-10-10.
const page = (title: string, body = "<ul class=\"jobs-search__results-list\"><li>job</li></ul>") =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const GRAVIE_PAGE = page("Jobs Jobs at Gravie in Worldwide (34 Open Roles) | LinkedIn");
const RIVIAN_PAGE = page("Jobs Jobs at Rivian in Worldwide (994 Open Roles) | LinkedIn");
const ZERO_PAGE = page("Jobs Jobs at Leliuga, MB in Worldwide | LinkedIn", '<section class="no-results">No matching jobs</section>');

test("parseOpenRoles reads the count from LinkedIn's title", () => {
  assert.equal(parseOpenRoles(GRAVIE_PAGE), 34);
  assert.equal(parseOpenRoles(RIVIAN_PAGE), 994);
  assert.equal(parseOpenRoles(page("Jobs Jobs at Tiny Co in Worldwide (1 Open Role) | LinkedIn")), 1);
  assert.equal(parseOpenRoles(page("Jobs Jobs at Big Co in Worldwide (1,000+ Open Roles) | LinkedIn")), 1000);
});

test("parseOpenRoles: no count plus a no-results list is 0", () => {
  assert.equal(parseOpenRoles(ZERO_PAGE), 0);
});

test("parseOpenRoles: LinkedIn's second layout, and the job-count element, are read too", () => {
  // Layout B, seen live for the same Gravie URL: "34 Jobs jobs in Worldwide", and "0 Jobs jobs in Worldwide".
  assert.equal(parseOpenRoles(page("34 Jobs jobs in Worldwide")), 34);
  assert.equal(parseOpenRoles(page("1,000+ Jobs jobs in Worldwide")), 1000);
  assert.equal(parseOpenRoles(page("0 Jobs jobs in Worldwide", '<section class="no-results"></section>')), 0);
  // Both layouts carry the count element when there are openings; it wins over the title.
  assert.equal(parseOpenRoles(page("Jobs | LinkedIn", '<span class="results-context-header__job-count">34</span>')), 34);
});

test("parseOpenRoles: a page we do not recognise fails instead of reading as 0", () => {
  assert.throws(() => parseOpenRoles(page("Sign Up | LinkedIn")), /^Error: Jobs: could not read the open-role count/);
  assert.throws(() => parseOpenRoles(page("Jobs Jobs at Gravie in Worldwide | LinkedIn")), /could not read/); // no count, no no-results
  assert.throws(() => parseOpenRoles(""), /title: none/);
});

test("industryRate maps LinkedIn industries to BLS sectors, first match wins", () => {
  assert.deepEqual(industryRate("Insurance"), { sector: "Financial activities", rate: 5.1 });
  assert.deepEqual(industryRate("Food and Beverage Manufacturing"), { sector: "Manufacturing", rate: 3.5 });
  assert.deepEqual(industryRate("Motor Vehicle Manufacturing"), { sector: "Manufacturing", rate: 3.5 });
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

test("hiringGap: expected = employees x industry rate", () => {
  assert.deepEqual(hiringGap(2, 400, "Machinery Manufacturing"), {
    open: 2, employees: 400, sector: "Manufacturing", rate: 3.5, expected: 14, gapPct: 86,
  });
  assert.equal(hiringGap(20, 400, "Machinery Manufacturing").gapPct, -43); // more than normal
});

test(">= 75% below expected is strong, with the computed snippet and a link to the jobs page", () => {
  assert.deepEqual(hiringSignalFromData(B, 2, MFG, TODAY), [
    {
      borrower_id: "b1",
      type: "hiring_drop",
      severity: "strong",
      date: TODAY,
      title: "Job postings 86% below normal for company size",
      snippet: "2 open postings vs ~14 expected for 400 employees (Manufacturing: 3.5% openings rate, BLS)",
      source_name: "LinkedIn Jobs",
      source_url: "https://www.linkedin.com/jobs/search?f_C=123456&geoId=92000000",
    },
  ]);
});

test("50-75% below is weak; under 50% below or above normal is nothing; 0 open is strong", () => {
  // expected 14: 3 open = 79% below (strong), 4 = 71% (weak), 7 = exactly 50% (weak), 8 = 43% (none)
  assert.equal(hiringSignalFromData(B, 3, MFG, TODAY)[0].severity, "strong");
  assert.equal(hiringSignalFromData(B, 4, MFG, TODAY)[0].severity, "weak");
  assert.equal(hiringSignalFromData(B, 7, MFG, TODAY)[0].severity, "weak");
  assert.deepEqual(hiringSignalFromData(B, 8, MFG, TODAY), []);
  assert.deepEqual(hiringSignalFromData(B, 30, MFG, TODAY), []);
  assert.equal(hiringSignalFromData(B, 0, MFG, TODAY)[0].title, "No open job postings (about 14 expected for company size)");
});

test("real companies: Gravie and Rivian are hiring above normal, so no signal", () => {
  // Live 2026-10-10. Rivian was wrongly flagged "53% below" when the old dataset capped it at 200 postings.
  assert.deepEqual(hiringSignalFromData(B, 34, { employees_in_linkedin: 490, industries: "Insurance", company_id: "3333239" }, TODAY), []);
  assert.deepEqual(hiringSignalFromData(B, 994, { employees_in_linkedin: 12138, industries: "Motor Vehicle Manufacturing", company_id: "737010" }, TODAY), []);
  assert.equal(hiringSignalFromData(B, 200, { employees_in_linkedin: 12138, industries: "Motor Vehicle Manufacturing", company_id: "737010" }, TODAY)[0].severity, "weak");
});

test("too small to judge: fewer than 5 expected openings gives no signal", () => {
  // 100 employees x 4.1% = 4.1 expected
  assert.deepEqual(hiringSignalFromData(B, 0, { employees_in_linkedin: 100, company_id: "1" }, TODAY), []);
});

test("no employee count is a failure, not 'no signal'", () => {
  assert.throws(() => hiringSignalFromData(B, 3, { industries: "Insurance" }, TODAY), /^Error: Jobs: LinkedIn company page has no employee count/);
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

// ---------- Bright Data (fetch is faked) ----------

function fakeFetch(routes: Record<string, unknown[]>) {
  const calls: { url: string; body: string }[] = [];
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? "") });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error(`unexpected fetch ${url}`);
    const next = routes[key].length > 1 ? routes[key].shift() : routes[key][0];
    const [status, body] = next as [number, unknown];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return calls;
}
const realFetch = globalThis.fetch;

test("hiringSignal: company page, then that company's jobs page through the unlocker", async () => {
  const calls = fakeFetch({ gd_l1vikfnt1wgvvqz95w: [[200, [MFG]]], "/request": [[200, page("Jobs Jobs at Acme in Worldwide (2 Open Roles) | LinkedIn")]] });
  try {
    const s = await hiringSignal(B, "k", TODAY);
    assert.equal(s[0].severity, "strong");
    const unlocker = JSON.parse(calls[1].body);
    assert.deepEqual(unlocker, { zone: "mcp_unlocker", url: jobsPageUrl("123456"), format: "raw" });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("company page failures make Jobs unavailable", async () => {
  try {
    fakeFetch({ gd_l1vikfnt1wgvvqz95w: [[200, [{ error: "dead_page" }]]] });
    await assert.rejects(hiringSignal(B, "k", TODAY), /Jobs: Bright Data returned no records: dead_page/);
    fakeFetch({ gd_l1vikfnt1wgvvqz95w: [[200, []]] });
    await assert.rejects(hiringSignal(B, "k", TODAY), /Jobs: Bright Data returned no records/);
    fakeFetch({ gd_l1vikfnt1wgvvqz95w: [[200, [{ ...MFG, company_id: "../evil" }]]] });
    await assert.rejects(hiringSignal(B, "k", TODAY), /Jobs: LinkedIn company page has no company_id/);
    await assert.rejects(hiringSignal({ ...B, linkedin_url: "https://example.com/acme" }, "k", TODAY), /Jobs: borrower needs a linkedin.com\/company\/ URL/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("jobs page failures make Jobs unavailable", async () => {
  try {
    fakeFetch({ gd_l1vikfnt1wgvvqz95w: [[200, [MFG]]], "/request": [[502, "upstream error"]] });
    await assert.rejects(hiringSignal(B, "k", TODAY), /Jobs: Bright Data unlocker 502/);
    fakeFetch({ gd_l1vikfnt1wgvvqz95w: [[200, [MFG]]], "/request": [[200, page("Sign Up | LinkedIn")]] });
    await assert.rejects(hiringSignal(B, "k", TODAY), /could not read the open-role count/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a still-building company snapshot is waited on, and resumed by snapshot_id", async () => {
  const realSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = ((f: () => void) => (f(), 0)) as any;
  try {
    const calls = fakeFetch({
      "/progress/": [[200, { status: "ready" }]],
      "/snapshot/": [[200, { status: "building", message: "Snapshot is not ready yet" }], [200, [MFG]]],
    });
    assert.equal((await fetchCompany(B, "k", "sd_abc123")).company_id, "123456");
    assert.ok(calls.every((c) => !c.url.includes("/scrape")));
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.fetch = realFetch;
  }
});

test("crafted snapshot_id is refused before any request is made", async () => {
  const calls = fakeFetch({});
  try {
    for (const bad of ["../../zone/whitelist", "sd_abc/../../x", "sd_ABC?x=1", 42, "", "s_"]) {
      await assert.rejects(fetchCompany(B, "k", bad), /Jobs: invalid snapshot_id/);
    }
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
