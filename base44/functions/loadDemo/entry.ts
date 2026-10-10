import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { loadDemo, type DemoDb } from './logic.ts';

// loadDemo({ purge_placeholders? }) -> { companies: [{ id, name, created }], purged }
//
// "Load demo companies" on the loan book. Signed out: fills the shared demo book (no owner_email), which only
// signed-out visitors see. Signed in: adds copies owned by the caller; the owner comes from auth.me(), never from
// the request body. Idempotent (matched by website_domain within the book), one run per book per 30 s (429).
// purge_placeholders (shared book only) deletes the seeded .example companies and their records.
// It only creates "Not checked" companies; the page then runs refreshBorrower on each one, which spends Bright Data
// credits under refreshBorrower's own access rules and cooldown. Rules: logic.ts.
export default async function (req: Request): Promise<Response> {
  try {
    let body: { purge_placeholders?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      body = {}; // no body: defaults
    }
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    const ownerEmail = typeof caller?.email === 'string' && caller.email.trim() ? caller.email : undefined;
    const db = base44.asServiceRole.entities as unknown as DemoDb;
    const result = await loadDemo(db, {
      now: Date.now(),
      ownerEmail,
      purgePlaceholders: body?.purge_placeholders === true,
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
