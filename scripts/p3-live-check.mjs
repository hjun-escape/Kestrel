// P3 live check: run hiringSignal and reviewSignals against one real company through Bright Data,
// time each call, and print the record fields so the dataset IDs and field names can be confirmed.
// Paste the output in the PR (PLAN.md agent rule 3: verify before you push).
//
// Run: node --env-file=.env scripts/p3-live-check.mjs '<borrower JSON>'
//   e.g. '{"name":"Acme Widgets","linkedin_url":"https://www.linkedin.com/company/acme-widgets/","glassdoor_url":"https://www.glassdoor.com/Reviews/Acme-Reviews-E123.htm"}'
// Add "jobs" or "reviews" after the JSON to run only one. Needs BRIGHTDATA_API_KEY in .env (never commit it).

import { existsSync } from "node:fs";

const key = process.env.BRIGHTDATA_API_KEY;
if (!key) {
  console.error("Set BRIGHTDATA_API_KEY in .env");
  process.exit(1);
}
const borrower = JSON.parse(process.argv[2] ?? "null");
if (!borrower?.name) {
  console.error("Pass a borrower JSON with at least name, linkedin_url and glassdoor_url");
  process.exit(1);
}
const only = process.argv[3];
const today = new Date().toISOString().slice(0, 10);

async function check(label, file, run) {
  if (only && only !== label) return;
  if (!existsSync(new URL(file, import.meta.url))) return console.log(`\n## ${label}: ${file} not on this branch, skipped`);
  const mod = await import(file);
  console.log(`\n## ${label}`);
  const t0 = Date.now();
  try {
    const records = await run(mod);
    console.log(`records: ${records.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (records[0]) console.log(`fields of first record: ${Object.keys(records[0]).join(", ")}`);
    if (records[0]) console.log(`first record: ${JSON.stringify(records[0]).slice(0, 800)}`);
    return { mod, records };
  } catch (e) {
    console.log(`FAILED after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${e.message}`);
    if (e.snapshot_id) console.log(`resume later with snapshot_id ${e.snapshot_id}`);
  }
}

const jobs = await check("jobs", "../base44/functions/hiringSignal/entry.ts", (m) => m.fetchJobs(borrower, key));
if (jobs) {
  const mine = jobs.records.filter((j) => jobs.mod.isSameCompany(j, borrower));
  console.log(`same-company postings: ${mine.length}`);
  console.log("counts:", jobs.mod.countPostings(mine, today));
  console.log("signals:", JSON.stringify(jobs.mod.hiringSignalFromJobs(borrower, jobs.records, today), null, 2));
}

const reviews = await check("reviews", "../base44/functions/reviewSignals/entry.ts", (m) => m.fetchReviews(borrower, key));
if (reviews) {
  const parsed = reviews.records.map(reviews.mod.normalizeReview).filter(Boolean);
  console.log(`reviews with a usable date: ${parsed.length}`);
  console.log("rating trend:", reviews.mod.ratingTrend(parsed, today));
  console.log("signals:", JSON.stringify(await reviews.mod.reviewSignalsFromReviews(borrower, reviews.records, today), null, 2));
}
