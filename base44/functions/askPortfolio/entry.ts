import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runAgent } from './logic.ts';
import type { DataLayer } from './logic.ts';
import { scopeDataLayer } from './scopedData.ts';

// askPortfolio({ messages, context_company_id? }). "Ask Early Warning" scoped chat agent.
// Read-only: it never writes entities. Screen / refresh / deep-check requests
// come back as pending_actions that the user confirms via confirmAction.
// Response: { answer, citations, pending_actions, tool_errors } or { error }.
const MAX_ROWS = 500;
const MAX_SIGNALS = 200;

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Send { messages: [{ role, content }] }.' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to use Ask Early Warning.' }, { status: 401 });

    const db = base44.asServiceRole.entities;
    // Every tool only sees the caller's own companies (access.ts); a
    // context_company_id the caller cannot access resolves to null.
    const data: DataLayer = scopeDataLayer({
      listBorrowers: () => db.Borrower.filter({}, '-created_date', MAX_ROWS),
      getBorrower: (id: string) => db.Borrower.get(id).catch(() => null),
      listSignals: (borrowerId: string) => db.Signal.filter({ borrower_id: borrowerId }, '-date', MAX_SIGNALS),
    }, user);
    // Core.InvokeLLM goes through the SDK's response interceptor, so it
    // resolves to the parsed JSON object itself when response_json_schema is set.
    const llm = (prompt: string, responseSchema: object) =>
      base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, response_json_schema: responseSchema });

    const { messages, context_company_id } = body as { messages?: unknown; context_company_id?: unknown };
    const result = await runAgent({ messages, contextCompanyId: context_company_id, llm, data });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error('askPortfolio failed:', (error as Error).message);
    return Response.json({ error: 'Ask Early Warning hit an unexpected error.' }, { status: 500 });
  }
}
