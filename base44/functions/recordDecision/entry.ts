import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { canAccessCompany } from './access.ts';
import { recordDecision, type Db } from './logic.ts';

// recordDecision({ borrower_id, decision, note?, follow_up_date?, documents_requested? }) -> { decision }
//
// "Record a decision" on the company page. A decision is a signed-in officer's signed note, so the
// caller must be logged in and must own the company (app admins may too). The demo book takes none.
export default async function (req: Request): Promise<Response> {
  try {
    let body: { borrower_id?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
    }
    const borrowerId = body?.borrower_id;
    if (typeof borrowerId !== 'string' || !borrowerId) return Response.json({ error: 'borrower_id is required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user?.email) return Response.json({ error: 'Sign in to record a decision.' }, { status: 401 });

    const db = base44.asServiceRole.entities as unknown as Db & { Borrower: { get(id: string): Promise<Record<string, unknown>> } };
    const borrower = await db.Borrower.get(borrowerId).catch(() => null);
    if (!borrower) return Response.json({ error: 'Company not found.' }, { status: 404 });
    if (!canAccessCompany(borrower, user) && user.role !== 'admin') {
      return Response.json({ error: 'You do not have access to this company.' }, { status: 403 });
    }

    const result = await recordDecision(db, { id: borrowerId }, user, body, new Date().toISOString());
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
