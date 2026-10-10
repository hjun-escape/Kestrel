import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { canAccessCompany } from './access.ts';
import { runAnalyst } from './logic.ts';
import type { LLMParams } from './logic.ts';

// analyzeBorrower({ borrower_id }) -> { analysis }
//
// Agentic credit analyst: plans up to 4 tool steps (news_search, read_page via
// Bright Data) inside a 90 s budget, then writes a sourced brief. Every finding's
// quote is checked in code against text fetched in this run or stored Signal
// snippets; anything unverified is dropped. Saves one Analysis record per run.
//
// It never sets Borrower.status. Status stays plain code in scoreBorrower.
// Needs the Base44 secret BRIGHTDATA_API_KEY (read with Deno.env.get, never in code).

export default async function(req: Request): Promise<Response> {
  try {
    let body: { borrower_id?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
    }
    const borrowerId = typeof body?.borrower_id === 'string' ? body.borrower_id.trim() : '';
    if (!borrowerId) {
      return Response.json({ error: 'borrower_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    // Signed-in users only, checked before any database, LLM or Bright Data call.
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to run the analyst.' }, { status: 401 });

    const db = base44.asServiceRole.entities;

    let borrower;
    try {
      borrower = await db.Borrower.get(borrowerId);
    } catch {
      return Response.json({ error: 'Company not found' }, { status: 404 });
    }
    if (!canAccessCompany(borrower, user)) {
      return Response.json({ error: 'You do not have access to this company.' }, { status: 403 });
    }
    const storedSignals = await db.Signal.filter({ borrower_id: borrowerId }, '-date', 200);
    const signals = Array.isArray(storedSignals) ? storedSignals : [];

    const result = await runAnalyst({
      borrower: { ...borrower, id: borrowerId },
      signals,
      // Built-in Base44 LLM. With response_json_schema it resolves to a parsed object.
      invokeLLM: (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
      fetch: (url, init) => fetch(url, init),
      apiKey: Deno.env.get('BRIGHTDATA_API_KEY'),
      now: () => Date.now(),
    });

    if (!result.ok) {
      console.error(`analyzeBorrower ${borrowerId} failed: ${result.code}: ${result.error}`);
      const status = result.code === 'internal_error' ? 500 : 502;
      return Response.json({ error: result.error, code: result.code, steps: result.steps }, { status });
    }

    const saved = await db.Analysis.create(result.analysis);
    return Response.json({ analysis: saved });
  } catch (error) {
    console.error('analyzeBorrower error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
