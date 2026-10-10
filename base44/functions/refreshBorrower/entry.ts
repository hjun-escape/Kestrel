import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// refreshBorrower(borrower_id). Owner: P1. See docs/PLAN.md §2.
//
// Runs the signal functions (owned by P2/P3), replaces this borrower's Signals
// source by source, and saves after each source finishes so the detail screen
// fills in progressively. Then applies status scoring (P3) and saves.
//
// While every entry below is disabled it only sets last_refreshed to now on a
// company that was already checked (the seeded ones) and leaves everything
// else unchanged (the v1 stub behaviour). A company that was never checked gets
// an error instead, so a new applicant never shows a status nobody computed.
// Once any function is enabled, a disabled one counts as unavailable, and a
// refresh where no source answered is reported as a failure.
//
// The Bright Data key is a Base44 secret named BRIGHTDATA_API_KEY. Only the
// signal functions read it, with Deno.env.get('BRIGHTDATA_API_KEY'). Never put
// a key in code.

// Signal functions: each takes { borrower } and returns Signal[] (or { signals }),
// and throws / returns a non-2xx status on failure. It never writes status.
// One function can cover several sources: newsSignals returns both
// exec_departure (News) and legal_layoffs (Legal), so if it fails, both are
// marked unavailable.
//
// TODO (P2, P3): once your function is deployed and tested on one company,
// set enabled: true on its line. That is the only change needed here.
const SIGNAL_FUNCTIONS = [
  { name: 'newsSignals',   owner: 'P2', enabled: false, sources: { exec_departure: 'News', legal_layoffs: 'Legal' } },
  { name: 'hiringSignal',  owner: 'P3', enabled: false, sources: { hiring_drop: 'Jobs' } },
  { name: 'reviewSignals', owner: 'P3', enabled: false, sources: { review_distress: 'Reviews' } },
];

// TODO (P3): set to true once scoreBorrower is deployed. It takes
// { signals, today: 'YYYY-MM-DD' } and returns { status, why }, counting only
// the last 90 days. Until then status and why stay unchanged.
const SCORING_ENABLED = false;

// A source that takes longer than this counts as unavailable.
const SOURCE_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const borrowerId = body?.borrower_id;
    if (!borrowerId) {
      return Response.json({ error: 'borrower_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const borrower = await db.Borrower.get(borrowerId);

    const enabled = SIGNAL_FUNCTIONS.filter((f) => f.enabled);
    if (enabled.length === 0) {
      if (!borrower.last_refreshed) {
        return Response.json({ error: 'No data sources are connected yet.' }, { status: 503 });
      }
      const updated = await db.Borrower.update(borrowerId, { last_refreshed: new Date().toISOString() });
      return Response.json({ borrower: updated });
    }

    const unavailable = new Set<string>(borrower.sources_unavailable || []);
    for (const fn of SIGNAL_FUNCTIONS.filter((f) => !f.enabled)) {
      Object.values(fn.sources).forEach((s) => unavailable.add(s));
    }
    let answered = 0;

    // Saves run one after another so a slower write never overwrites a newer one.
    let saveChain: Promise<unknown> = Promise.resolve();
    const save = (fn: () => Promise<unknown>) => (saveChain = saveChain.then(fn));

    const runs = enabled.map(async (fn) => {
      const types = Object.keys(fn.sources);
      const sourceNames = Object.values(fn.sources);
      try {
        const res = await withTimeout(
          base44.asServiceRole.functions.invoke(fn.name, { borrower }),
          SOURCE_TIMEOUT_MS,
          fn.name,
        );
        const returned = Array.isArray(res?.data) ? res.data : res?.data?.signals;
        if (!Array.isArray(returned)) throw new Error(`${fn.name} returned no signal list`);

        // Keep only the signal types this function owns.
        const signals = returned
          .filter((s) => types.includes(s.type))
          .map((s) => ({ ...s, borrower_id: borrowerId }));

        await save(async () => {
          // Replace this source's signals.
          for (const type of types) {
            await db.Signal.deleteMany({ borrower_id: borrowerId, type });
          }
          if (signals.length > 0) await db.Signal.bulkCreate(signals);
          sourceNames.forEach((s) => unavailable.delete(s));
          answered += 1;
          await db.Borrower.update(borrowerId, { sources_unavailable: [...unavailable] });
        });
      } catch (error) {
        // Skip a failing source: mark it unavailable and keep its previous signals.
        console.error(`${fn.name} failed:`, (error as Error).message);
        await save(async () => {
          sourceNames.forEach((s) => unavailable.add(s));
          await db.Borrower.update(borrowerId, { sources_unavailable: [...unavailable] });
        });
      }
    });

    await Promise.all(runs);
    await saveChain;

    if (answered === 0) {
      // Nothing was checked: keep last_refreshed, status and why as they were.
      return Response.json({ error: 'No data source responded. Try again in a minute.' }, { status: 502 });
    }

    const finalUpdate: Record<string, unknown> = {
      last_refreshed: new Date().toISOString(),
      sources_unavailable: [...unavailable],
    };

    if (SCORING_ENABLED) {
      const signals = await db.Signal.filter({ borrower_id: borrowerId }, '-date', 500);
      const today = new Date().toISOString().slice(0, 10);
      const res = await base44.asServiceRole.functions.invoke('scoreBorrower', { signals, today });
      if (res?.data?.status) {
        finalUpdate.status = res.data.status;
        finalUpdate.why = res.data.why;
      }
    }

    const updated = await db.Borrower.update(borrowerId, finalUpdate);
    return Response.json({ borrower: updated });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
