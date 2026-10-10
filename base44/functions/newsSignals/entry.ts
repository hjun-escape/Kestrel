import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runNewsSignals } from './logic.ts';
import type { LLMParams, Signal } from './logic.ts';
import { crawlLinkedIn, linkedInSignals } from './linkedin.ts';
import { createTracker, newCheckRun } from './trace.ts';

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
    const linkedinOn = LINKEDIN_ENABLED && !!apiKey;

    // CheckRun: the step-by-step record the company page shows under Sources. Best effort only.
    const borrowerId = typeof (borrower as { id?: unknown }).id === 'string' ? (borrower as { id: string }).id : '';
    const db = base44.asServiceRole.entities;
    const tracker = borrowerId
      ? createTracker(newCheckRun(borrowerId, new Date(), linkedinOn), {
        create: (r) => db.CheckRun.create(r),
        update: (id, r) => db.CheckRun.update(id, r),
        now: () => Date.now(),
        warn: (m) => console.warn(m),
      })
      : null;
    const log = (msg: string) => {
      console.log(`newsSignals ${borrower.name}: ${msg}`);
      tracker?.log(msg);
    };

    const linkedin: Promise<Signal[]> = linkedinOn
      ? Promise.race([
        crawlLinkedIn(borrower as { name: string }, { fetch, apiKey: apiKey!, invokeLLM }, log).then((run) => {
          const res = linkedInSignals(borrower as { name: string }, run, today ? new Date(`${today}T12:00:00Z`) : new Date());
          tracker?.linkedin(res.checks);
          return res.signals;
        }),
        new Promise<Signal[]>((_, reject) => setTimeout(() => reject(new Error('timed out')), LINKEDIN_BUDGET_MS)),
      ]).catch((e) => {
        log(`LinkedIn skipped: ${(e as Error).message}`);
        tracker?.linkedin(null);
        return [];
      })
      : Promise.resolve([]);

    try {
      const signals = await runNewsSignals({
        borrower: borrower as { name: string },
        invokeLLM,
        fetch: (url, init) => fetch(url, init),
        apiKey,
        today,
        now: () => Date.now(),
        log,
        onEvent: (e) => tracker?.event(e),
      });
      const all = [...signals, ...(await linkedin)].sort((a, z) => z.date.localeCompare(a.date));
      await tracker?.finish({ ok: true, signalCount: all.length });
      return Response.json(all);
    } catch (error) {
      await linkedin;
      await tracker?.finish({ ok: false, error: (error as Error).message });
      throw error;
    }
  } catch (error) {
    console.error('newsSignals error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
