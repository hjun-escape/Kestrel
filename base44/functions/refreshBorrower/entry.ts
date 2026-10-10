import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// refreshBorrower(borrower_id). Owner: P1. See docs/PLAN.md §2 and CLAUDE.md "Refresh flow".
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

// Signal functions: each takes { borrower, snapshot_id? } and returns Signal[]
// (or { signals }), and returns a non-2xx status on failure. It never writes
// status. One function can cover several sources: newsSignals returns both
// exec_departure (News) and legal_layoffs (Legal), so if it fails, both are
// marked unavailable.
//
// Slow Bright Data snapshots: a function may answer 503 with { snapshot_id }
// while the snapshot is still building. That source counts as unavailable for
// this refresh, the id is saved in Borrower.pending_snapshots[name], and the
// next refresh passes it back as snapshot_id instead of paying for a new one.
//
// Switch a function on in your own branch, together with the function itself:
// set enabled: true on its line. Scoring must already be on. P1 merges.
const SIGNAL_FUNCTIONS = [
  { name: 'newsSignals',   owner: 'P2', enabled: false, sources: { exec_departure: 'News', legal_layoffs: 'Legal' } },
  { name: 'hiringSignal',  owner: 'P3', enabled: false, sources: { hiring_drop: 'Jobs' } },
  { name: 'reviewSignals', owner: 'P3', enabled: false, sources: { review_distress: 'Reviews' } },
];

// scoreBorrower (P3) takes { signals, today: 'YYYY-MM-DD' } and returns
// { status, why }, counting only the last 90 days. Ships in the same merge as
// base44/functions/scoreBorrower.
const SCORING_ENABLED = true;

// A source that takes longer than this counts as unavailable. Signal functions
// should give up and answer 503 with their snapshot_id well before it
// (about 150 s at most), so the id reaches us and the next refresh can resume.
const SOURCE_TIMEOUT_MS = 200_000;

// Seed data (src/lib/seedData.js) marks every fake signal this way. A real
// refresh deletes them so they are never scored as if they were real.
const PLACEHOLDER_PREFIX = '[placeholder]';

type Signal = { id?: string; type: string; date: string; title?: string; snippet?: string; source_url?: string };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// functions.invoke rejects with the raw HTTP error; pull out what we need.
function errorInfo(error: unknown): { status?: number; message: string; snapshotId?: string } {
  const e = error as { response?: { status?: number; data?: { error?: string; snapshot_id?: string } }; message?: string };
  return {
    status: e.response?.status,
    message: e.response?.data?.error || e.message || String(error),
    snapshotId: e.response?.data?.snapshot_id,
  };
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
    const pending: Record<string, string> = { ...(borrower.pending_snapshots || {}) };
    let answered = 0;

    // Saves run one after another so a slower write never overwrites a newer one.
    let saveChain: Promise<unknown> = Promise.resolve();
    const save = (fn: () => Promise<unknown>) => (saveChain = saveChain.then(fn));
    const saveProgress = () =>
      db.Borrower.update(borrowerId, { sources_unavailable: [...unavailable], pending_snapshots: { ...pending } });

    const runs = enabled.map(async (fn) => {
      const types = Object.keys(fn.sources);
      const sourceNames = Object.values(fn.sources);
      const snapshotId = pending[fn.name];
      try {
        const res = await withTimeout<any>(
          base44.asServiceRole.functions.invoke(fn.name, snapshotId ? { borrower, snapshot_id: snapshotId } : { borrower }),
          SOURCE_TIMEOUT_MS,
          fn.name,
        );
        const returned = Array.isArray(res?.data) ? res.data : res?.data?.signals;
        if (!Array.isArray(returned)) throw new Error(`${fn.name} returned no signal list`);

        // Keep only the signal types this function owns.
        const signals = returned
          .filter((s: Signal) => types.includes(s.type))
          .map((s: Signal) => ({ ...s, borrower_id: borrowerId }));

        await save(async () => {
          // Replace this source's signals.
          for (const type of types) {
            await db.Signal.deleteMany({ borrower_id: borrowerId, type });
          }
          if (signals.length > 0) await db.Signal.bulkCreate(signals);
          sourceNames.forEach((s) => unavailable.delete(s));
          delete pending[fn.name];
          answered += 1;
          await saveProgress();
        });
      } catch (error) {
        // Skip a failing source: mark it unavailable and keep its previous signals.
        const info = errorInfo(error);
        if (info.status === 503 && info.snapshotId) {
          console.log(`${fn.name}: snapshot ${info.snapshotId} still building, will resume next refresh`);
        } else {
          console.error(`${fn.name} failed:`, info.message);
        }
        await save(async () => {
          sourceNames.forEach((s) => unavailable.add(s));
          // Keep a still-building snapshot to resume; drop anything else so the next refresh starts fresh.
          if (info.status === 503 && info.snapshotId) pending[fn.name] = info.snapshotId;
          else delete pending[fn.name];
          await saveProgress();
        });
      }
    });

    await Promise.all(runs);
    await saveChain;

    if (answered === 0) {
      // Nothing was checked: keep last_refreshed, status and why as they were.
      const waiting = Object.keys(pending).length > 0;
      const error = waiting
        ? 'Sources are still collecting data. Refresh again in a minute.'
        : 'No data source responded. Try again in a minute.';
      return Response.json({ error }, { status: 502 });
    }

    // Before scoring: delete placeholder seed signals, and exact duplicates
    // (two refreshes of the same company at once can both write a source).
    const stored: Signal[] = await db.Signal.filter({ borrower_id: borrowerId }, '-date', 500);
    const seen = new Set<string>();
    const kept: Signal[] = [];
    for (const s of stored) {
      const key = [s.type, s.date, s.title, s.snippet, s.source_url].join('|');
      if ((s.snippet || '').startsWith(PLACEHOLDER_PREFIX) || seen.has(key)) {
        if (s.id) await db.Signal.delete(s.id);
      } else {
        seen.add(key);
        kept.push(s);
      }
    }

    const finalUpdate: Record<string, unknown> = {
      sources_unavailable: [...unavailable],
      pending_snapshots: { ...pending },
    };

    if (SCORING_ENABLED) {
      let scored: { status?: string; why?: string } | undefined;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await base44.asServiceRole.functions.invoke('scoreBorrower', { signals: kept, today });
        scored = res?.data;
      } catch (error) {
        await db.Borrower.update(borrowerId, finalUpdate);
        return Response.json({ error: `Scoring failed: ${errorInfo(error).message}` }, { status: 502 });
      }
      if (!scored || !['green', 'yellow', 'red'].includes(scored.status || '')) {
        // Never mark a company as checked with a status nobody computed.
        await db.Borrower.update(borrowerId, finalUpdate);
        return Response.json({ error: 'Scoring returned no status.' }, { status: 502 });
      }
      finalUpdate.status = scored.status;
      finalUpdate.why = scored.why;
      finalUpdate.last_refreshed = new Date().toISOString();
    } else if (borrower.last_refreshed) {
      // Scoring off: only a company that already has a computed status gets a new timestamp.
      finalUpdate.last_refreshed = new Date().toISOString();
    }

    const updated = await db.Borrower.update(borrowerId, finalUpdate);
    return Response.json({ borrower: updated });
  } catch (error) {
    return Response.json({ error: errorInfo(error).message }, { status: 500 });
  }
}
