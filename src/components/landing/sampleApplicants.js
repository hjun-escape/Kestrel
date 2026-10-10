// Sample applicants for the landing hero's pipeline. Fictional companies, items and quotes, labelled as samples
// on the page. Sources are generic labels, never real outlets, so no made-up story is attributed to a real one. Each has one example item per source lane (news, court filings, job posts, reviews, LinkedIn)
// and the flags that reach its report, with the severity the app would assign.
// verifyPass: how much of what reaches Verify survives (a clean company drops everything there).

export const SAMPLE_APPLICANTS = [
  {
    id: "northfield",
    name: "Northfield Battery Works",
    domain: "northfieldbattery.com",
    city: "Reno",
    state: "NV",
    detail: "Applicant, $4.5M term loan requested",
    verifyPass: 0.998,
    items: [
      ["“Northfield CFO Dana Whitlock steps down” · Business news (sample)", "“Northfield opens a second Reno line” · Local news (sample)", "“Battery makers face a cathode squeeze” · Industry news (sample)"],
      ["WARN notice: 125 jobs, Reno facility · State WARN notice", "UCC-1 lien, Sierra Equipment Finance · State lien filings", "Small-claims case, Northfield Farms (Ohio) · different company"],
      ["Process engineer, Reno · posted Aug 2", "Line supervisor · posting removed Sep 18", "14 openings in the last 30 days vs 37/month before"],
      ["“Paychecks were late twice in September” · Employee review (sample)", "“Great team, long shifts” · Employee review (sample)", "“Layoffs announced at the all-hands” · Employee review (sample)"],
      ["Dana Whitlock · CFO · Jan 2021 – Sep 2026", "Marcus Lee · COO · still at Northfield", "Company headcount 412 → 381"],
    ],
    flags: [
      { id: "cfo", title: "CFO departure", when: "Sep 10", date: "2026-09-10", type: "exec_departure", severity: "strong", source: "Business news (sample)" },
      { id: "warn", title: "WARN notice, 125 jobs", when: "Sep 24", date: "2026-09-24", type: "legal_layoffs", severity: "strong", source: "State WARN notice" },
      { id: "late", title: "3 late payments to 2 lenders", when: "Jul to Sep", date: "2026-08-31", type: "legal_layoffs", severity: "weak", source: "Cash-flow statement" },
    ],
  },
  {
    id: "sagebrush",
    name: "Sagebrush Freight Co.",
    domain: "sagebrushfreight.com",
    city: "Boise",
    state: "ID",
    detail: "Applicant, $2.8M equipment line requested",
    verifyPass: 0.998,
    items: [
      ["“Sagebrush Freight adds 40 trucks” · Business news (sample)", "“Regional carriers squeezed by diesel prices” · Trade press (sample)", "“Sagebrush wins Boise distribution contract” · Local news (sample)"],
      ["Pinecrest Bank v. Sagebrush Freight Co. · County court", "Sagebrush Farms LLC dispute · different company", "UCC-1 lien, Treasure Valley Leasing · State lien filings"],
      ["Dispatch coordinator · posted Sep 3", "CDL drivers: 9 openings in 30 days vs 15/month before", "Fleet mechanic · posted Aug 21"],
      ["“Solid pay, dispatch is chaotic” · Employee review (sample)", "“Good routes, old trucks” · Employee review (sample)", "“Management listens” · Employee review (sample)"],
      ["Rae Okafor · CEO · still at Sagebrush", "Tom Briggs · CFO · since 2022", "Company headcount 188 → 176"],
    ],
    flags: [
      { id: "suit", title: "Lender lawsuit: Pinecrest Bank", when: "Aug 18", date: "2026-08-18", type: "legal_layoffs", severity: "strong", source: "County court" },
      { id: "hiring", title: "Hiring down 40%", when: "Sep 30", date: "2026-09-30", type: "hiring_drop", severity: "weak", source: "Job posts" },
    ],
  },
  {
    id: "harbor",
    name: "Harbor Tool and Die",
    domain: "harbortool.com",
    city: "Toledo",
    state: "OH",
    detail: "Applicant, $1.2M working capital requested",
    verifyPass: 0.9, // nothing it finds is a verified warning sign
    items: [
      ["“Harbor Tool named supplier of the year” · Local news (sample)", "“Ohio tool shops see steady orders” · Business news (sample)", "“Harbor adds a second shift” · Local news (sample)"],
      ["Harbor Marine Supply recall · different company", "No liens on file · State lien filings", "Zoning permit, new loading dock · Toledo"],
      ["CNC machinist · posted Sep 12", "6 openings in 30 days vs 5/month before", "Quality inspector · posted Aug 30"],
      ["“Fair pay and real training” · Employee review (sample)", "“Busy but well run” · Employee review (sample)", "“Good benefits” · Employee review (sample)"],
      ["Ana Ruiz · CEO · since 2015", "Paul Dorsey · CFO · since 2019", "Company headcount 96 → 101"],
    ],
    flags: [],
  },
];
