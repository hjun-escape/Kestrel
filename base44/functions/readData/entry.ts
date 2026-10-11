import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readData, type Db } from './logic.ts';

// readData({ entity, id } | { entity, query?, sort?, limit? }) -> { item } | { items }
//
// Every screen read goes through here: the Borrower/Signal/child entities are closed to clients
// (rls all false), and this applies the per-user rule from access.ts — a signed-in caller sees only
// their own companies and their child records, a signed-out caller only the shared demo book.
export default async function (req: Request): Promise<Response> {
  try {
    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
    }
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    const db = base44.asServiceRole.entities as unknown as Db;
    const result = await readData(db, caller, body);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
