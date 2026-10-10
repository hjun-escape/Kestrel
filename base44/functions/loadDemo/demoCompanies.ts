// Demo companies loaded by "Load demo companies" (loadDemo). Real mid-size companies with recent public warning
// signs, plus clean contrasts. Loan amounts are fictional. `note` documents why each one is in the demo and is never
// saved. LinkedIn / Glassdoor pages are left empty: findCompanyPages looks them up and verifies them on the first
// refresh. The client copy in src/lib/demoCompanies.js must stay identical (tests/loadDemo.test.ts checks).

export interface DemoCompany {
  name: string;
  website_domain: string;
  hq_city: string;
  hq_state: string;
  industry: string;
  stage: "applicant" | "borrower";
  loan_amount_usd: number;
  note: string;
}

export const DEMO_COMPANIES: readonly DemoCompany[] = [
  { name: "Amy's Kitchen", website_domain: "amys.com", hq_city: "Petaluma", hq_state: "CA", industry: "Frozen food manufacturing", stage: "applicant", loan_amount_usd: 18000000, note: "Plant closures and a WARN investigation." },
  { name: "Essendant", website_domain: "essendant.com", hq_city: "Deerfield", hq_state: "IL", industry: "Office products distribution", stage: "applicant", loan_amount_usd: 35000000, note: "About 1,300 layoffs, WARN notices and a state investigation." },
  { name: "Ruiz Foods", website_domain: "ruizfoods.com", hq_city: "Dinuba", hq_state: "CA", industry: "Frozen food manufacturing", stage: "applicant", loan_amount_usd: 12000000, note: "176 layoffs." },
  { name: "Stone Brewing", website_domain: "stonebrewing.com", hq_city: "Escondido", hq_state: "CA", industry: "Craft brewing", stage: "borrower", loan_amount_usd: 8000000, note: "Sale of the company and layoffs." },
  { name: "Bob's Red Mill", website_domain: "bobsredmill.com", hq_city: "Milwaukie", hq_state: "OR", industry: "Food manufacturing", stage: "applicant", loan_amount_usd: 6000000, note: "Likely clean: a contrast." },
  { name: "Rivian", website_domain: "rivian.com", hq_city: "Irvine", hq_state: "CA", industry: "Electric vehicles", stage: "borrower", loan_amount_usd: 25000000, note: "CFO departure. Public company, included as a known-good live example." },
];
