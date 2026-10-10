import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// refreshAll(). Owner: P1. See docs/PLAN.md §2.
//
// Refreshes every company (or only one stage, with { stage: 'applicant' | 'borrower' })
// by calling refreshBorrower one company at a time, to keep Bright Data usage
// predictable. Not wired to a button, and only an app admin may run it (the app
// is open without login, and every run spends Bright Data credits). Run it
// before the demo while signed in as an admin, from the browser console:
//   base44.functions.invoke('refreshAll', {})
// With slow job/review snapshots this can take a while; if it times out,
// refresh companies one by one instead.
export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const stage = body?.stage;

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in as an app admin to refresh every company.' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Only an app admin can refresh every company.' }, { status: 403 });

    const query = stage ? { stage } : {};
    const borrowers = await base44.asServiceRole.entities.Borrower.filter(query, '-created_date', 500);

    const results: Array<{ id: string; name: string; ok: boolean; status?: string; error?: string }> = [];
    for (const b of borrowers) {
      try {
        // Invoked as the signed-in admin (not the service role): refreshBorrower
        // lets admins refresh companies owned by any user.
        const res = await base44.functions.invoke('refreshBorrower', { borrower_id: b.id });
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
