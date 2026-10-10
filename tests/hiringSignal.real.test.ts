// Real data: LinkedIn public job search for keyword "Gravie" (United States), scraped through Bright Data's
// unlocker on 2026-10-10. 60 results, only 3 from Gravie. A sample is kept here exactly as the page showed it.
// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hiringSignalFromData, isSameCompany, openPostings, type Borrower, type Job } from "../base44/functions/hiringSignal/entry.ts";

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

// Live Bright Data, 2026-10-10: the jobs dataset returned 34 Gravie postings, and the LinkedIn company page
// gave employees_in_linkedin 490, industries "Insurance".
const GRAVIE_COMPANY = { employees_in_linkedin: 490, company_size: "201-500 employees", industries: "Insurance" };

test("real search sample: Gravie's 3 postings are counted, lookalikes are not", () => {
  assert.equal(openPostings(SEARCH, GRAVIE), 3);
});

test("real Gravie numbers: 34 open vs ~25 expected is healthy, no signal", () => {
  const live = Array.from({ length: 34 }, (_, i) => row("Gravie", "gravie", "1 week ago", `gravie-job-${i}`));
  assert.deepEqual(hiringSignalFromData(GRAVIE, live, GRAVIE_COMPANY, TODAY), []);
});

test("if Gravie had only the 3 postings in the sample, that would be strong", () => {
  const s = hiringSignalFromData(GRAVIE, SEARCH, GRAVIE_COMPANY, TODAY);
  assert.equal(s[0].severity, "strong");
  assert.equal(s[0].snippet, "3 open postings vs ~25 expected for 490 employees (Financial activities: 5.1% openings rate, BLS)");
});
