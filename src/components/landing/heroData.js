// Illustrative applicant for the hero. Fictional company and quotes; the
// statuses follow the app's real scoring rules (2 strong flags = Red).

export const SAMPLE_COMPANY = {
  name: "Northfield Battery Works",
  detail: "Applicant, $4.5M term loan requested",
  place: "Reno, NV",
};

// Axis runs Jun 1 to Nov 30, mapped onto an SVG 520 units wide.
const AXIS_START = Date.UTC(2026, 5, 1);
const AXIS_END = Date.UTC(2026, 10, 30);
export const AXIS = { width: 520, left: 16, right: 504, baseline: 40 };

/** X position on the axis for a YYYY-MM-DD date. */
export function axisX(isoDate) {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  const ratio = (t - AXIS_START) / (AXIS_END - AXIS_START);
  return AXIS.left + ratio * (AXIS.right - AXIS.left);
}

export const AXIS_MONTHS = [
  { label: "Jun", date: "2026-06-01" },
  { label: "Jul", date: "2026-07-01" },
  { label: "Aug", date: "2026-08-01" },
  { label: "Sep", date: "2026-09-01" },
  { label: "Oct", date: "2026-10-01" },
  { label: "Nov", date: "2026-11-01" },
];

export const TODAY = { label: "Today", date: "2026-10-10" };
export const FILING = { label: "Q3 financials", when: "due Nov 14", date: "2026-11-14" };

export const FLAGS = [
  {
    id: "cfo",
    title: "CFO departure",
    when: "Sep 10",
    source: "Regional business news",
    quote: "Chief financial officer Dana Whitlock has stepped down, effective immediately.",
    mark: { kind: "dot", date: "2026-09-10" },
  },
  {
    id: "warn",
    title: "WARN notice, 125 jobs",
    when: "Sep 24",
    source: "State WARN notice",
    quote: "Number of employees affected: 125. Reno, NV facility. Separations begin 11/21/2026.",
    mark: { kind: "dot", date: "2026-09-24" },
  },
  {
    id: "late",
    title: "3 late payments to 2 lenders",
    when: "Jul to Sep",
    source: "Applicant cash-flow statement",
    quote: "Returned ACH, loan payment, Sagebrush Capital, Aug 3.",
    mark: { kind: "range", from: "2026-07-08", to: "2026-08-31" },
  },
];

// Status after each flag lands: index 0 is before any flag.
export const BADGES = ["green", "yellow", "red"];
export const STATUS_AFTER_FLAG = ["green", "yellow", "red", "red"];

export const WHY_LINES = [
  "Green: no warning signs found yet.",
  "Yellow: CFO departure (Sep 10).",
  "Red: CFO departure (Sep 10) + WARN notice (Sep 24).",
  "Red: CFO departure + WARN notice + 3 late loan payments.",
];
