import { canAccessCompany } from './access.ts';
import { buildAudit, InputError, suggestConsiderations, validateConsiderations, validateDecisions, identityKey } from './logic.ts';
import { documentContext, MAX_DOCUMENT_CHARS, validateDocuments, validateSignoff } from './documents.ts';

// Injectable orchestration so ownership, immutable versions and failed saves can be tested without a live account.
export async function handleAudit(body: any, deps: any) {
  const reply = (status: number, data: any) => ({ status, data });
  try {
    if (!body || typeof body.borrower_id !== 'string' || !body.borrower_id.trim() || !['list', 'run', 'review', 'read_document'].includes(body.action)) return reply(400, { error: 'Provide borrower_id and action: list, run, review or read_document.' });
    const user = await deps.user();
    if (!user?.email) return reply(401, { error: 'Sign in to audit your company reports.' });
    const borrower = await deps.borrower(body.borrower_id).catch(() => null);
    if (!borrower) return reply(404, { error: 'Company not found.' });
    if (!canAccessCompany(borrower, user)) return reply(403, { error: 'You do not have access to this company.' });
    // A PDF (or other uploaded file) added as a context document: return its text for the page to keep.
    if (body.action === 'read_document') {
      if (typeof body.file_url !== 'string' || !/^https:\/\//.test(body.file_url)) return reply(400, { error: 'Provide the uploaded file_url.' });
      const text = String((await deps.extractText(body.file_url).catch(() => '')) || '').trim();
      if (!text) return reply(422, { error: 'Could not read any text from this file. Try a text or searchable PDF file.' });
      return reply(200, { text: text.slice(0, MAX_DOCUMENT_CHARS), truncated: text.length > MAX_DOCUMENT_CHARS });
    }
    const records = await deps.history(body.borrower_id);
    const runs = records.map((r: any) => ({ ...r, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload }));
    if (body.action === 'list') return reply(200, { runs, suggestions: suggestConsiderations(runs, borrower), independent_reviewer: { provider: 'Devin', status: 'not_connected' } });
    const latest = runs[0];
    if (typeof body.parent_run_id !== 'string' || body.parent_run_id !== (latest?.id || '')) return reply(409, { error: 'A newer audit was saved. Reload the company before saving another version.' });
    if (body.action === 'review' && (!latest || latest.payload.identity !== identityKey(borrower) || latest.payload.snapshot.refreshed_at !== (borrower.last_refreshed || ''))) return reply(409, { error: 'The company report changed. Run a new audit before saving decisions.' });
    const signals = body.action === 'review' ? latest.payload.snapshot.signals : await deps.signals(body.borrower_id);
    if (signals.length > 200) return reply(400, { error: 'This audit supports up to 200 evidence items. No partial report was saved.' });
    const considerations = validateConsiderations(body.considerations, signals);
    const decisions = validateDecisions(body.decisions, signals);
    const documents = body.action === 'review' ? [] : validateDocuments(body.documents);
    const signoff = body.action === 'review' ? validateSignoff(body.signoff) : null;
    const trace = body.action === 'review' ? null : await deps.trace(body.borrower_id);
    const payload = await buildAudit({ borrower, signals, trace, considerations, decisions, previous: latest?.payload, today: deps.now().slice(0, 10), calculateScore: deps.score });
    // A reviewer decision adds annotations; it cannot rewrite a recorded test verdict.
    if (body.action === 'review') {
      payload.tests = latest.payload.tests; payload.comparison!.tests_changed = 0;
      // Documents were read by the audit being reviewed; the review keeps what they showed.
      Object.assign(payload, { documents: latest.payload.documents || [], document_context: latest.payload.document_context || [] });
      if (signoff) Object.assign(payload, { signoff: { ...signoff, by: user.email, at: deps.now() } });
    } else Object.assign(payload, documentContext(signals, documents));
    const saved = await deps.save({ borrower_id: body.borrower_id, created_at: deps.now(), reviewed_by: user.email, parent_run_id: latest?.id || '', kind: body.action === 'review' ? 'review' : 'audit', payload: JSON.stringify(payload) });
    const run = { ...saved, payload };
    return reply(200, { run, suggestions: suggestConsiderations([run, ...runs], borrower) });
  } catch (e) {
    if (e instanceof InputError) return reply(400, { error: e.message });
    return reply(500, { error: 'Could not complete or save the audit. No existing review was overwritten.' });
  }
}
