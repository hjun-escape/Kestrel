import { buildAudit, suggestConsiderations, validateConsiderations, validateDecisions } from '../../base44/functions/auditReport/logic';
import { applyExchange, validateDocuments, validateSignoff } from '../../base44/functions/auditReport/documents';
import { scoreBorrower } from '../../base44/functions/scoreBorrower/entry';

// Shared demo reviews stay in this page session. No production writes or AI calls.
// getAccepted: documents the bank accepted in the document exchange (optional).
export function createSessionAudit(borrower, signals, trace, getAccepted = null) {
  let runs = [];
  return async body => {
    if (body.action === 'list') return { runs, suggestions: suggestConsiderations(runs, borrower) };
    if (body.action === 'read_document') throw new Error('Sign in to add PDF documents. Text files work without signing in.');
    const today = new Date().toISOString().slice(0, 10);
    const payload = await buildAudit({ borrower, signals, trace, today,
      calculateScore: async ss => scoreBorrower(/** @type {any} */ (ss), today), previous: runs[0]?.payload,
      considerations: validateConsiderations(body.considerations, signals),
      decisions: validateDecisions(body.decisions, signals) });
    if (body.action === 'review') {
      const latest = runs[0]?.payload;
      payload.tests = latest?.tests || payload.tests;
      Object.assign(payload, { documents: latest?.documents || [], document_context: latest?.document_context || [] });
      const signoff = validateSignoff(body.signoff);
      if (signoff) Object.assign(payload, { signoff: { ...signoff, by: 'You (session demo)', at: new Date().toISOString() } });
    } else {
      const accepted = getAccepted ? await getAccepted().catch(() => []) : [];
      await applyExchange(payload, signals, validateDocuments(body.documents), accepted, ss => scoreBorrower(/** @type {any} */ (ss), today), !!borrower.last_refreshed);
    }
    const run = { id: crypto.randomUUID(), kind: body.action === 'review' ? 'review' : 'audit', created_at: new Date().toISOString(), reviewed_by: 'You (session demo)', payload };
    runs = [run, ...runs];
    return { run, suggestions: suggestConsiderations(runs, borrower) };
  };
}
