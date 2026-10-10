import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runNewsSignals } from './logic.ts';
import type { LLMParams } from './logic.ts';

// newsSignals (P2): Google News via Bright Data -> exec_departure (News) and legal_layoffs (Legal) signals.
//
// Input:  { borrower: Borrower, today?: "YYYY-MM-DD" }  (refreshBorrower sends { borrower })
// Output: Signal[]. Never writes status.
// On failure: non-2xx with { error } (message starts with "News").
//
// Two searches in parallel (last 180 days), the top 5 results of each read and tagged one at a time
// by the LLM. A tag is kept only if its snippet is found verbatim in that article's text. 90 s budget.
// Needs the Base44 secret BRIGHTDATA_API_KEY (read with Deno.env.get, never in code).

export default async function(req: Request): Promise<Response> {
  try {
    let body: { borrower?: { name?: unknown }; today?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'News: request body must be JSON' }, { status: 400 });
    }
    const borrower = body?.borrower;
    if (!borrower || typeof borrower.name !== 'string' || !borrower.name.trim()) {
      return Response.json({ error: 'News: borrower is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const signals = await runNewsSignals({
      borrower: borrower as { name: string },
      // Built-in Base44 LLM. With response_json_schema it resolves to a parsed object.
      invokeLLM: (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
      fetch: (url, init) => fetch(url, init),
      apiKey: Deno.env.get('BRIGHTDATA_API_KEY'),
      today: typeof body?.today === 'string' ? body.today : undefined,
      now: () => Date.now(),
    });
    return Response.json(signals);
  } catch (error) {
    console.error('newsSignals error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
