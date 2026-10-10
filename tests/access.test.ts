import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Per-user companies: a signed-in caller may access only the companies whose
// owner_email is their email; a signed-out caller only the unowned shared
// demo book (no owner_email).
// Base44 bundles each function folder on its own, so access.ts is copied into
// every folder that enforces it; these tests run the same table on every copy
// and check the copies stay identical.
import * as askPortfolio from '../base44/functions/askPortfolio/access.ts';
import * as confirmAction from '../base44/functions/confirmAction/access.ts';
import * as refreshBorrower from '../base44/functions/refreshBorrower/access.ts';
import * as analyzeBorrower from '../base44/functions/analyzeBorrower/access.ts';
import * as lenderCheck from '../base44/functions/lenderCheck/access.ts';
import * as analyzeCashflow from '../base44/functions/analyzeCashflow/access.ts';
import { scopeDataLayer } from '../base44/functions/askPortfolio/scopedData.ts';
import { runAgent } from '../base44/functions/askPortfolio/logic.ts';
import { executeAction } from '../base44/functions/confirmAction/logic.ts';
import type { ConfirmDeps } from '../base44/functions/confirmAction/logic.ts';

const COPIES = { askPortfolio, confirmAction, refreshBorrower, analyzeBorrower, lenderCheck, analyzeCashflow };
const FOLDERS = Object.keys(COPIES);

const A = { email: 'a@x.com' };
const B = { email: 'b@x.com' };

for (const [folder, mod] of Object.entries(COPIES)) {
  describe(`canAccessCompany (${folder})`, () => {
    const { canAccessCompany } = mod;

    test('a signed-out caller can access the unowned shared demo book', () => {
      assert.equal(canAccessCompany({}, null), true);
      assert.equal(canAccessCompany({ owner_email: '' }, {}), true);
      assert.equal(canAccessCompany({ owner_email: null }, null), true);
      assert.equal(canAccessCompany({ owner_email: '   ' }, undefined), true);
    });

    test('a signed-in caller cannot access unowned shared companies', () => {
      assert.equal(canAccessCompany({}, A), false);
      assert.equal(canAccessCompany({ owner_email: '' }, A), false);
      assert.equal(canAccessCompany({ owner_email: null }, A), false);
    });

    test('the owner can access their own company', () => {
      assert.equal(canAccessCompany({ owner_email: 'a@x.com' }, A), true);
    });

    test('email comparison ignores case and surrounding spaces', () => {
      assert.equal(canAccessCompany({ owner_email: ' A@X.com ' }, { email: 'a@x.COM' }), true);
    });

    test('another signed-in user cannot access an owned company', () => {
      assert.equal(canAccessCompany({ owner_email: 'a@x.com' }, B), false);
    });

    test('a signed-out caller cannot access an owned company', () => {
      assert.equal(canAccessCompany({ owner_email: 'a@x.com' }, null), false);
      assert.equal(canAccessCompany({ owner_email: 'a@x.com' }, undefined), false);
      assert.equal(canAccessCompany({ owner_email: 'a@x.com' }, {}), false);
      assert.equal(canAccessCompany({ owner_email: 'a@x.com' }, { email: '' }), false);
    });

    test('a missing company is not accessible', () => {
      assert.equal(canAccessCompany(null, A), false);
      assert.equal(canAccessCompany(undefined, A), false);
    });

    test('a non-string owner_email fails closed', () => {
      assert.equal(canAccessCompany({ owner_email: 42 }, A), false);
    });
  });
}

test('every copy of access.ts is identical', () => {
  const read = (folder: string) =>
    readFileSync(new URL(`../base44/functions/${folder}/access.ts`, import.meta.url), 'utf8');
  const first = read(FOLDERS[0]);
  for (const folder of FOLDERS.slice(1)) assert.equal(read(folder), first, `${folder}/access.ts differs`);
});

test('ownerEmailFor returns the normalized email of a signed-in caller, or undefined', () => {
  const { ownerEmailFor } = confirmAction;
  assert.equal(ownerEmailFor({ email: ' A@X.com ' }), 'a@x.com');
  assert.equal(ownerEmailFor(null), undefined);
  assert.equal(ownerEmailFor({ email: '' }), undefined);
  assert.equal(ownerEmailFor({}), undefined);
});

// ---- askPortfolio: the data layer only ever returns accessible companies.

const BOOK = [
  { id: 'own1', name: 'Alpha Own Co', owner_email: 'a@x.com' },
  { id: 'own2', name: 'Beta Own Co', owner_email: 'A@x.com' },
  { id: 'other', name: 'Gamma Other Co', owner_email: 'b@x.com' },
  { id: 'shared1', name: 'Delta Shared Co' },
  { id: 'shared2', name: 'Epsilon Shared Co', owner_email: '' },
];
const SIGNALS = [
  { id: 's1', borrower_id: 'other', type: 'exec_departure', title: 'Gamma CFO resigns' },
  { id: 's2', borrower_id: 'shared1', type: 'legal_layoffs', title: 'Delta lawsuit' },
];

function rawData() {
  return {
    listBorrowers: async () => BOOK.map((b) => ({ ...b })),
    getBorrower: async (id: string) => BOOK.find((b) => b.id === id) ?? null,
    listSignals: async (id: string) => SIGNALS.filter((s) => s.borrower_id === id),
  };
}

describe('scopeDataLayer (askPortfolio)', () => {
  test('signed in: listBorrowers returns only the caller\'s own companies', async () => {
    const data = scopeDataLayer(rawData(), A);
    const ids = (await data.listBorrowers()).map((b) => b.id);
    assert.deepEqual(ids, ['own1', 'own2']);
  });

  test('signed out: listBorrowers returns only the shared demo book', async () => {
    const data = scopeDataLayer(rawData(), null);
    const ids = (await data.listBorrowers()).map((b) => b.id);
    assert.deepEqual(ids, ['shared1', 'shared2']);
  });

  test('getBorrower returns null for a company owned by someone else or unowned', async () => {
    const data = scopeDataLayer(rawData(), A);
    assert.equal(await data.getBorrower('other'), null);
    assert.equal(await data.getBorrower('shared1'), null);
    assert.equal((await data.getBorrower('own1'))?.id, 'own1');
  });

  test('listSignals returns nothing for a company the caller cannot access', async () => {
    const signedIn = scopeDataLayer(rawData(), A);
    assert.deepEqual(await signedIn.listSignals('other'), []);
    assert.deepEqual(await signedIn.listSignals('shared1'), []);
    const signedOut = scopeDataLayer(rawData(), null);
    assert.equal((await signedOut.listSignals('shared1')).length, 1);
    assert.deepEqual(await signedOut.listSignals('other'), []);
  });
});

function fakeLlm(replies: unknown[]) {
  const prompts: string[] = [];
  let i = 0;
  const llm = async (prompt: string) => {
    prompts.push(prompt);
    return replies[Math.min(i++, replies.length - 1)];
  };
  return { llm, prompts };
}
const user = (content: string) => [{ role: 'user', content }];
const clock = () => 0;

describe('askPortfolio tools through the scoped data layer', () => {
  test('context_company_id of a company owned by someone else is ignored', async () => {
    const data = scopeDataLayer(rawData(), A);
    const { llm, prompts } = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Any news?'), contextCompanyId: 'other', llm, data, now: clock, log: () => {} });
    assert.doesNotMatch(prompts[0], /pinned/i);
    assert.doesNotMatch(prompts[0], /Gamma Other Co/);
  });

  test('context_company_id of an own company is used', async () => {
    const data = scopeDataLayer(rawData(), A);
    const { llm, prompts } = fakeLlm([{ action: 'final', answer: 'ok', citations: [] }]);
    await runAgent({ messages: user('Any news?'), contextCompanyId: 'own1', llm, data, now: clock, log: () => {} });
    assert.match(prompts[0], /Alpha Own Co \(id own1\)/);
  });

  test('list_companies never shows a company owned by someone else', async () => {
    const data = scopeDataLayer(rawData(), A);
    const { llm, prompts } = fakeLlm([
      { action: 'tool', tool: 'list_companies', args: {} },
      { action: 'final', answer: 'done', citations: [] },
    ]);
    await runAgent({ messages: user('List my companies'), llm, data, now: clock, log: () => {} });
    const joined = prompts.join('\n');
    assert.match(joined, /Alpha Own Co/);
    assert.doesNotMatch(joined, /Delta Shared Co/);
    assert.doesNotMatch(joined, /Gamma Other Co/);
  });
});

// ---- confirmAction: screen sets the owner; refresh/deep_check need access.

function fakeDeps(caller: { email?: string } | null) {
  const created: Record<string, unknown>[] = [];
  const invoked: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const deps: ConfirmDeps = {
    caller,
    createBorrower: async (data) => {
      created.push(data);
      return { id: 'new1', ...data };
    },
    getBorrower: async (id) => BOOK.find((b) => b.id === id) ?? null,
    invoke: async (name, payload) => {
      invoked.push({ name, payload });
      return { ok: true };
    },
  };
  return { deps, created, invoked };
}

describe('confirmAction ownership', () => {
  const screen = { kind: 'screen', params: { name: 'Zeta Co', website_domain: 'zeta.com', owner_email: 'evil@x.com' } };

  test('screen sets owner_email from the signed-in caller, never from the action', async () => {
    const { deps, created } = fakeDeps({ email: 'A@x.com' });
    const res = await executeAction(screen, deps);
    assert.equal(res.status, 200);
    assert.equal(created[0].owner_email, 'a@x.com');
  });

  test('screen without a caller email leaves the company shared', async () => {
    const { deps, created } = fakeDeps(null);
    await executeAction(screen, deps);
    assert.equal('owner_email' in created[0], false);
  });

  test('refresh of a company owned by someone else is refused with 403 and runs nothing', async () => {
    const { deps, invoked } = fakeDeps(A);
    const res = await executeAction({ kind: 'refresh', params: { id: 'other' } }, deps);
    assert.equal(res.status, 403);
    assert.equal(invoked.length, 0);
  });

  test('deep_check of a company owned by someone else is refused with 403', async () => {
    const { deps, invoked } = fakeDeps(A);
    const res = await executeAction({ kind: 'deep_check', params: { id: 'other', question: 'Any liens?' } }, deps);
    assert.equal(res.status, 403);
    assert.equal(invoked.length, 0);
  });

  test('refresh of an own company runs', async () => {
    const { deps, invoked } = fakeDeps(A);
    const res = await executeAction({ kind: 'refresh', params: { id: 'own1' } }, deps);
    assert.equal(res.status, 200);
    assert.equal(invoked[0].name, 'refreshBorrower');
  });

  test('a signed-in caller cannot refresh an unowned shared company', async () => {
    const { deps, invoked } = fakeDeps(A);
    const res = await executeAction({ kind: 'refresh', params: { id: 'shared1' } }, deps);
    assert.equal(res.status, 403);
    assert.equal(invoked.length, 0);
  });
});
