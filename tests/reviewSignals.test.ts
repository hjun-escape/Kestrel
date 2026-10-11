// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  fetchReviews,
  sourceQuote,
  findDistress,
  normalizeReview,
  glassdoorEmployerId,
  overallRatingFromSerp,
  recentRating,
  reviewSignalsFromReviews,
  type Borrower,
} from "../base44/functions/reviewSignals/entry.ts";

const TODAY = "2026-10-10";
const B: Borrower = { id: "b1", name: "Acme Widgets", glassdoor_url: "https://www.glassdoor.com/Reviews/Acme-Widgets-Reviews-E123.htm" };

function daysAgo(n: number): string {
  return new Date(Date.UTC(2026, 9, 10) - n * 86400000).toISOString().slice(0, 10);
}
function rev(n: number, rating: number, cons = "Long hours.", extra: Record<string, unknown> = {}) {
  return { review_date: daysAgo(n), rating, pros: "Good team.", cons, review_url: `https://glassdoor.com/r/${n}`, ...extra };
}
const hit = (cons: string) => findDistress(normalizeReview(rev(1, 3, cons))!);

test("normalizeReview accepts several field spellings and drops undated records", () => {
  assert.deepEqual(normalizeReview({ date: "Sep 12, 2026", overall_rating: "4", summary: "Fine" }), {
    date: "2026-09-12",
    rating: 4,
    texts: ["Fine"],
    url: undefined,
  });
  assert.equal(normalizeReview({ rating: 4, pros: "x", error: "blocked" }), null);
  assert.equal(normalizeReview({ review_date: "2026-09-12", rating: "n/a" })!.rating, null);
});

test("findDistress matches each category and returns the exact sentence", () => {
  assert.deepEqual(hit("Pay is ok. They had another round of layoffs in August. Avoid."), {
    label: "layoffs",
    snippet: "They had another round of layoffs in August.",
  });
  assert.equal(hit("Half the plant got furloughed last month")!.label, "furloughs");
  assert.equal(hit("Paychecks were late twice this quarter.")!.label, "late or missed pay");
  assert.equal(hit("We didn't get paid on time in September.")!.label, "late or missed pay");
  assert.equal(hit("Rumor is they are closing the plant in Ohio.")!.label, "closing");
  assert.equal(hit("We haven't been paid in three weeks.")!.label, "late or missed pay");
  assert.equal(hit("Long hours, low pay.")!, null);
  assert.equal(hit("You are not paid well for the work.")!, null);
  assert.equal(hit("Engineers were not paid enough.")!, null);
});

test("findDistress ignores negated mentions", () => {
  assert.equal(hit("Never had layoffs in 20 years."), null);
  assert.equal(hit("No layoffs even during covid."), null);
  assert.equal(hit("No layoffs before, but they laid off 40 people last week.")!.snippet, "No layoffs before, but they laid off 40 people last week.");
});

test("snippet is always an exact substring of the review", () => {
  const long = "x ".repeat(200) + "and then came the layoffs " + "y ".repeat(200);
  const h = hit(long)!;
  assert.ok(long.includes(h.snippet));
  assert.ok(h.snippet.length <= 260);
});

test("strong: newest distress review in the last 90 days, one signal only", async () => {
  const raw = [rev(5, 2, "Layoffs every quarter."), rev(20, 1, "Paychecks were late."), rev(100, 1, "More layoffs.")];
  const s = await reviewSignalsFromReviews(B, raw, TODAY);
  assert.deepEqual(s, [
    {
      borrower_id: "b1",
      type: "review_distress",
      severity: "strong",
      date: daysAgo(5),
      title: "Employee review mentions layoffs",
      snippet: "Layoffs every quarter.",
      source_name: "Glassdoor",
      source_url: "https://glassdoor.com/r/5",
    },
  ]);
});

test("distress older than 90 days is ignored", async () => {
  assert.deepEqual(await reviewSignalsFromReviews(B, [rev(90, 4, "Layoffs.")], TODAY), []);
});

test("recentRating averages reviews dated 0-89 days ago", () => {
  const r = recentRating([rev(0, 2), rev(89, 4), rev(90, 5), rev(-1, 1)].map((x) => normalizeReview(x)!), TODAY);
  assert.deepEqual(r, { avg: 3, count: 2 });
});

test("weak: 90-day average 0.5+ below the overall Glassdoor rating", async () => {
  const raw = [rev(10, 3), rev(20, 3), rev(30, 3.5)];
  assert.deepEqual(await reviewSignalsFromReviews(B, raw, TODAY, undefined, 3.8), [
    {
      borrower_id: "b1",
      type: "review_distress",
      severity: "weak",
      date: TODAY,
      title: "Recent Glassdoor rating 0.6 below overall",
      snippet: "3.2 average over 3 reviews in the last 90 days vs 3.8 overall on Glassdoor",
      source_name: "Glassdoor",
      source_url: B.glassdoor_url,
    },
  ]);
});

test("weak: needs a 0.5 gap, 3 recent reviews, and a known overall rating", async () => {
  const three = (r: number) => [rev(1, r), rev(2, r), rev(3, r)];
  assert.equal((await reviewSignalsFromReviews(B, three(3.5), TODAY, undefined, 4.0)).length, 1); // exactly 0.5
  assert.equal((await reviewSignalsFromReviews(B, three(3.6), TODAY, undefined, 4.0)).length, 0); // 0.4
  assert.equal((await reviewSignalsFromReviews(B, [rev(1, 1), rev(2, 1)], TODAY, undefined, 4.5)).length, 0); // 2 reviews
  assert.equal((await reviewSignalsFromReviews(B, three(1), TODAY, undefined, null)).length, 0); // overall unknown
  assert.equal((await reviewSignalsFromReviews(B, three(1), TODAY)).length, 0);
});

test("strong and weak together", async () => {
  const raw = [rev(10, 1, "Massive layoffs."), rev(20, 2), rev(30, 2)];
  const s = await reviewSignalsFromReviews(B, raw, TODAY, undefined, 3.6);
  assert.deepEqual(s.map((x) => x.severity), ["strong", "weak"]);
});

test("glassdoorEmployerId reads Reviews and Overview URLs", () => {
  assert.equal(glassdoorEmployerId("https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm"), "1055527");
  assert.equal(glassdoorEmployerId("https://www.glassdoor.com/Overview/Working-at-Rivian-EI_IE630579.11,17.htm"), "630579");
  assert.equal(glassdoorEmployerId("https://www.glassdoor.com/Reviews/Gravie-Minneapolis-Reviews-EI_IE1055527.0,6_IL.7,18_IM567.htm"), "1055527");
  assert.equal(glassdoorEmployerId("https://www.glassdoor.com/"), null);
});

test("overallRatingFromSerp: company-wide Glassdoor page with the same id only (real results, 2026-10-10)", () => {
  const serp = {
    organic: [
      { link: "https://www.glassdoor.com/Reviews/Rivian-Irvine-Reviews-EI_IE630579.0,6_IL.7,13_IM1120.htm", description: "Employees in Irvine have given Rivian a rating of 3.9 out of 5 stars" },
      { link: "https://www.glassdoor.com/Reviews/Rivio-Reviews-E999.htm", description: "Rivio has an employee rating of 1.2 out of 5 stars" },
      { link: "https://www.glassdoor.com/Reviews/Rivian-Reviews-E630579.htm", description: "Rivian has an overall rating of 3.5 out of 5, based on over 1,928 reviews left anonymously by employees." },
    ],
  };
  assert.equal(overallRatingFromSerp(serp, "630579"), 3.5);
  const overview = { organic: [{ link: "https://www.glassdoor.com/Overview/Working-at-Gravie-EI_IE1055527.11,17.htm", description: "Gravie has an employee rating of 3.1 out of 5 stars, based on 113 company reviews" }] };
  assert.equal(overallRatingFromSerp(overview, "1055527"), 3.1);
  // Only a city page, a foreign site, or a page with no rating text: no answer.
  assert.equal(overallRatingFromSerp({ organic: [serp.organic[0]] }, "630579"), null);
  assert.equal(overallRatingFromSerp({ organic: [{ link: "https://www.glassdoor.sg/Reviews/Rivian-Reviews-E630579.htm", description: "rating of 3.5 out of 5" }] }, "630579"), null);
  assert.equal(overallRatingFromSerp({ organic: [{ link: "https://www.glassdoor.com/Reviews/Rivian-Reviews-E630579.htm", description: "Read reviews" }] }, "630579"), null);
  assert.equal(overallRatingFromSerp({}, "630579"), null);
  assert.equal(overallRatingFromSerp(null, "630579"), null);
});

test("tagger can veto a match; the stored snippet is always the source text", async () => {
  const raw = [rev(5, 3, "Layoffs coming, I heard. Management is weak.")];
  assert.deepEqual(await reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant: false })), []);
  const invented = await reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant: true, signal_type: "review_distress", snippet: "The company is failing." }));
  assert.equal(invented[0].snippet, "Layoffs coming, I heard.");
  // The model's quote differs only in whitespace: the review's own text is stored, never the model's.
  const exact = await reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant: true, signal_type: "review_distress", snippet: "Layoffs  coming, I heard.\nManagement is weak." }));
  assert.equal(exact[0].snippet, "Layoffs coming, I heard. Management is weak.");
});

test("Base44 handler: no internal token is 401; missing borrower 400; missing key fails as Reviews", async () => {
  (globalThis as any).Deno = { env: { get: (k: string) => (k === "INTERNAL_FUNCTION_TOKEN" ? "test-internal-secret-0123" : undefined) } };
  const call = (body: unknown) => handler(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await call({ borrower: B })).status, 401);
  assert.equal((await call({ internal_token: "test-internal-secret-0123" })).status, 400);
  const res = await call({ borrower: B, internal_token: "test-internal-secret-0123" });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /^Reviews: BRIGHTDATA_API_KEY/);
  delete (globalThis as any).Deno;
});

test("false alarms from review: pay amount, ideas shut down, closing shift", () => {
  for (const text of [
    "You are not paid very well.",
    "We didn't get paid enough for the hours.",
    "Haven't been paid that much compared to peers.",
    "Most of my ideas were shut down by management.",
    "I was closing the store three nights a week.",
    "Closing the office at 6 every day was fine.",
    "The project got shut down after a month.",
  ]) {
    assert.equal(hit(text), null, text);
  }
});

test("real distress still caught: closures and late pay", () => {
  for (const [text, label] of [
    ["They are closing down the Dallas office next month.", "closing"],
    ["The company is shutting down at the end of the year.", "closing"],
    ["Several store closures were announced in September.", "closing"],
    ["They are closing 12 stores this quarter.", "closing"],
    ["The company filed for bankruptcy.", "closing"],
    ["We weren't paid on time in August.", "late or missed pay"],
    ["Paychecks bounced twice.", "late or missed pay"],
    ["We have not been paid for three weeks.", "late or missed pay"],
  ]) {
    assert.equal(hit(text)?.label, label, text);
  }
});

test("sourceQuote returns the source's own text, or null when the model invented it", () => {
  const texts = ["Pay is fine.\nThey laid off   half the team in May."];
  assert.equal(sourceQuote("They laid off half the team in May.", texts), "They laid off   half the team in May.");
  assert.equal(sourceQuote("They laid off most of the team.", texts), null);
  assert.equal(sourceQuote("   ", texts), null);
  assert.equal(sourceQuote("(a+", ["(a+ literal"]), "(a+");
});

test("records with no readable date are a failure, not 'no signals'", async () => {
  await assert.rejects(reviewSignalsFromReviews(B, [{ rating: 1, pros: "x" }], TODAY), /Reviews: no review has a readable date/);
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

test("Bright Data replies: empty, error-only, odd shape fail; not-ready download is waited on", async () => {
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = ((f: () => void) => (f(), 0)) as any;
  try {
    fakeFetch({ "/scrape": [[200, []]] });
    await assert.rejects(fetchReviews(B, "k"), /Reviews: Bright Data returned no records/);
    fakeFetch({ "/scrape": [[200, [{ error: "blocked" }]]] });
    await assert.rejects(fetchReviews(B, "k"), /no records: blocked/);
    fakeFetch({ "/scrape": [[200, { status: "building" }]] });
    await assert.rejects(fetchReviews(B, "k"), /Reviews: unexpected Bright Data reply/);
    fakeFetch({
      "/scrape": [[202, { snapshot_id: "sd_abc123" }]],
      "/progress/": [[200, { status: "ready" }]],
      "/snapshot/": [[200, { status: "running", message: "Snapshot is not ready yet" }], [200, [rev(3, 4)]]],
    });
    assert.equal((await fetchReviews(B, "k")).length, 1);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
  }
});

test("crafted snapshot_id or non-Glassdoor URL is refused before any request", async () => {
  const realFetch = globalThis.fetch;
  const calls = fakeFetch({});
  try {
    for (const bad of ["../../zone/whitelist", "sd_abc/../x", "sd_ABC?x=1", 42, ""]) {
      await assert.rejects(fetchReviews(B, "k", bad), /Reviews: invalid snapshot_id/);
    }
    for (const url of ["https://evil.example.com/glassdoor.com", "http://www.glassdoor.com/x", "https://glassdoor.com.evil.io/x", "javascript:alert(1)"]) {
      await assert.rejects(fetchReviews({ ...B, glassdoor_url: url }, "k"), /glassdoor_url must be/);
    }
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("tagItem failing or giving no answer keeps the keyword match", async () => {
  const raw = [rev(5, 3, "Layoffs coming, I heard. Management is weak.")];
  const thrown = await reviewSignalsFromReviews(B, raw, TODAY, async () => {
    throw new Error("tagItem 502");
  });
  assert.equal(thrown[0].snippet, "Layoffs coming, I heard.");
  const empty = await reviewSignalsFromReviews(B, raw, TODAY, async () => null);
  assert.equal(empty[0].severity, "strong");
});

test("tagItem: review_distress or legal_layoffs confirms; exec_departure or not relevant vetoes", async () => {
  const raw = [rev(5, 3, "Layoffs coming, I heard.")];
  const as = (signal_type: string | null, relevant = true) => reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant, signal_type: signal_type ?? undefined, snippet: "Layoffs coming" }));
  assert.equal((await as("review_distress")).length, 1);
  assert.equal((await as("legal_layoffs")).length, 1);
  assert.equal((await as("legal_layoffs"))[0].snippet, "Layoffs coming");
  assert.deepEqual(await as("exec_departure"), []);
  assert.deepEqual(await as(null), []);
  assert.deepEqual(await as("review_distress", false), []);
});

test("refreshBorrower contract: still-building Glassdoor answers 503 + snapshot_id, and a resume collects it", async () => {
  const realFetch = globalThis.fetch;
  const realSetTimeout = globalThis.setTimeout;
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => (clock += 5_000); // every look at the clock moves 5 s, so the poll budget runs out fast
  (globalThis as any).setTimeout = ((f: () => void) => (f(), 0)) as any;
  (globalThis as any).Deno = { env: { get: (k: string) => (k === "BRIGHTDATA_API_KEY" ? "k" : k === "INTERNAL_FUNCTION_TOKEN" ? "test-internal-secret-0123" : undefined) } };
  const call = async (body: unknown) => {
    const res = await handler(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  try {
    // First refresh: Bright Data hands back a snapshot that never finishes in time.
    fakeFetch({ "/scrape": [[202, { snapshot_id: "sd_glass123" }]], "/progress/": [[200, { status: "running" }]] });
    const first = await call({ borrower: B, today: TODAY, internal_token: "test-internal-secret-0123" });
    assert.equal(first.status, 503); // refreshBorrower stores pending_snapshots.reviewSignals
    assert.equal(first.body.snapshot_id, "sd_glass123");

    // Next refresh passes it back: no new scrape, the ready snapshot is scored.
    const calls = fakeFetch({ "/progress/": [[200, { status: "ready" }]], "/snapshot/": [[200, [rev(5, 1, "Layoffs again.")]]] });
    const second = await call({ borrower: B, today: TODAY, snapshot_id: "sd_glass123", internal_token: "test-internal-secret-0123" });
    assert.equal(second.status, 200);
    assert.equal(second.body[0].title, "Employee review mentions layoffs");
    assert.ok(calls.every((u) => !u.includes("/scrape")));
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    Date.now = realNow;
    delete (globalThis as any).Deno;
  }
});
