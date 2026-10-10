// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, {
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

test("tagger can veto a match, and its snippet is kept only if exact", async () => {
  const raw = [rev(5, 3, "Layoffs coming, I heard. Management is weak.")];
  assert.deepEqual(await reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant: false })), []);
  const invented = await reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant: true, signal_type: "review_distress", snippet: "The company is failing." }));
  assert.equal(invented[0].snippet, "Layoffs coming, I heard.");
  const exact = await reviewSignalsFromReviews(B, raw, TODAY, async () => ({ relevant: true, signal_type: "review_distress", snippet: "Layoffs  coming, I heard. Management is weak." }));
  assert.equal(exact[0].snippet, "Layoffs  coming, I heard. Management is weak.");
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
