import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// refreshAll(). Owner: P1. See docs/PLAN.md §2.
//
// Refreshes every company (or only one stage, with { stage: 'applicant' | 'borrower' })
// by calling refreshBorrower one company at a time, to keep Bright Data usage
// predictable. Not wired to a button: run it before the demo, for example with
// the Base44 MCP or from the browser console with
//   base44.functions.invoke('refreshAll', {})
// With slow job/review snapshots this can take a while; if it times out,
// refresh companies one by one instead.
export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const stage = body?.stage;

    const base44 = createClientFromRequest(req);
    const query = stage ? { stage } : {};
    const borrowers = await base44.asServiceRole.entities.Borrower.filter(query, '-created_date', 500);

    const results = [];
    for (const b of borrowers) {
      try {
        const res = await base44.asServiceRole.functions.invoke('refreshBorrower', { borrower_id: b.id });
        results.push({ id: b.id, name: b.name, ok: true, status: res?.data?.borrower?.status });
      } catch (error) {
        const err = error as { response?: { data?: { error?: string } }; message?: string };
        results.push({ id: b.id, name: b.name, ok: false, error: err.response?.data?.error || err.message });
      }
    }

    return Response.json({ refreshed: results.filter((r) => r.ok).length, total: results.length, results });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
