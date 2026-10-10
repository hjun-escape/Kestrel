// Real data: LinkedIn public job search for keyword "Gravie" (United States), scraped through Bright Data's
// unlocker on 2026-10-10. 60 results, only 3 from Gravie. A sample is kept here exactly as the page showed it.
// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { countPostings, hiringSignalFromJobs, isSameCompany, type Borrower, type Job } from "../base44/functions/hiringSignal/entry.ts";

const TODAY = "2026-10-10";
const GRAVIE: Borrower = { id: "gravie", name: "Gravie", hq_city: "Minneapolis", linkedin_url: "https://www.linkedin.com/company/gravie" };

const row = (company_name: string, slug: string, job_posted_time: string, id: string): Job => ({
  company_name,
  company_url: `https://www.linkedin.com/company/${slug}?trk=public_jobs_jserp-result_job-search-card-subtitle`,
  job_posted_time,
  url: `https://www.linkedin.com/jobs/view/${id}`,
});

const SEARCH = [
  row("Gravie", "gravie", "2 weeks ago", "director-corporate-it-at-gravie-4462320883"),
  row("REGAL", "regal-ai-official", "2 months ago", "ai-product-specialist-at-regal-4452493497"),
  row("Gravitee", "gravitee-io", "3 weeks ago", "partnership-manager-at-gravitee-4440188296"),
  row("Gravie", "gravie", "1 week ago", "staff-ai-test-automation-engineer-at-gravie-4465152191"),
  row("Gravitee", "gravitee-io", "7 hours ago", "product-manager-at-gravitee-4469249795"),
  row("Gravity", "aigravity", "1 month ago", "founding-sdr-at-gravity-4460589999"),
  row("Gravitate", "gravitate-energy", "4 months ago", "functional-delivery-consultant-at-gravitate-4423341358"),
  row("Gravie", "gravie", "2 days ago", "office-manager-facilities-lead-at-gravie-4468335846"),
  row("Gravis Robotics", "gravisrobotics", "1 month ago", "field-robotics-engineer-us-at-gravis-robotics-4453173501"),
  { ...row("Granola", "meetgranola", "3 days ago", "sales-development-representative-at-granola-4371300864"), company_url: "https://uk.linkedin.com/company/meetgranola?trk=x" },
];

test("keyword search noise: only Gravie's own postings are kept", () => {
  const mine = SEARCH.filter((j) => isSameCompany(j, GRAVIE));
  assert.deepEqual(mine.map((j) => j.company_name), ["Gravie", "Gravie", "Gravie"]);
});

test("lookalike names never match by name when the LinkedIn URL is known", () => {
  assert.equal(isSameCompany(row("Gravie", "gravie-uk", "1 day ago", "x"), GRAVIE), false);
});

test("relative dates from the real page are counted in the right window", () => {
  const mine = SEARCH.filter((j) => isSameCompany(j, GRAVIE));
  assert.deepEqual(countPostings(mine, TODAY), { recent: 3, prior60: 0, priorPer30: 0, dropPct: null });
});

test("no prior postings: no hiring_drop signal for Gravie", () => {
  assert.deepEqual(hiringSignalFromJobs(GRAVIE, SEARCH, TODAY), []);
});
