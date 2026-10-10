// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
  fetchReviews,
  sourceQuote,
  findDistress,
  normalizeReview,
  ratingTrend,
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

test("ratingTrend splits 0-89 and 90-454 days", () => {
  const t = ratingTrend([rev(0, 2) as any, rev(89, 4), rev(90, 5), rev(454, 3), rev(455, 1), rev(-1, 1)].map((r) => normalizeReview(r)!), TODAY);
  assert.deepEqual(t, { recentAvg: 3, recentCount: 2, priorAvg: 4, priorCount: 2 });
});

test("weak: 90-day average 0.5+ below prior 12 months", async () => {
  const raw = [rev(10, 3), rev(20, 3), rev(30, 3.5), rev(120, 4), rev(200, 3.5), rev(300, 4)];
  const s = await reviewSignalsFromReviews(B, raw, TODAY);
  assert.deepEqual(s, [
    {
      borrower_id: "b1",
      type: "review_distress",
      severity: "weak",
      date: TODAY,
      title: "Glassdoor rating down 0.7 in 90 days",
      snippet: "3.2 average over 3 reviews in last 90 days vs 3.8 over 3 in the prior 12 months",
      source_name: "Glassdoor",
      source_url: B.glassdoor_url,
    },
  ]);
});

test("weak: needs a 0.5 drop and 3 reviews in each window", async () => {
  // drop of exactly 0.5 counts
  assert.equal((await reviewSignalsFromReviews(B, [rev(1, 3.5), rev(2, 3.5), rev(3, 3.5), rev(100, 4), rev(101, 4), rev(102, 4)], TODAY)).length, 1);
  // drop of 0.4 does not
  assert.equal((await reviewSignalsFromReviews(B, [rev(1, 3.6), rev(2, 3.6), rev(3, 3.6), rev(100, 4), rev(101, 4), rev(102, 4)], TODAY)).length, 0);
  // only 2 recent reviews
  assert.equal((await reviewSignalsFromReviews(B, [rev(1, 1), rev(2, 1), rev(100, 5), rev(101, 5), rev(102, 5)], TODAY)).length, 0);
});

test("strong and weak together", async () => {
  const raw = [rev(10, 1, "Massive layoffs."), rev(20, 2), rev(30, 2), rev(120, 4), rev(200, 4), rev(300, 4)];
  const s = await reviewSignalsFromReviews(B, raw, TODAY);
  assert.deepEqual(s.map((x) => x.severity), ["strong", "weak"]);
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

test("Base44 handler: missing borrower is 400, missing key fails as Reviews", async () => {
  (globalThis as any).Deno = { env: { get: () => undefined } };
  const call = (body: unknown) => handler(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
  assert.equal((await call({})).status, 400);
  const res = await call({ borrower: B });
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
