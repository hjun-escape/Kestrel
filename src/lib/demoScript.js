// Presenter mode script for the live demo (docs/PLAN.md §1). P4 owns this
// file: edit the captions or the steps here, no other code needs to change.
//
// Presenter mode is off for every visitor. Turn it on with ?demo=1 on any page
// (or Shift+D), step with the Left/Right arrow keys or Prev/Next, leave with
// Esc. It stays on for the browser tab until you leave it.
//
// Each step:
//   id       unique name
//   route    page to open: a path, or a function of the picked companies that
//            returns one (null stays on the current page)
//   press    optional data-demo id to press before outlining (selects a tab)
//   target   data-demo id of the element to outline: a string, or a function
//            of the picked companies
//   caption  what the presenter says, one or two short sentences: a string, or
//            a function of the picked companies (name them in the caption)
//
// Companies are picked live from the loan book (src/lib/demoPicks.js):
//   redApplicant    a checked Red applicant, real company preferred
//   yellowBorrower  a checked Yellow borrower, real company preferred
// "Real" means its website is not a .example placeholder. To show one
// particular company, put its exact name in DEMO_PINS.
//
// data-demo ids on the screens:
//   loan book       loanbook-table, status-legend, screen-applicant, load-demo,
//                   tab-all, tab-applicants, tab-borrowers, row-<company id>
//   company page    status-why, sources, score, evidence, documents,
//                   audit-trail, audit-open (press it to open the audit trail)

export const DEMO_PINS = {
  redApplicant: "",
  yellowBorrower: "",
};

const redApplicantPage = ({ redApplicant }) => (redApplicant ? `/borrower/${redApplicant.id}` : null);

// "$12M" for the caption; empty when the amount is missing.
function millions(n) {
  const num = Number(n);
  return Number.isFinite(num) && num >= 1e6 ? `$${Math.round(num / 1e6)}M` : "";
}

export const DEMO_STEPS = [
  {
    id: "loan-book",
    route: "/",
    press: "tab-all",
    target: "loanbook-table",
    caption: "The loan book lists every applicant and borrower, worst first. Status counts only public signs from the last 90 days.",
  },
  {
    id: "legend",
    route: "/",
    press: "tab-all",
    target: "status-legend",
    caption: "Colors come from fixed rules, not AI, and the rules are on screen. Testers asked us to spell them out.",
  },
  {
    id: "screen",
    route: "/",
    press: "tab-all",
    target: "screen-applicant",
    caption: "A credit officer screens a new applicant with a name, website and city. News comes back in seconds; jobs and reviews follow.",
  },
  {
    id: "status",
    route: redApplicantPage,
    target: "status-why",
    caption: ({ redApplicant }) => {
      if (!redApplicant) return "This applicant is Red. The line beside the status names the signals that put it there.";
      const asked = millions(redApplicant.loan_amount_usd);
      return `${redApplicant.name}${asked ? ` asked for ${asked}. It` : ""} is Red. The line beside the status names the signals, and the rule under it shows how they were counted.`;
    },
  },
  {
    id: "evidence",
    route: redApplicantPage,
    target: "evidence",
    caption: "Every signal quotes its source, links to it, and says what to ask the company next.",
  },
  {
    id: "documents",
    route: redApplicantPage,
    target: "documents",
    caption: "Before spending a week on the deal, the officer asks for these documents first.",
  },
  {
    id: "audit",
    route: redApplicantPage,
    press: "audit-open",
    target: "audit-trail",
    caption: "Every check, finding and decision is logged with who and when, and downloads for the credit file. Testers asked for this too.",
  },
  {
    id: "borrowers",
    route: "/",
    press: "tab-borrowers",
    target: ({ yellowBorrower }) => (yellowBorrower ? `row-${yellowBorrower.id}` : "loanbook-table"),
    caption: ({ yellowBorrower }) =>
      `After the loan, the same checks keep running. ${yellowBorrower ? yellowBorrower.name : "This borrower"} has turned Yellow since funding.`,
  },
];
