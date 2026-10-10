// Sample applicants for the landing hero's pipeline. Fictional companies, items and quotes, labelled as samples
// on the page. Each has one example item per source lane (news, court filings, job posts, reviews, LinkedIn)
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
      ["“Northfield CFO Dana Whitlock steps down” · Electrek", "“Northfield opens a second Reno line” · Reno Gazette", "“Battery makers face a cathode squeeze” · Reuters"],
      ["WARN notice: 125 jobs, Reno facility · Nevada DETR", "UCC-1 lien, Sierra Equipment Finance · Nevada SOS", "Small-claims case, Northfield Farms (Ohio) · different company"],
      ["Process engineer, Reno · posted Aug 2", "Line supervisor · posting removed Sep 18", "14 openings in the last 30 days vs 37/month before"],
      ["“Paychecks were late twice in September” · Glassdoor", "“Great team, long shifts” · Glassdoor", "“Layoffs announced at the all-hands” · Indeed"],
      ["Dana Whitlock · CFO · Jan 2021 – Sep 2026", "Marcus Lee · COO · still at Northfield", "Company headcount 412 → 381"],
    ],
    flags: [
      { id: "cfo", title: "CFO departure", when: "Sep 10", date: "2026-09-10", type: "exec_departure", severity: "strong", source: "Electrek" },
      { id: "warn", title: "WARN notice, 125 jobs", when: "Sep 24", date: "2026-09-24", type: "legal_layoffs", severity: "strong", source: "Nevada DETR" },
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
      ["“Sagebrush Freight adds 40 trucks” · Idaho Business Review", "“Regional carriers squeezed by diesel prices” · FreightWaves", "“Sagebrush wins Boise distribution contract” · KTVB"],
      ["Pinecrest Bank v. Sagebrush Freight Co. · Ada County", "Sagebrush Farms LLC dispute · different company", "UCC-1 lien, Treasure Valley Leasing · Idaho SOS"],
      ["Dispatch coordinator · posted Sep 3", "CDL drivers: 9 openings in 30 days vs 15/month before", "Fleet mechanic · posted Aug 21"],
      ["“Solid pay, dispatch is chaotic” · Glassdoor", "“Good routes, old trucks” · Indeed", "“Management listens” · Glassdoor"],
      ["Rae Okafor · CEO · still at Sagebrush", "Tom Briggs · CFO · since 2022", "Company headcount 188 → 176"],
    ],
    flags: [
      { id: "suit", title: "Lender lawsuit: Pinecrest Bank", when: "Aug 18", date: "2026-08-18", type: "legal_layoffs", severity: "strong", source: "Ada County court" },
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
      ["“Harbor Tool named supplier of the year” · Toledo Blade", "“Ohio tool shops see steady orders” · Crain's", "“Harbor adds a second shift” · WTOL"],
      ["Harbor Freight Tools recall · different company", "No liens on file · Ohio SOS", "Zoning permit, new loading dock · Toledo"],
      ["CNC machinist · posted Sep 12", "6 openings in 30 days vs 5/month before", "Quality inspector · posted Aug 30"],
      ["“Fair pay and real training” · Glassdoor", "“Busy but well run” · Indeed", "“Good benefits” · Glassdoor"],
      ["Ana Ruiz · CEO · since 2015", "Paul Dorsey · CFO · since 2019", "Company headcount 96 → 101"],
    ],
    flags: [],
  },
];
