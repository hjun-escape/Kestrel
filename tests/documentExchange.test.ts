import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleExchange } from '../base44/functions/documentExchange/logic.ts';

function world(owner = '') {
  const rows: any[] = [];
  const borrower = { id: 'b1', name: 'Acme', owner_email: owner };
  let n = 0;
  const deps = {
    user: async () => (owner ? { email: owner } : null),
    borrower: async (id: string) => (id === 'b1' ? borrower : null),
    signals: async () => [{ id: 's1', title: 'CFO steps down' }],
    find: async (q: any) => rows.filter((r) => Object.entries(q).every(([k, v]) => r[k] === v)),
    create: async (r: any) => { const rec = { ...r, id: `d${++n}` }; rows.push(rec); return rec; },
    // Like Base44: null is not a valid value for an enum field.
    update: async (id: string, patch: any) => { if (Object.values(patch).some((v) => v === null)) throw new Error('null field'); const r = rows.find((x) => x.id === id); Object.assign(r, patch); return r; },
    token: () => 'tok_0123456789abcdef0123456789',
    now: () => '2026-10-10T18:00:00Z',
    extractText: async () => 'PDF text: the CFO remains in role.',
  };
  return { rows, deps };
}

test('bank asks, company answers through its link, bank accepts with a finding', async () => {
  const { rows, deps } = world();
  const link = await handleExchange({ action: 'portal_link', borrower_id: 'b1' }, deps);
  assert.equal(link.status, 200);
  const token = link.data.portal_token;
  const req = await handleExchange({ action: 'request', borrower_id: 'b1', purpose: 'disprove', signal_id: 's1', title: 'Board minutes on the CFO', reason: 'Confirm whether the CFO left.' }, deps);
  assert.equal(req.data.item.status, 'requested');
  assert.equal(req.data.item.signal_title, 'CFO steps down');

  const portal = await handleExchange({ action: 'portal', token }, deps);
  assert.equal(portal.data.company, 'Acme');
  assert.deepEqual(portal.data.items.map((i: any) => [i.from, i.status, i.title]), [['bank', 'requested', 'Board minutes on the CFO']]);
  assert.equal('text' in portal.data.items[0], false);

  const sent = await handleExchange({ action: 'portal_send', token, id: req.data.item.id, name: 'minutes.txt', text: 'The board confirmed the CFO remains in role.' }, deps);
  assert.equal(sent.data.item.status, 'submitted');

  const list = await handleExchange({ action: 'list', borrower_id: 'b1' }, deps);
  assert.match(list.data.items[0].excerpt, /remains in role/);
  assert.equal('token' in list.data.items[0], false);

  const accepted = await handleExchange({ action: 'review', borrower_id: 'b1', id: req.data.item.id, decision: 'accept', finding: 'contradicts', note: 'Signed minutes.' }, deps);
  assert.equal(accepted.data.item.status, 'accepted');
  assert.equal(rows[1].reviewed_by, 'Demo reviewer');
  const forAudit = await handleExchange({ action: 'accepted', borrower_id: 'b1' }, deps);
  assert.deepEqual(forAudit.data.items.map((d: any) => [d.signal_id, d.finding]), [['s1', 'contradicts']]);
});

test('company can ask the bank for something and send a document unasked; PDFs are read on the server', async () => {
  const { deps } = world();
  const token = (await handleExchange({ action: 'portal_link', borrower_id: 'b1' }, deps)).data.portal_token;
  const ask = await handleExchange({ action: 'portal_request', token, title: 'Which article is the flag based on?' }, deps);
  assert.deepEqual([ask.data.item.from, ask.data.item.status], ['company', 'requested']);
  const answer = await handleExchange({ action: 'send', borrower_id: 'b1', id: ask.data.item.id, name: 'source.txt', text: 'Link to the article and its quote.' }, deps);
  assert.equal(answer.data.item.status, 'submitted');
  const pdf = await handleExchange({ action: 'portal_send', token, purpose: 'disprove', title: 'Payroll records', name: 'payroll.pdf', file_url: 'https://files.example/payroll.pdf' }, deps);
  assert.equal(pdf.status, 200);
});

test('guards: bad link, review rules, and another owner', async () => {
  const { deps } = world();
  assert.equal((await handleExchange({ action: 'portal', token: 'nope' }, deps)).status, 404);
  const sent = await handleExchange({ action: 'send', borrower_id: 'b1', purpose: 'context', title: 'Notes', name: 'n.txt', text: 'Call notes.' }, deps);
  const id = sent.data.item.id;
  assert.match((await handleExchange({ action: 'review', borrower_id: 'b1', id, decision: 'accept', finding: 'supports' }, deps)).data.error, /Link the document to a flag/);
  assert.match((await handleExchange({ action: 'review', borrower_id: 'b1', id, decision: 'reject' }, deps)).data.error, /Say why/);
  assert.equal((await handleExchange({ action: 'review', borrower_id: 'b1', id, decision: 'accept', finding: 'no_bearing' }, deps)).status, 200);
  const owned = world('a@x.com');
  owned.deps.user = async () => ({ email: 'b@x.com' });
  assert.equal((await handleExchange({ action: 'list', borrower_id: 'b1' }, owned.deps)).status, 403);
});
