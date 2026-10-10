import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeCompany, ownerEmailFor, visibleCompanies, canDeleteConversation } from '../src/lib/ownership.js';

// Client mirror of base44/functions/*/access.ts: signed in = own companies
// only; signed out = the unowned shared demo book.
const book = [
  { id: 'own', owner_email: 'a@x.com' },
  { id: 'other', owner_email: 'b@x.com' },
  { id: 'shared' },
  { id: 'blank', owner_email: '' },
];

test('signed in: only own companies are visible (case-insensitive)', () => {
  assert.deepEqual(visibleCompanies(book, 'A@x.com').map((b) => b.id), ['own']);
  assert.equal(canSeeCompany({ owner_email: 'a@x.com' }, ' a@X.com '), true);
  assert.equal(canSeeCompany({}, 'a@x.com'), false);
});

test('signed out: only the unowned shared demo book is visible', () => {
  assert.deepEqual(visibleCompanies(book, '').map((b) => b.id), ['shared', 'blank']);
  assert.deepEqual(visibleCompanies(book, null).map((b) => b.id), ['shared', 'blank']);
});

test('visibleCompanies tolerates a missing list', () => {
  assert.deepEqual(visibleCompanies(null, 'a@x.com'), []);
});

test('ownerEmailFor normalizes the signed-in email and is undefined when signed out', () => {
  assert.equal(ownerEmailFor(' A@X.com '), 'a@x.com');
  assert.equal(ownerEmailFor(''), undefined);
  assert.equal(ownerEmailFor(null), undefined);
});

test('only the creator can delete a conversation', () => {
  assert.equal(canDeleteConversation({ created_by: 'A@x.com' }, 'a@x.com'), true);
  assert.equal(canDeleteConversation({ created_by: 'b@x.com' }, 'a@x.com'), false);
  assert.equal(canDeleteConversation({ created_by: 'a@x.com' }, ''), false);
  assert.equal(canDeleteConversation({}, 'a@x.com'), false);
  assert.equal(canDeleteConversation(null, 'a@x.com'), false);
});
