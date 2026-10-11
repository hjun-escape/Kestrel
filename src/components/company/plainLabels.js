// Banker-facing wording for the company page (see the readability audit glossary).
// Display only: status itself is always set by scoreBorrower's fixed rules.
import { dedupeSignals } from "../../../base44/functions/scoreBorrower/entry.ts";
import { filterRecentSignals } from "@/lib/borrowerUtils";

// Plain names for signal types. Falls back to the stored label when a type is new.
export const TYPE_LABELS = {
  hiring_drop: "Hiring freeze",
  review_distress: "Employee reviews report trouble",
  exec_departure: "Executive departure",
  legal_layoffs: "Layoffs & legal",
};

// Each source by what was searched, not by how it is built.
export const SOURCE_LABELS = {
  News: { title: "Executive changes", description: "News about leadership exits" },
  Legal: { title: "News & court records", description: "Layoffs & legal" },
  Jobs: { title: "Job postings", description: "Hiring activity" },
  Reviews: { title: "Employee reviews", description: "What staff say about the company" },
};

// The verdict in plain words. Color is never the only cue: each has a text headline and a glyph.
export const VERDICT = {
  red: { headline: "High risk: act now", label: "Red" },
  yellow: { headline: "Watch: ask questions", label: "Yellow" },
  green: { headline: "No warning signs", label: "Green" },
  not_checked: { headline: "Not checked yet", label: "Not checked" },
};

export function verdictKey(borrower) {
  if (!borrower?.last_refreshed) return "not_checked";
  return VERDICT[borrower.status] ? borrower.status : "not_checked";
}

const STATUS_WORD = { red: "Red", yellow: "Yellow", green: "Green" };

// "1 strong and 1 weak warning sign in the last 90 days → Yellow"
export function ruleSentence({ strong, weak, status }) {
  const word = STATUS_WORD[status] || status;
  if (strong === 0 && weak === 0) return `No warning signs in the last 90 days → ${word}`;
  const parts = [];
  if (strong > 0) parts.push(`${strong} strong`);
  if (weak > 0) parts.push(`${weak} weak`);
  const total = strong + weak;
  return `${parts.join(" and ")} warning sign${total === 1 ? "" : "s"} in the last 90 days → ${word}`;
}

// The strongest recent evidence first, then the newest. Duplicates once.
export function topEvidence(signals, limit = 3) {
  const recent = dedupeSignals(filterRecentSignals(signals || []));
  return [...recent]
    .sort((a, b) => {
      const sev = (b.severity === "strong") - (a.severity === "strong");
      return sev !== 0 ? sev : String(b.date || "").localeCompare(String(a.date || ""));
    })
    .slice(0, limit);
}

export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

export function sourceLabelOf(signal) {
  const url = safeUrl(signal?.source_url);
  return signal?.source_name || url?.hostname.replace(/^www\./, "") || "Source";
}
