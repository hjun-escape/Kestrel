// Single mapping table for signal types.
// To add a new signal type later, add one entry here — it flows through the
// loan book table, the detail timeline, and the "sources checked" chips.
export const SIGNAL_TYPES = {
  hiring_drop: {
    label: "Hiring drop",
    source: "Jobs",
    whatToAsk: "Ask about current headcount plans and request a recent payroll summary.",
  },
  review_distress: {
    label: "Employee review distress",
    source: "Reviews",
    whatToAsk: "Ask whether there have been layoffs, furloughs, or payroll delays in the last 90 days.",
  },
  exec_departure: {
    label: "Executive departure",
    source: "News",
    whatToAsk: "Ask who is running finance now and request the latest interim financials.",
  },
  legal_layoffs: {
    label: "Lawsuit / layoffs / liens",
    source: "Legal",
    whatToAsk: "Request a list of pending litigation and all current lenders, with payoff letters.",
  },
};

// Fixed source names, in display order.
export const SOURCES = ["News", "Legal", "Jobs", "Reviews"];