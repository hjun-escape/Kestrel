import { buildAudit, suggestConsiderations, validateConsiderations, validateDecisions } from '../../base44/functions/auditReport/logic';
import { scoreBorrower } from '../../base44/functions/scoreBorrower/entry';

// Shared demo reviews stay in this page session. No production writes or AI calls.
export function createSessionAudit(borrower, signals, trace) {
  let runs = [];
  return async body => {
    if (body.action === 'list') return { runs, suggestions: suggestConsiderations(runs, borrower) };
    const today = new Date().toISOString().slice(0, 10);
    const payload = await buildAudit({ borrower, signals, trace, today,
      calculateScore: async ss => scoreBorrower(/** @type {any} */ (ss), today), previous: runs[0]?.payload,
      considerations: validateConsiderations(body.considerations, signals),
      decisions: validateDecisions(body.decisions, signals) });
    const run = { id: crypto.randomUUID(), kind: body.action === 'review' ? 'review' : 'audit', created_at: new Date().toISOString(), reviewed_by: 'You (session demo)', payload };
    runs = [run, ...runs];
    return { run, suggestions: suggestConsiderations(runs, borrower) };
  };
}
