import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { handleAudit } from './service.ts';

export default async function(req: Request): Promise<Response> {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Request body must be JSON.' }, { status: 400 }); }
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const items = (value: any) => Array.isArray(value) ? value : value?.items || [];
  const result = await handleAudit(body, {
    user: () => base44.auth.me().catch(() => null),
    borrower: (id: string) => db.Borrower.get(id),
    history: async (id: string) => items(await db.AuditRun.filter({ borrower_id: id }, '-created_at', 100)),
    signals: async (id: string) => items(await db.Signal.filter({ borrower_id: id }, '-date', 201)).map((s: any) => ({ id: s.id, type: s.type, severity: s.severity, date: s.date, title: s.title, snippet: s.snippet || '', source_url: s.source_url || '', source_name: s.source_name || '' })),
    trace: async (id: string) => items(await db.CheckRun.filter({ borrower_id: id }, '-started_at', 1))[0] || null,
    score: async (signals: any[], today: string) => {
      const response = await base44.asServiceRole.functions.invoke('scoreBorrower', { signals, today });
      const result = response.data;
      if (!['green', 'yellow', 'red'].includes(result?.status) || typeof result.why !== 'string') throw new Error('Scoring unavailable');
      return result;
    },
    // Devin hook (ui/ronit-devin): connected when the DEVIN_SERVICE_KEY secret is set; latest DevinRun for the summary.
    devin: async (id: string) => ({ connected: !!Deno.env.get('DEVIN_SERVICE_KEY'), latest: items(await db.DevinRun.filter({ borrower_id: id }, '-started_at', 1).catch(() => []))[0] || null }),
    now: () => new Date().toISOString(),
    save: (record: any) => db.AuditRun.create(record),
    // Documents the bank accepted in the document exchange (documentExchange), for this company.
    accepted: async (id: string) => items(await db.DocumentExchange.filter({ borrower_id: id, kind: 'document', status: 'accepted' }, '-created_at', 50)).map((d: any) => ({ id: d.id, name: d.name || d.title, title: d.title, text: d.text || '', signal_id: d.signal_id || '', finding: d.finding || 'no_bearing', reviewed_by: d.reviewed_by || '', review_note: d.review_note || '' })),
    extractText: async (file_url: string) => {
      const res: any = await base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: { type: 'object', properties: { text: { type: 'string', description: 'The full text of the document, word for word.' } } },
      });
      return res?.status === 'success' ? res.output?.text || '' : '';
    },
  });
  return Response.json(result.data, { status: result.status });
}
