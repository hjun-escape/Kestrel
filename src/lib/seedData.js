// SEED DATA — all placeholder companies and signals in one file.
// Swap this for real companies later; the app seeds the database from here
// on first load (only when the Borrower table is empty). All names and domains
// are fictional.
//
// Mix (docs/PLAN.md): 2 applicants (one in trouble, one clean),
// 3 borrowers (Red, Yellow, Green).
//
// Severity follows the signal rules in CLAUDE.md:
//   hiring_drop     ≥50% drop = strong, 25–50% = weak, under 25% = no signal
//   review_distress layoffs / furloughs / late or missed pay / closing = strong,
//                   90-day avg rating ≥0.5 below prior 12 months = weak
//   exec_departure  CEO / CFO = strong, other senior roles = weak
//   legal_layoffs   WARN notice, bankruptcy, lender or supplier lawsuit = strong,
//                   anything else = weak
//
// Status is set by hand from the status rules (P3's scoreBorrower will compute it):
//   RED    = 2+ strong, or 1 strong + 2 weak.
//   YELLOW = 1 strong, or 2+ weak.
//   GREEN  = otherwise.
// Why line: "<Status>: " + up to 2 top signals (strong first, then newest), joined with " + ".
//
// Every signal date falls between Aug 1 and Oct 9, 2026.
// Every snippet starts with "[placeholder]" and every source_url is "https://example.com".

export const SEED_COMPANIES = [
  // Applicant, RED: 2 strong + 1 weak
  {
    name: "Crestline Logistics LLC",
    website_domain: "crestlinelogistics.example",
    hq_city: "Memphis",
    hq_state: "TN",
    industry: "Freight & logistics",
    stage: "applicant",
    loan_amount_usd: 2800000,
    linkedin_url: "https://www.linkedin.com/company/crestline-logistics-example",
    glassdoor_url: "https://www.glassdoor.com/crestline-logistics-example",
    status: "red",
    why: "Red: equipment lender lawsuit (Sep 29) + CFO departure (Sep 15).",
    last_refreshed: "2026-10-10T17:20:00Z",
    sources_unavailable: [],
    signals: [
      {
        type: "legal_layoffs",
        severity: "strong",
        date: "2026-09-29",
        title: "Equipment lender sues Crestline Logistics over missed payments",
        snippet: "[placeholder] The lender alleges Crestline missed three consecutive payments on its trailer financing.",
        source_name: "Google News (placeholder)",
        source_url: "https://example.com",
      },
      {
        type: "exec_departure",
        severity: "strong",
        date: "2026-09-15",
        title: "Crestline Logistics CFO steps down",
        snippet: "[placeholder] Crestline Logistics said its chief financial officer stepped down, effective immediately.",
        source_name: "Google News (placeholder)",
        source_url: "https://example.com",
      },
      {
        type: "hiring_drop",
        severity: "weak",
        date: "2026-10-08",
        title: "Job postings down 35% in 30 days",
        snippet: "[placeholder] 26 postings in last 30 days vs 40/month before",
        source_name: "Job postings (placeholder)",
        source_url: "https://example.com",
      },
    ],
  },

  // Applicant, GREEN: no signals
  {
    name: "Pinecrest Foods Corp.",
    website_domain: "pinecrestfoods.example",
    hq_city: "Fresno",
    hq_state: "CA",
    industry: "Food production",
    stage: "applicant",
    loan_amount_usd: 1900000,
    linkedin_url: "https://www.linkedin.com/company/pinecrest-foods-example",
    glassdoor_url: "https://www.glassdoor.com/pinecrest-foods-example",
    status: "green",
    why: "Green: no warning signs in the last 90 days.",
    last_refreshed: "2026-10-10T17:05:00Z",
    sources_unavailable: [],
    signals: [],
  },

  // Borrower, RED: 2 strong + 1 weak. Reviews source unavailable.
  {
    name: "Northfield Packaging Co.",
    website_domain: "northfieldpackaging.example",
    hq_city: "Akron",
    hq_state: "OH",
    industry: "Packaging",
    stage: "borrower",
    loan_amount_usd: 4500000,
    linkedin_url: "https://www.linkedin.com/company/northfield-packaging-example",
    glassdoor_url: "https://www.glassdoor.com/northfield-packaging-example",
    status: "red",
    why: "Red: CFO departure (Sep 12) + job postings down 62% in 30 days.",
    last_refreshed: "2026-10-10T16:40:00Z",
    sources_unavailable: ["Reviews"],
    signals: [
      {
        type: "exec_departure",
        severity: "strong",
        date: "2026-09-12",
        title: "Northfield Packaging CFO resigns",
        snippet: "[placeholder] Northfield Packaging confirmed its chief financial officer resigned and an interim replacement has not been named.",
        source_name: "Google News (placeholder)",
        source_url: "https://example.com",
      },
      {
        type: "hiring_drop",
        severity: "strong",
        date: "2026-09-08",
        title: "Job postings down 62% in 30 days",
        snippet: "[placeholder] 14 postings in last 30 days vs 37/month before",
        source_name: "Job postings (placeholder)",
        source_url: "https://example.com",
      },
      {
        type: "legal_layoffs",
        severity: "weak",
        date: "2026-08-21",
        title: "Former employee files wage claim against Northfield",
        snippet: "[placeholder] A former shift supervisor filed a wage-and-hour claim against Northfield Packaging.",
        source_name: "Google News (placeholder)",
        source_url: "https://example.com",
      },
    ],
  },

  // Borrower, YELLOW: 1 strong + 1 weak (turned Yellow since funding)
  {
    name: "Meridian Springs Manufacturing",
    website_domain: "meridiansprings.example",
    hq_city: "Erie",
    hq_state: "PA",
    industry: "Industrial manufacturing",
    stage: "borrower",
    loan_amount_usd: 6200000,
    linkedin_url: "https://www.linkedin.com/company/meridian-springs-example",
    glassdoor_url: "https://www.glassdoor.com/meridian-springs-example",
    status: "yellow",
    why: "Yellow: employee reviews mention furloughs (Sep 24) + customer contract dispute (Aug 19).",
    last_refreshed: "2026-10-10T16:10:00Z",
    sources_unavailable: [],
    signals: [
      {
        type: "review_distress",
        severity: "strong",
        date: "2026-09-24",
        title: "Recent review mentions furloughs and late pay",
        snippet: "[placeholder] Second round of furloughs this quarter, and payroll came two days late.",
        source_name: "Glassdoor (placeholder)",
        source_url: "https://example.com",
      },
      {
        type: "legal_layoffs",
        severity: "weak",
        date: "2026-08-19",
        title: "Customer files contract dispute against Meridian Springs",
        snippet: "[placeholder] A customer filed suit claiming late delivery under a supply contract.",
        source_name: "Google News (placeholder)",
        source_url: "https://example.com",
      },
    ],
  },

  // Borrower, GREEN: 1 weak
  {
    name: "Lakeshore Components Inc.",
    website_domain: "lakeshorecomponents.example",
    hq_city: "Gary",
    hq_state: "IN",
    industry: "Electronics manufacturing",
    stage: "borrower",
    loan_amount_usd: 3100000,
    linkedin_url: "https://www.linkedin.com/company/lakeshore-components-example",
    glassdoor_url: "https://www.glassdoor.com/lakeshore-components-example",
    status: "green",
    why: "Green: no warning signs in the last 90 days.",
    last_refreshed: "2026-10-10T15:45:00Z",
    sources_unavailable: [],
    signals: [
      {
        type: "review_distress",
        severity: "weak",
        date: "2026-09-30",
        title: "Review rating down 0.6 over 90 days",
        snippet: "[placeholder] 90-day average rating 3.1 vs 3.7 over the prior 12 months",
        source_name: "Glassdoor (placeholder)",
        source_url: "https://example.com",
      },
    ],
  },
];
