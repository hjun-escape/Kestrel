import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// refreshBorrower(borrower_id)
// v1 STUB: sets last_refreshed to now, keeps everything else unchanged, returns the borrower.
// P2/P3 will plug the real signal-fetching and status-scoring logic into the TODO blocks below.
export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const borrowerId = body?.borrower_id;
    if (!borrowerId) {
      return Response.json({ error: 'borrower_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ===================================================================
    // TODO (P2): Call the 4 signal functions; each returns a list of
    // Signals or throws.
    //
    //   const [news, legal, jobs, reviews] = await Promise.allSettled([
    //     fetchNewsSignals(borrower),    // source: "News"
    //     fetchLegalSignals(borrower),   // source: "Legal"
    //     fetchJobsSignals(borrower),    // source: "Jobs"
    //     fetchReviewsSignals(borrower)  // source: "Reviews"
    //   ]);
    //
    // TODO (P2): If a function throws, add its source name to
    // sources_unavailable and continue.
    //
    //   const sourcesUnavailable = [];
    //   if (news.status === 'rejected')    sourcesUnavailable.push('News');
    //   if (legal.status === 'rejected')  sourcesUnavailable.push('Legal');
    //   if (jobs.status === 'rejected')   sourcesUnavailable.push('Jobs');
    //   if (reviews.status === 'rejected') sourcesUnavailable.push('Reviews');
    //
    // TODO (P2): Replace this borrower's Signals with the new ones
    // (delete existing signals for borrower_id, then create the new ones).
    //
    // TODO (P3): Apply status scoring.
    //   RED    = 2+ strong, or 1 strong + 2 weak.
    //   YELLOW = 1 strong, or 2+ weak.
    //   GREEN  = otherwise.
    //   Set status + why accordingly.
    //
    // NOTE: The Bright Data key will live in a Base44 secret named
    // BRIGHTDATA_API_KEY. Read it at runtime via the base44:runtime secrets
    // module — do NOT hardcode the key in source.
    //
    // TODO: Save — update the borrower with last_refreshed, status, why,
    // sources_unavailable, and the new signals.
    // ===================================================================

    const now = new Date().toISOString();
    const updated = await base44.asServiceRole.entities.Borrower.update(borrowerId, {
      last_refreshed: now
    });

    return Response.json({ borrower: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}