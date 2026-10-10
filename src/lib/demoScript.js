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
//   caption  what the presenter says, one or two short sentences
//
// Companies are picked live from the loan book (src/lib/demoPicks.js):
//   redApplicant    a checked Red applicant, real company preferred
//   yellowBorrower  a checked Yellow borrower, real company preferred
// "Real" means its website is not a .example placeholder. To show one
// particular company, put its exact name in DEMO_PINS.
//
// data-demo ids on the screens: loanbook-table, screen-applicant, tab-all,
// tab-applicants, tab-borrowers, row-<company id>, status-why, evidence,
// documents.

export const DEMO_PINS = {
  redApplicant: "",
  yellowBorrower: "",
};

const redApplicantPage = ({ redApplicant }) => (redApplicant ? `/borrower/${redApplicant.id}` : null);

export const DEMO_STEPS = [
  {
    id: "loan-book",
    route: "/",
    press: "tab-all",
    target: "loanbook-table",
    caption: "The loan book lists every applicant and borrower, worst first. Status counts only public signs from the last 90 days.",
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
    caption: "This applicant is Red. The line beside the status names the signals that put it there.",
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
    id: "borrowers",
    route: "/",
    press: "tab-borrowers",
    target: ({ yellowBorrower }) => (yellowBorrower ? `row-${yellowBorrower.id}` : "loanbook-table"),
    caption: "After the loan, the same checks keep running. This borrower has turned Yellow since funding.",
  },
];
