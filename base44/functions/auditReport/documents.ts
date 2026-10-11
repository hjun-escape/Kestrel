// Context documents and the final sign-off for an audit. Deterministic, no AI: for each flag we find the
// sentences in the officer's documents that talk about the same thing, and quote them word for word.
// The passages are context for the reviewer. They never change a test verdict or the company's status.

import { InputError } from './logic.ts';

export type ContextDocument = { id: string; name: string; text: string };
export type Passage = { doc_id: string; doc_name: string; quote: string; terms: string[] };
export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_CHARS = 100_000;
export const SIGNOFF_OUTCOMES = ['proceed', 'proceed_with_conditions', 'request_documents', 'decline'] as const;

// Words that show a sentence is about the same kind of event as the flag.
const TYPE_TERMS: Record<string, string[]> = {
  exec_departure: ['ceo', 'cfo', 'chief', 'president', 'founder', 'resign', 'resigned', 'resigns', 'stepped', 'steps down', 'depart', 'departed', 'departure', 'leaving', 'left', 'successor', 'interim'],
  legal_layoffs: ['lawsuit', 'sued', 'suit', 'lien', 'litigation', 'warn', 'layoff', 'layoffs', 'laid off', 'bankruptcy', 'chapter 11', 'settlement', 'judgment', 'creditor', 'closing', 'closure'],
  hiring_drop: ['hiring', 'hire', 'headcount', 'postings', 'openings', 'recruiting', 'freeze', 'employees', 'staff', 'workforce'],
  review_distress: ['layoff', 'layoffs', 'furlough', 'payroll', 'paycheck', 'late pay', 'missed pay', 'closing', 'closure', 'shutting down', 'morale'],
};
const STOP = new Set(['about', 'after', 'again', 'against', 'below', 'their', 'there', 'these', 'those', 'which', 'while', 'would', 'could', 'should', 'company', 'normal', 'review', 'reviews', 'mentions', 'expected', 'size', 'launches', 'offer']);

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const lower = (s: string) => s.toLowerCase();

export function validateDocuments(raw: unknown): ContextDocument[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_DOCUMENTS) throw new InputError(`Add at most ${MAX_DOCUMENTS} context documents.`);
  const seen = new Set<string>();
  return raw.map((d: any, i: number) => {
    const n = `Document ${i + 1}`;
    if (!d || typeof d.id !== 'string' || !d.id || d.id.length > 100 || seen.has(d.id) || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 200) throw new InputError(`${n} is malformed. Remove it and add it again.`);
    if (typeof d.text !== 'string' || !d.text.trim()) throw new InputError(`${n} (${d.name}) has no readable text.`);
    if (d.text.length > MAX_DOCUMENT_CHARS) throw new InputError(`${n} (${d.name}) is longer than ${MAX_DOCUMENT_CHARS.toLocaleString('en-US')} characters. Trim it to the relevant pages.`);
    seen.add(d.id);
    return { id: d.id, name: d.name.trim(), text: d.text };
  });
}

/** Sentences (or short lines) of a document, kept verbatim. */
export function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map(clean)
    .filter((s) => s.length >= 20 && s.length <= 600);
}

function titleWords(signal: { title?: string }): string[] {
  return [...new Set(lower(signal.title || '').match(/[a-z][a-z'-]{4,}/g) || [])].filter((w) => !STOP.has(w));
}

/** The best passages (at most `limit`) across the documents that relate to one flag. */
export function passagesFor(signal: { type: string; title?: string }, docs: ContextDocument[], limit = 2): Passage[] {
  const typeTerms = TYPE_TERMS[signal.type] || [];
  const words = titleWords(signal);
  const scored: (Passage & { score: number })[] = [];
  for (const doc of docs) {
    for (const quote of sentences(doc.text)) {
      const l = ` ${lower(quote).replace(/[^a-z0-9' ]+/g, ' ')} `;
      const typeHits = typeTerms.filter((t) => l.includes(` ${t} `) || l.includes(` ${t}s `));
      const wordHits = words.filter((w) => l.includes(` ${w}`));
      // A sentence must share the flag's subject: an event word plus a word from the flag, or two event words.
      const score = typeHits.length * 2 + wordHits.length * 3;
      if ((typeHits.length && wordHits.length) || typeHits.length >= 2) scored.push({ doc_id: doc.id, doc_name: doc.name, quote, terms: [...typeHits, ...wordHits], score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...p }) => p);
}

/** Per flag: the passages from the documents, plus a summary of the documents (names and sizes, not the text). */
export function documentContext(signals: { id: string; type: string; title?: string }[], docs: ContextDocument[]) {
  return {
    documents: docs.map((d) => ({ id: d.id, name: d.name, chars: d.text.length })),
    document_context: docs.length ? signals.map((s) => ({ signal_id: s.id, passages: passagesFor(s, docs) })) : [],
  };
}

export function validateSignoff(raw: unknown) {
  if (raw === undefined || raw === null) return null;
  const s: any = raw;
  if (!SIGNOFF_OUTCOMES.includes(s.outcome)) throw new InputError('Choose a final outcome before signing off.');
  if (typeof s.note !== 'string' || s.note.length > 1000) throw new InputError('The sign-off note must be at most 1,000 characters.');
  if (s.outcome !== 'proceed' && !s.note.trim()) throw new InputError('Add a note explaining the outcome.');
  return { outcome: s.outcome, note: s.note.trim() };
}

export type AcceptedDocument = { id: string; name: string; title?: string; text: string; signal_id: string; finding: 'supports' | 'contradicts' | 'no_bearing'; reviewed_by?: string; review_note?: string };

/**
 * Documents the bank accepted in the document exchange, applied to an audit payload:
 *   - their sentences join the per-flag passages (with any documents added for this run)
 *   - "supports" turns that flag's claim-support check into a pass, "contradicts" into a fail,
 *     and a contradicted flag is left out of the review risk preview (rescored). The status never changes.
 */
export async function applyExchange(payload: any, signals: any[], runDocs: ContextDocument[], accepted: AcceptedDocument[], rescore: (signals: any[]) => Promise<{ status: string; why: string }>, canRescore = true) {
  const docs = [...runDocs, ...accepted.map((a) => ({ id: a.id, name: a.name || a.title || 'Accepted document', text: a.text || '' })).filter((d) => d.text)];
  Object.assign(payload, documentContext(signals, docs));
  payload.accepted_documents = accepted.map(({ text: _text, ...rest }) => rest);
  for (const a of accepted) {
    if (a.finding === 'no_bearing' || !a.signal_id) continue;
    const t = payload.tests.find((x: any) => x.check === 'support' && x.signal_id === a.signal_id);
    if (!t) continue;
    const by = a.reviewed_by ? ` (accepted by ${a.reviewed_by})` : '';
    t.verdict = a.finding === 'supports' ? 'pass' : 'fail';
    t.actual = `${a.finding === 'supports' ? 'Supported' : 'Contradicted'} by an accepted document: ${a.name || a.title}${by}.`;
    t.reason = `${a.review_note ? `${a.review_note} ` : ''}The bank reviewed this document in the document exchange and recorded that it ${a.finding === 'supports' ? 'supports' : 'contradicts'} the claim.`;
  }
  const contradicted = [...new Set(accepted.filter((a) => a.finding === 'contradicts' && a.signal_id).map((a) => a.signal_id))].filter((id) => signals.some((s) => s.id === id));
  const added = contradicted.filter((id) => !payload.excluded_signal_ids.includes(id));
  if (added.length && canRescore) {
    payload.excluded_signal_ids = [...payload.excluded_signal_ids, ...added];
    const excluded = new Set(payload.excluded_signal_ids);
    payload.result = await rescore(signals.filter((s) => !excluded.has(s.id)));
  }
  return payload;
}
