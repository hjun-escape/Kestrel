import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runNewsSignals } from './logic.ts';
import type { LLMParams, Signal } from './logic.ts';
import { crawlLinkedIn, linkedInSignals } from './linkedin.ts';

// newsSignals (P2): Google News via Bright Data -> exec_departure (News) and legal_layoffs (Legal) signals.
//
// Input:  { borrower: Borrower, today?: "YYYY-MM-DD" }  (refreshBorrower sends { borrower })
// Output: Signal[]. Never writes status.
// On failure: non-2xx with { error } (message starts with "News").
//
// Two searches in parallel (last 180 days), the top 5 results of each read and tagged one at a time
// by the LLM. A tag is kept only if its snippet is found verbatim in that article's text. 90 s budget.
// LinkedIn lane (linkedin.ts) runs alongside: it finds the executives, checks their LinkedIn profiles for a
// dated exit in the last 180 days, and adds exec_departure signals. If it fails or runs long, news still returns.
// Needs the Base44 secret BRIGHTDATA_API_KEY (read with Deno.env.get, never in code).

const LINKEDIN_ENABLED = true;
const LINKEDIN_BUDGET_MS = 75_000; // refreshBorrower gives each source 120 s

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
    // Built-in Base44 LLM. With response_json_schema it resolves to a parsed object.
    const invokeLLM = (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params);
    const apiKey = Deno.env.get('BRIGHTDATA_API_KEY');
    const today = typeof body?.today === 'string' ? body.today : undefined;
    const log = (msg: string) => console.log(`newsSignals ${borrower.name}: ${msg}`);

    const linkedin: Promise<Signal[]> = LINKEDIN_ENABLED && apiKey
      ? Promise.race([
        crawlLinkedIn(borrower as { name: string }, { fetch, apiKey, invokeLLM }, log).then((run) =>
          linkedInSignals(borrower as { name: string }, run, today ? new Date(`${today}T12:00:00Z`) : new Date()).signals
        ),
        new Promise<Signal[]>((_, reject) => setTimeout(() => reject(new Error('timed out')), LINKEDIN_BUDGET_MS)),
      ]).catch((e) => {
        log(`LinkedIn skipped: ${(e as Error).message}`);
        return [];
      })
      : Promise.resolve([]);

    const signals = await runNewsSignals({
      borrower: borrower as { name: string },
      invokeLLM,
      fetch: (url, init) => fetch(url, init),
      apiKey,
      today,
      now: () => Date.now(),
      log,
    });
    const all = [...signals, ...(await linkedin)].sort((a, z) => z.date.localeCompare(a.date));
    return Response.json(all);
  } catch (error) {
    console.error('newsSignals error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
