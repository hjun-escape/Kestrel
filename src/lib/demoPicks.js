// Presenter mode: pick the companies the demo script talks about and resolve
// each step against them. Pure functions (no React, no network) so they can be
// tested with node --test.

/** A real company, not one of the seeded placeholders on a .example domain. */
export function isRealCompany(borrower) {
  const domain = String(borrower?.website_domain || "").trim().toLowerCase();
  return domain !== "" && !domain.endsWith(".example");
}

/**
 * The company a step should show. A pinned name wins. Otherwise the first
 * match on stage and status, preferring checked companies (status means
 * nothing before the first check) and real companies over placeholders.
 */
export function pickCompany(borrowers, { stage, status, pinnedName } = {}) {
  const list = (borrowers || []).filter(Boolean);
  const pin = String(pinnedName || "").trim().toLowerCase();
  if (pin) {
    const pinned = list.find((b) => String(b.name || "").trim().toLowerCase() === pin);
    if (pinned) return pinned;
  }
  const matches = list.filter((b) => b.stage === stage && b.status === status);
  const checked = matches.filter((b) => !!b.last_refreshed);
  return (
    checked.find(isRealCompany) ||
    checked[0] ||
    matches.find(isRealCompany) ||
    matches[0] ||
    null
  );
}

export function resolvePicks(borrowers, pins = {}) {
  return {
    redApplicant: pickCompany(borrowers, { stage: "applicant", status: "red", pinnedName: pins.redApplicant }),
    yellowBorrower: pickCompany(borrowers, { stage: "borrower", status: "yellow", pinnedName: pins.yellowBorrower }),
  };
}

function valueOf(field, picks) {
  if (typeof field !== "function") return field ?? null;
  try {
    return field(picks) ?? null;
  } catch {
    return null;
  }
}

/**
 * A step with its route, press and target worked out for these picks.
 * `missingCompany` is true when the step needs a company the loan book does
 * not have (its route function returned nothing).
 */
export function resolveStep(step, picks) {
  const route = valueOf(step?.route, picks);
  return {
    id: step?.id ?? "",
    caption: step?.caption ?? "",
    route,
    press: valueOf(step?.press, picks),
    target: valueOf(step?.target, picks),
    missingCompany: typeof step?.route === "function" && !route,
  };
}
