import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { handleExchange } from './logic.ts';

// Two-way document exchange (see logic.ts). The company side needs no login: its upload link's token is the key.
export default async function(req: Request): Promise<Response> {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Request body must be JSON.' }, { status: 400 }); }
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const items = (value: any) => Array.isArray(value) ? value : value?.items || [];
  const result = await handleExchange(body, {
    user: () => base44.auth.me().catch(() => null),
    borrower: (id: string) => db.Borrower.get(id),
    signals: async (id: string) => items(await db.Signal.filter({ borrower_id: id }, '-date', 200)),
    find: async (query: any) => items(await db.DocumentExchange.filter(query, '-created_at', 200)),
    create: (record: any) => db.DocumentExchange.create(record),
    update: (id: string, patch: any) => db.DocumentExchange.update(id, patch),
    token: () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, ''),
    now: () => new Date().toISOString(),
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
