// Per-user companies (see CLAUDE.md "Data contract", Borrower.owner_email).
// Pure: no npm:, no Deno. Base44 bundles each function folder on its own, so
// this file is copied into every folder that checks access; tests/access.test.ts
// checks the copies stay identical.
//
// A signed-in caller may only use their own companies (owner_email equals
// their email). A signed-out caller may only use the unowned shared demo book
// (no owner_email), which Sense testers browse without an account. So one
// user's companies never reach another user, and signed-in users do not see
// the shared demo book.

export interface CompanyOwner {
  owner_email?: unknown;
}

export interface Caller {
  email?: unknown;
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** The owner_email to store for a company the caller creates, or undefined (shared) when signed out. */
export function ownerEmailFor(caller: Caller | null | undefined): string | undefined {
  return normalizeEmail(caller?.email) || undefined;
}

/** Signed in: true iff the caller owns the company. Signed out: true iff the company has no owner. */
export function canAccessCompany(company: CompanyOwner | null | undefined, caller: Caller | null | undefined): boolean {
  if (!company) return false;
  const owner = company.owner_email;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return false;
  const ownerEmail = normalizeEmail(owner);
  const callerEmail = normalizeEmail(caller?.email);
  return callerEmail ? ownerEmail === callerEmail : !ownerEmail;
}
