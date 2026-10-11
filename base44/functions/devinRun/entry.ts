import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { handleDevinRun } from './service.ts';
import { createDevinClient } from './client.ts';

// devinRun({ action: 'start' | 'poll' | 'list', ... }). Devin-backed independent audit
// and investigations. Logic in logic.ts / service.ts; the key is the Base44 secret
// DEVIN_SERVICE_KEY (Bearer, Devin API v1).
export default async function(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  // deno-lint-ignore no-explicit-any
  const items = (value: any) => Array.isArray(value) ? value : value?.items || [];
  const key = Deno.env.get('DEVIN_SERVICE_KEY')?.trim();
  const result = await handleDevinRun(body, {
    user: () => base44.auth.me().catch(() => null),
    borrower: (id) => db.Borrower.get(id).catch(() => null),
    signals: async (id) => items(await db.Signal.filter({ borrower_id: id }, '-date', 200)),
    latestAudit: async (id) => items(await db.AuditRun.filter({ borrower_id: id }, '-created_at', 1))[0] || null,
    runsFor: async (id) => items(await db.DevinRun.filter({ borrower_id: id }, '-started_at', 50)),
    // Newest 100 app-wide; rateLimitError keeps only the last hour (limit is 20, so 100 is ample).
    recentRuns: async (since) => items(await db.DevinRun.list('-started_at', 100)).filter((r: { started_at?: string }) => (r.started_at || '') >= since),
    getRun: (id) => db.DevinRun.get(id).catch(() => null),
    createRun: (data) => db.DevinRun.create(data),
    updateRun: async (id, patch) => { await db.DevinRun.update(id, patch); return db.DevinRun.get(id); },
    devin: key ? createDevinClient(key) : null,
    now: () => new Date().toISOString(),
  });
  return Response.json(result.data, { status: result.status });
}
