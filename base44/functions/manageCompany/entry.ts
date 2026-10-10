import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { canAccessCompany } from './access.ts';
import { deleteCompany, updateCompany, type Db } from './logic.ts';

// manageCompany({ borrower_id, action: "update", fields }) -> { borrower, evidence_cleared }
// manageCompany({ borrower_id, action: "delete" })          -> { deleted }
//
// Edit and Delete on the company page. Borrower has no row-level rules, so the ownership check runs here, the
// same as refreshBorrower: a signed-in caller may change only their own companies, a signed-out caller only the
// shared demo book, and app admins any. Rules for what an edit may change and what a delete removes: logic.ts.
export default async function (req: Request): Promise<Response> {
  try {
    let body: { borrower_id?: unknown; action?: unknown; fields?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
    }
    const borrowerId = body?.borrower_id;
    if (typeof borrowerId !== 'string' || !borrowerId) return Response.json({ error: 'borrower_id is required' }, { status: 400 });
    if (body?.action !== 'update' && body?.action !== 'delete') {
      return Response.json({ error: 'action must be "update" or "delete"' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities as unknown as Db & { Borrower: { get(id: string): Promise<Record<string, unknown>> } };
    const borrower = await db.Borrower.get(borrowerId).catch(() => null);
    if (!borrower) return Response.json({ error: 'Company not found.' }, { status: 404 });

    const caller = await base44.auth.me().catch(() => null);
    if (!canAccessCompany(borrower, caller) && caller?.role !== 'admin') {
      return Response.json({ error: 'You do not have access to this company.' }, { status: 403 });
    }

    const result =
      body.action === 'delete'
        ? await deleteCompany(db, borrowerId)
        : await updateCompany(db, { ...borrower, id: borrowerId }, body.fields);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
