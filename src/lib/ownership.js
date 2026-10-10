// Per-user companies, client side. Mirrors base44/functions/*/access.ts, which
// enforces the same rule on the server:
// - signed in: only the user's own companies (Borrower.owner_email === email);
// - signed out: only the unowned shared demo book (no owner_email), which Sense
//   testers browse without an account.

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** owner_email to store on a company the user creates; undefined (shared) when signed out. */
export function ownerEmailFor(email) {
  return normalizeEmail(email) || undefined;
}

export function canSeeCompany(company, email) {
  if (!company) return false;
  const owner = normalizeEmail(company.owner_email);
  const me = normalizeEmail(email);
  return me ? owner === me : !owner;
}

export function visibleCompanies(list, email) {
  return (list || []).filter((c) => canSeeCompany(c, email));
}

/** Only the signed-in creator of a saved chat may delete it. */
export function canDeleteConversation(conversation, email) {
  const me = normalizeEmail(email);
  return !!me && normalizeEmail(conversation?.created_by) === me;
}
