import { canAccessCompany } from './access.ts';

// Two-way document exchange between the bank and a company, to prove or disprove the flags in its report.
//   bank     (company page; same access as the rest of the app): list, portal_link, request, send, review
//   company  (private upload link, token only, no login):        portal, portal_send, portal_request
// Either side can ask for a document or send one. Every document lands as "submitted"; only the bank reviews
// it (accept or reject, and what it shows: supports the flag, contradicts it, or has no bearing). Accepted
// documents feed the next audit (auditReport). Nothing here changes a company's status.

export const PURPOSES = ['prove', 'disprove', 'context'];
export const FINDINGS = ['supports', 'contradicts', 'no_bearing'];
const MAX_TEXT = 100_000;

class InputError extends Error {}
const str = (v: unknown, max: number, what: string, required = false) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new InputError(`Add ${what}.`);
    return '';
  }
  if (typeof v !== 'string' || v.length > max) throw new InputError(`${what[0].toUpperCase()}${what.slice(1)} must be text of at most ${max.toLocaleString('en-US')} characters.`);
  return v.trim();
};
const purposeOf = (v: unknown) => {
  if (!PURPOSES.includes(v as string)) throw new InputError('Choose what the document is for: prove, disprove or context.');
  return v as string;
};

/** What the company may see of a record: never the bank's other notes, never another company's data. */
function forCompany(d: any) {
  return { id: d.id, from: d.from, status: d.status, purpose: d.purpose, signal_title: d.signal_title || '', title: d.title || '', reason: d.reason || '', name: d.name || '', note: d.note || '', submitted_at: d.submitted_at || '', reviewed_at: d.reviewed_at || '', outcome: d.status === 'accepted' || d.status === 'rejected' ? d.status : '' };
}
function forBank(d: any) {
  const { text, token: _token, ...rest } = d;
  return { ...rest, chars: (text || '').length, excerpt: (text || '').slice(0, 1200) };
}

export async function handleExchange(body: any, deps: any) {
  const reply = (status: number, data: any) => ({ status, data });
  try {
    const action = body?.action;
    const now = deps.now();

    // ---- company side: the token is the only key
    if (['portal', 'portal_send', 'portal_request'].includes(action)) {
      const token = typeof body.token === 'string' ? body.token : '';
      const portal = token.length >= 24 ? (await deps.find({ kind: 'portal', token }))[0] : null;
      if (!portal) return reply(404, { error: 'This upload link is not valid. Ask the bank for a new one.' });
      const borrower = await deps.borrower(portal.borrower_id).catch(() => null);
      if (!borrower) return reply(404, { error: 'This upload link is no longer active.' });
      const docs = await deps.find({ borrower_id: borrower.id, kind: 'document' });
      if (action === 'portal') return reply(200, { company: borrower.name, items: docs.map(forCompany) });
      if (action === 'portal_request') {
        const rec = await deps.create({ borrower_id: borrower.id, kind: 'document', from: 'company', status: 'requested', purpose: 'context', title: str(body.title, 200, 'a title', true), reason: str(body.reason, 1000, 'the reason'), created_by: 'company', created_at: now });
        return reply(200, { item: forCompany(rec) });
      }
      // portal_send: answer one of the bank's requests, or send something unasked (to prove or disprove a flag).
      const text = await readText(body, deps);
      const name = str(body.name, 200, 'a file name', true);
      if (body.id) {
        const req = docs.find((d: any) => d.id === body.id);
        if (!req || req.from !== 'bank' || !['requested', 'rejected'].includes(req.status)) return reply(409, { error: 'That request is not open any more.' });
        const rec = await deps.update(req.id, { status: 'submitted', name, text, file_url: str(body.file_url, 2000, 'the file link'), note: str(body.note, 1000, 'the note'), submitted_by: 'company', submitted_at: now, review_note: '', reviewed_by: '', reviewed_at: '' });
        return reply(200, { item: forCompany(rec) });
      }
      const rec = await deps.create({ borrower_id: borrower.id, kind: 'document', from: 'company', status: 'submitted', purpose: purposeOf(body.purpose), title: str(body.title, 200, 'a title', true), name, text, file_url: str(body.file_url, 2000, 'the file link'), note: str(body.note, 1000, 'the note'), created_by: 'company', created_at: now, submitted_by: 'company', submitted_at: now });
      return reply(200, { item: forCompany(rec) });
    }

    // ---- bank side
    if (!['list', 'portal_link', 'request', 'send', 'review', 'accepted'].includes(action) || typeof body.borrower_id !== 'string' || !body.borrower_id) return reply(400, { error: 'Provide borrower_id and a valid action.' });
    const user = await deps.user();
    const borrower = await deps.borrower(body.borrower_id).catch(() => null);
    if (!borrower) return reply(404, { error: 'Company not found.' });
    if (!canAccessCompany(borrower, user)) return reply(403, { error: 'You do not have access to this company.' });
    const who = user?.email || 'Demo reviewer';
    const all = await deps.find({ borrower_id: borrower.id });
    const docs = all.filter((d: any) => d.kind === 'document').sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
    const portal = all.find((d: any) => d.kind === 'portal');

    if (action === 'list') return reply(200, { items: docs.map(forBank), portal_token: portal?.token || '' });
    if (action === 'accepted') return reply(200, { items: docs.filter((d: any) => d.status === 'accepted').map((d: any) => ({ id: d.id, name: d.name || d.title, title: d.title, text: d.text || '', signal_id: d.signal_id || '', finding: d.finding || 'no_bearing', reviewed_by: d.reviewed_by || '', review_note: d.review_note || '' })) });
    if (action === 'portal_link') {
      if (portal) return reply(200, { portal_token: portal.token });
      const rec = await deps.create({ borrower_id: borrower.id, kind: 'portal', token: deps.token(), created_by: who, created_at: now });
      return reply(200, { portal_token: rec.token });
    }
    const signal = body.signal_id ? (await deps.signals(borrower.id)).find((s: any) => s.id === body.signal_id) : null;
    if (body.signal_id && !signal) return reply(400, { error: 'That flag is no longer in the report.' });
    if (action === 'request') {
      const rec = await deps.create({ borrower_id: borrower.id, kind: 'document', from: 'bank', status: 'requested', purpose: purposeOf(body.purpose), signal_id: signal?.id || '', signal_title: signal?.title || '', title: str(body.title, 200, 'a title', true), reason: str(body.reason, 1000, 'the reason'), created_by: who, created_at: now });
      return reply(200, { item: forBank(rec) });
    }
    if (action === 'send') {
      const text = await readText(body, deps);
      const name = str(body.name, 200, 'a file name', true);
      if (body.id) {
        const req = docs.find((d: any) => d.id === body.id);
        if (!req || req.from !== 'company' || req.status !== 'requested') return reply(409, { error: 'That request is not open any more.' });
        const rec = await deps.update(req.id, { status: 'submitted', name, text, file_url: str(body.file_url, 2000, 'the file link'), note: str(body.note, 1000, 'the note'), submitted_by: who, submitted_at: now });
        return reply(200, { item: forBank(rec) });
      }
      const rec = await deps.create({ borrower_id: borrower.id, kind: 'document', from: 'bank', status: 'submitted', purpose: purposeOf(body.purpose), signal_id: signal?.id || '', signal_title: signal?.title || '', title: str(body.title, 200, 'a title', true), name, text, file_url: str(body.file_url, 2000, 'the file link'), note: str(body.note, 1000, 'the note'), created_by: who, created_at: now, submitted_by: who, submitted_at: now });
      return reply(200, { item: forBank(rec) });
    }
    // review
    const doc = docs.find((d: any) => d.id === body.id);
    if (!doc || doc.status !== 'submitted') return reply(409, { error: 'Only a submitted document can be reviewed.' });
    if (!['accept', 'reject'].includes(body.decision)) return reply(400, { error: 'Accept or reject the document.' });
    const finding = body.decision === 'accept' ? body.finding : null;
    if (body.decision === 'accept' && !FINDINGS.includes(finding)) return reply(400, { error: 'Say what the document shows: supports the flag, contradicts it, or no bearing.' });
    if (body.decision === 'accept' && finding !== 'no_bearing' && !doc.signal_id) return reply(400, { error: 'Link the document to a flag before saying it supports or contradicts one.' });
    const reviewNote = str(body.note, 1000, 'the note');
    if (body.decision === 'reject' && !reviewNote) return reply(400, { error: 'Say why the document is rejected, so the company can send a better one.' });
    // Base44 rejects null for an enum field, so a rejection leaves the finding out.
    const rec = await deps.update(doc.id, { status: body.decision === 'accept' ? 'accepted' : 'rejected', ...(finding ? { finding } : {}), review_note: reviewNote, reviewed_by: who, reviewed_at: now });
    return reply(200, { item: forBank(rec) });
  } catch (e) {
    if (e instanceof InputError) return reply(400, { error: e.message });
    return reply(500, { error: 'Could not complete the document exchange. Nothing was changed.' });
  }
}

/** The document's text: sent as text, or read from an uploaded file (PDF) on the server. */
async function readText(body: any, deps: any): Promise<string> {
  let text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text && typeof body.file_url === 'string' && /^https:\/\//.test(body.file_url)) text = String((await deps.extractText(body.file_url).catch(() => '')) || '').trim();
  if (!text) throw new InputError('Could not read any text from this document. Send a text file or a searchable PDF.');
  return text.slice(0, MAX_TEXT);
}
