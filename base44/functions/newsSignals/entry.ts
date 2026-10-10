import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { crawlNews, type LLMParams, type Signal, signalsFromBatches } from './logic.ts';
import { crawlLinkedIn, linkedInSignals } from './linkedin.ts';

// newsSignals (P2): { borrower, today? } -> Signal[] (exec_departure + legal_layoffs). Never writes status.
//
// News lane: two Google News searches via Bright Data SERP -> clean -> one LLM call tags every article ->
// keep only same-company articles whose snippet is a verbatim quote. See logic.ts.
// LinkedIn lane: finds executives and checks their LinkedIn profiles for a recent exit. It runs alongside the
// news lane within its own time budget; if it fails or runs long, news signals are still returned. See linkedin.ts.
//
// Failure: a non-2xx response whose error starts with "News" or "Legal" (the sources_unavailable values).
// Needs the Base44 secret BRIGHTDATA_API_KEY. Tagging uses Base44's built-in LLM (Core.InvokeLLM).

const LINKEDIN_ENABLED = true;
const LINKEDIN_BUDGET_MS = 75_000; // refreshBorrower gives each source 120 s

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const borrower = body?.borrower;
    if (!borrower?.name) return Response.json({ error: 'News: borrower is required' }, { status: 400 });
    const apiKey = Deno.env.get('BRIGHTDATA_API_KEY');
    if (!apiKey) throw new Error('News: BRIGHTDATA_API_KEY secret not set');

    const base44 = createClientFromRequest(req);
    const invokeLLM = (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params);
    const today = body.today ? new Date(`${body.today}T12:00:00Z`) : new Date();
    const deps = { fetch: (url: string | URL | Request, init?: RequestInit) => fetch(url, init), apiKey, invokeLLM };
    const log = (msg: string) => console.log(`newsSignals ${borrower.name}: ${msg}`);

    const linkedin: Promise<Signal[]> = LINKEDIN_ENABLED
      ? Promise.race([
        crawlLinkedIn(borrower, deps, log).then((run) => linkedInSignals(borrower, run, today).signals),
        new Promise<Signal[]>((_, reject) => setTimeout(() => reject(new Error('timed out')), LINKEDIN_BUDGET_MS)),
      ]).catch((e) => {
        log(`LinkedIn skipped: ${(e as Error).message}`);
        return [];
      })
      : Promise.resolve([]);

    const batches = await crawlNews(borrower, deps, log);
    const { signals } = await signalsFromBatches(borrower, batches, invokeLLM, today, log);
    const all = [...signals, ...(await linkedin)].sort((a, z) => z.date.localeCompare(a.date));
    return Response.json(all);
  } catch (error) {
    const message = (error as Error).message;
    console.error('newsSignals error:', message);
    return Response.json({ error: /^(News|Legal)\b/.test(message) ? message : `News: ${message}` }, { status: 502 });
  }
}
