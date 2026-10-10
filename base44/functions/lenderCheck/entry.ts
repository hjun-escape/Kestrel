import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runLenderCheck } from './logic.ts';
import type { LLMParams } from './logic.ts';

// lenderCheck({ borrower_id }) -> { lender_check }
//
// "Other lenders" check, from lender user testing: loans at many other banks
// and small late payments to them were the red flags. Runs three Bright Data
// searches (UCC liens, lender lawsuits, loan news), reads up to 4 result pages,
// has the LLM tag each lender mention, then keeps only same-company tags whose
// quote appears verbatim in the fetched text. Saves one LenderCheck record.
//
// It never sets Borrower.status and never writes Signal records.
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
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Sign in to run the lender check' }, { status: 401 });
    }
    const db = base44.asServiceRole.entities;

    let borrower;
    try {
      borrower = await db.Borrower.get(borrowerId);
    } catch {
      return Response.json({ error: 'Company not found' }, { status: 404 });
    }

    const result = await runLenderCheck({
      borrower: { ...borrower, id: borrowerId },
      // Built-in Base44 LLM. With response_json_schema it resolves to a parsed object.
      invokeLLM: (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
      fetch: (url, init) => fetch(url, init),
      apiKey: Deno.env.get('BRIGHTDATA_API_KEY'),
      now: () => Date.now(),
    });

    if (!result.ok) {
      console.error(`lenderCheck ${borrowerId} failed: ${result.code}: ${result.error}`);
      const status = result.code === 'internal_error' ? 500 : 502;
      return Response.json({ error: result.error, code: result.code, searched: result.searched }, { status });
    }

    const saved = await db.LenderCheck.create(result.record);
    return Response.json({ lender_check: saved });
  } catch (error) {
    console.error('lenderCheck error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
