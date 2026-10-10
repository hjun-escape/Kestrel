// Real data: Gravie (Minneapolis, mid-size private) Glassdoor reviews page, sorted newest first,
// scraped through Bright Data's unlocker on 2026-10-10. Text is copied exactly from the page.
// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { findDistress, normalizeReview, reviewSignalsFromReviews, type Borrower } from "../base44/functions/reviewSignals/entry.ts";

const TODAY = "2026-10-10";
const GRAVIE: Borrower = {
  id: "gravie",
  name: "Gravie",
  website_domain: "gravie.com",
  hq_city: "Minneapolis",
  glassdoor_url: "https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm",
};

const PAGE_1 = [
  {
    date: "Oct 5, 2026",
    rating: 4.0,
    title: "Great benefits and work-life balance, but low pay",
    pros: "Great health insurance benefits, decent work life balance and management was hands off which I appreciate.",
    cons: "The pay is pretty low, high turn over and processes change frequently",
    url: "https://www.glassdoor.com/Reviews/Employee-Review-Gravie-E1055527-RVW105854004.htm",
  },
  {
    date: "Sep 23, 2026",
    rating: 4.0,
    title: "Meaningful mission with great work-life balance, but few advancement options",
    pros: "Love the mission of trying to change health insurance and great work life balance",
    cons: "Lack of career opportunities to advance",
    url: "https://www.glassdoor.com/Reviews/Employee-Review-Gravie-E1055527-RVW105702815.htm",
  },
  {
    date: "Sep 14, 2026",
    rating: 1.0,
    title: "Snacks and benefits can't fix poor leadership",
    pros: "Good snacks, good healthcare benefits",
    cons: "Poor leadership, poor culture, poor job stability",
    url: "https://www.glassdoor.com/Reviews/Employee-Review-Gravie-E1055527-RVW105570882.htm",
  },
];

test("real Glassdoor dates parse to the right day", () => {
  assert.deepEqual(PAGE_1.map((r) => normalizeReview(r)!.date), ["2026-10-05", "2026-09-23", "2026-09-14"]);
  assert.equal(normalizeReview(PAGE_1[0])!.rating, 4);
  assert.equal(normalizeReview(PAGE_1[0])!.url, PAGE_1[0].url);
});

test("real complaints about low pay and turnover are not distress", async () => {
  assert.deepEqual(await reviewSignalsFromReviews(GRAVIE, PAGE_1, TODAY), []);
});

test("real review quote 'Countless layoffs.' is caught with an exact snippet", () => {
  // From Glassdoor's "cons" summary for Gravie on the same page.
  const r = normalizeReview({ date: "Oct 1, 2026", rating: 2, cons: "Countless layoffs." })!;
  assert.deepEqual(findDistress(r), { label: "layoffs", snippet: "Countless layoffs." });
});
