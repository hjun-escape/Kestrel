import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { canAccessCompany } from './access.ts';
import { findCompanyPages, hostOf, type FetchLike, type FindResult } from './logic.ts';
import { checkInternalToken, INTERNAL_TOKEN_ENV } from './internalToken.ts';

// findCompanyPages(borrower_id). Fills in a company's LinkedIn company page and Glassdoor reviews
// page when they are missing, so the Jobs and Reviews checks can run (see logic.ts for how pages are
// searched and verified). refreshBorrower calls it with the caller's own identity before it runs
// hiringSignal and reviewSignals.
//
// - Same access rule as refreshBorrower: signed-out callers only the shared demo book, signed-in
//   callers only their own companies (access.ts), admins any.
// - Sample companies (.example domain) are refused: they are never checked live.
// - Writes back only pages it verified ('found'), never replaces a URL someone entered, and records
//   the outcome in Borrower.profile_search. A domain whose missing pages were already settled
//   ('found' or 'not_found') is not searched again, so repeated calls cost nothing.
//
// Output: { linkedin_url, glassdoor_url, linkedin, glassdoor, notes, cached, borrower }.

declare const Deno: { env: { get(k: string): string | undefined } };

type Settled = 'found' | 'not_found';
const isSettled = (s: unknown): s is Settled => s === 'found' || s === 'not_found';

export default async function (req: Request): Promise<Response> {
  let body: { borrower_id?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'findCompanyPages: request body must be JSON' }, { status: 400 });
  }
  const gate = checkInternalToken(body, Deno.env.get(INTERNAL_TOKEN_ENV));
  if (!gate.ok) return Response.json({ error: gate.error }, { status: gate.status });
  const borrowerId = body?.borrower_id;
  if (typeof borrowerId !== 'string' || !borrowerId) {
    return Response.json({ error: 'findCompanyPages: borrower_id is required' }, { status: 400 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const borrower = await db.Borrower.get(borrowerId).catch(() => null);
    if (!borrower) return Response.json({ error: 'findCompanyPages: company not found' }, { status: 404 });

    const caller = await base44.auth.me().catch(() => null);
    if (!canAccessCompany(borrower, caller) && caller?.role !== 'admin') {
      return Response.json({ error: 'You do not have access to this company.' }, { status: 403 });
    }

    const domain = hostOf(borrower.website_domain);
    if (domain && /\.example$/i.test(domain)) {
      return Response.json({ error: 'Sample company with made-up data, so it is not checked live.' }, { status: 409 });
    }

    // Already settled for this domain: nothing to search.
    const prior = borrower.profile_search || {};
    const linkedinDone = !!borrower.linkedin_url || (prior.domain === domain && isSettled(prior.linkedin));
    const glassdoorDone = !!borrower.glassdoor_url || (prior.domain === domain && isSettled(prior.glassdoor));
    if (linkedinDone && glassdoorDone) {
      return Response.json({
        linkedin_url: borrower.linkedin_url || null,
        glassdoor_url: borrower.glassdoor_url || null,
        linkedin: borrower.linkedin_url ? (prior.linkedin === 'found' ? 'found' : 'user') : prior.linkedin,
        glassdoor: borrower.glassdoor_url ? (prior.glassdoor === 'found' ? 'found' : 'user') : prior.glassdoor,
        notes: ['Already looked up for this domain.'],
        cached: true,
        borrower,
      });
    }

    const apiKey = Deno.env.get('BRIGHTDATA_API_KEY');
    let result: FindResult;
    if (!apiKey) {
      result = {
        linkedin_url: borrower.linkedin_url || null,
        glassdoor_url: borrower.glassdoor_url || null,
        linkedin: borrower.linkedin_url ? 'user' : 'error',
        glassdoor: borrower.glassdoor_url ? 'user' : 'error',
        notes: ['BRIGHTDATA_API_KEY secret not set.'],
      };
    } else {
      result = await findCompanyPages(borrower, { fetch: fetch as unknown as FetchLike, apiKey });
    }

    // A page someone entered keeps its 'user' status from an earlier lookup only if it was found here.
    const keep = (field: 'linkedin' | 'glassdoor') =>
      result[field] === 'user' && prior.domain === domain && prior[field] === 'found' ? 'found' : result[field];
    const update: Record<string, unknown> = {
      profile_search: { linkedin: keep('linkedin'), glassdoor: keep('glassdoor'), domain, checked_at: new Date().toISOString() },
    };
    if (result.linkedin === 'found' && !borrower.linkedin_url && result.linkedin_url) update.linkedin_url = result.linkedin_url;
    if (result.glassdoor === 'found' && !borrower.glassdoor_url && result.glassdoor_url) update.glassdoor_url = result.glassdoor_url;
    const updated = await db.Borrower.update(borrowerId, update);

    return Response.json({ ...result, cached: false, borrower: updated });
  } catch (error) {
    return Response.json({ error: `findCompanyPages failed: ${(error as Error).message}` }, { status: 500 });
  }
}
