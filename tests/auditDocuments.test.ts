import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentContext, passagesFor, sentences, validateDocuments, validateSignoff } from '../base44/functions/auditReport/documents.ts';
import { handleAudit } from '../base44/functions/auditReport/service.ts';

const memo = readFileSync(new URL('../public/samples/sample-context-memo.txt', import.meta.url), 'utf8');
const docs = [{ id: 'd1', name: 'sample-context-memo.txt', text: memo }];

test('sentences are kept word for word', () => {
  const s = sentences(memo);
  assert.ok(s.includes('No lawsuits, liens or bankruptcy filings were disclosed.'));
  for (const q of s) assert.ok(memo.replace(/\s+/g, ' ').includes(q), q);
});

test('each flag gets the passages about the same event, quoted exactly', () => {
  const cfo = passagesFor({ type: 'exec_departure', title: 'CFO steps down' }, docs);
  assert.match(cfo[0].quote, /chief financial officer resigned/);
  const closing = passagesFor({ type: 'review_distress', title: 'Employee review mentions closing' }, docs);
  assert.match(closing[0].quote, /warehouse is closing in December/);
  const hiring = passagesFor({ type: 'hiring_drop', title: 'Job postings 100% below normal for company size' }, docs);
  assert.match(hiring[0].quote, /hiring freeze/);
  for (const p of [...cfo, ...closing, ...hiring]) assert.ok(memo.includes(p.quote), p.quote);
});

test('a flag the documents do not discuss gets no passages', () => {
  assert.deepEqual(passagesFor({ type: 'exec_departure', title: 'Founder departs' }, [{ id: 'x', name: 'x.txt', text: 'Revenue grew in the third quarter across all regions of the business.' }]), []);
});

test('documentContext keeps names and sizes, not the text', () => {
  const ctx = documentContext([{ id: 's1', type: 'legal_layoffs', title: 'Supplier lawsuit filed' }], docs);
  assert.deepEqual(ctx.documents, [{ id: 'd1', name: 'sample-context-memo.txt', chars: memo.length }]);
  assert.equal(ctx.document_context[0].signal_id, 's1');
  assert.equal(JSON.stringify(ctx).includes('Relationship manager call notes'), false);
});

test('documents and sign-off are validated with clear messages', () => {
  assert.deepEqual(validateDocuments(undefined), []);
  assert.throws(() => validateDocuments([{ id: 'a', name: 'a.txt', text: '  ' }]), /Document 1 \(a.txt\) has no readable text/);
  assert.throws(() => validateDocuments(Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, name: 'n', text: 't' }))), /at most 5/);
  assert.equal(validateSignoff(undefined), null);
  assert.throws(() => validateSignoff({ outcome: 'maybe', note: '' }), /Choose a final outcome/);
  assert.throws(() => validateSignoff({ outcome: 'decline', note: '' }), /Add a note/);
  assert.deepEqual(validateSignoff({ outcome: 'proceed', note: ' ok ' }), { outcome: 'proceed', note: 'ok' });
});

test('service: a run stores document passages; a review with sign-off keeps them and records who signed', async () => {
  const borrower = { id: 'b1', name: 'Acme', website_domain: 'acme.example', hq_city: 'Chicago', status: 'yellow', last_refreshed: '2026-10-10T00:00:00Z', owner_email: 'a@x.com' };
  const signals = [{ id: 's1', type: 'exec_departure', severity: 'strong', date: '2026-10-01', title: 'CFO steps down', snippet: 'CFO steps down.', source_url: 'https://example.com/a', source_name: 'Example' }];
  const saved: any[] = [];
  const deps = {
    user: async () => ({ email: 'a@x.com' }),
    borrower: async () => borrower,
    history: async () => saved.map((r) => ({ ...r })).reverse(),
    signals: async () => signals,
    trace: async () => null,
    score: async () => ({ status: 'yellow', why: 'Yellow: 1 strong' }),
    now: () => '2026-10-10T12:00:00Z',
    save: async (r: any) => { const rec = { ...r, id: `r${saved.length + 1}` }; saved.push(rec); return rec; },
    extractText: async () => 'Extracted text from a PDF about the CFO who resigned in September.',
  };
  const run = await handleAudit({ action: 'run', borrower_id: 'b1', considerations: [], decisions: [], parent_run_id: '', documents: docs }, deps);
  assert.equal(run.status, 200, JSON.stringify(run.data));
  assert.match(run.data.run.payload.document_context[0].passages[0].quote, /chief financial officer resigned/);
  const review = await handleAudit({ action: 'review', borrower_id: 'b1', considerations: [], decisions: [{ signal_id: 's1', decision: 'confirmed', note: '' }], parent_run_id: 'r1', signoff: { outcome: 'request_documents', note: 'Need bank statements.' } }, deps);
  assert.equal(review.status, 200, JSON.stringify(review.data));
  assert.deepEqual(review.data.run.payload.signoff, { outcome: 'request_documents', note: 'Need bank statements.', by: 'a@x.com', at: '2026-10-10T12:00:00Z' });
  assert.equal(review.data.run.payload.documents[0].name, 'sample-context-memo.txt');
  const pdf = await handleAudit({ action: 'read_document', borrower_id: 'b1', file_url: 'https://files.example/a.pdf' }, deps);
  assert.equal(pdf.status, 200);
  assert.match(pdf.data.text, /CFO who resigned/);
});
