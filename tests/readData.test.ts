// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readData, MAX_LIMIT, DEFAULT_LIMIT, type Db } from "../base44/functions/readData/logic.ts";

const A = { email: "a@x.com" };

const BOOK = [
  { id: "own1", name: "Alpha Own Co", owner_email: "a@x.com" },
  { id: "other", name: "Gamma Other Co", owner_email: "b@x.com" },
  { id: "shared1", name: "Delta Shared Co" },
  { id: "shared2", name: "Epsilon Shared Co", owner_email: "" },
];
const SIGNALS = [
  { id: "s1", borrower_id: "other", title: "Gamma CFO resigns" },
  { id: "s2", borrower_id: "shared1", title: "Delta lawsuit" },
];

// In-memory db that records every filter call and ignores its query (the post-filter must still scope).
function fakeDb() {
  const calls: Array<{ entity: string; query: Record<string, unknown>; sort: string; limit: number }> = [];
  const db: Db = {
    Borrower: {
      get: async (id) => BOOK.find((b) => b.id === id) ?? null,
      filter: async (query, sort, limit) => {
        calls.push({ entity: "Borrower", query, sort, limit });
        return { items: BOOK.map((b) => ({ ...b })) };
      },
    },
    Signal: {
      filter: async (query, sort, limit) => {
        calls.push({ entity: "Signal", query, sort, limit });
        return { items: SIGNALS.filter((s) => s.borrower_id === query.borrower_id) };
      },
    },
  };
  return { db, calls };
}

test("unknown or missing entity -> 400", async () => {
  const { db } = fakeDb();
  assert.equal((await readData(db, null, { entity: "Secret" })).status, 400);
  assert.equal((await readData(db, null, {})).status, 400);
  assert.equal((await readData(db, null, "nope")).status, 400);
});

test("bad sort -> 400; good sort passes through", async () => {
  const { db, calls } = fakeDb();
  assert.equal((await readData(db, null, { entity: "Borrower", sort: "name; drop" })).status, 400);
  const ok = await readData(db, null, { entity: "Borrower", sort: "name" });
  assert.equal(ok.status, 200);
  assert.equal(calls[0].sort, "name");
});

test("limit clamps to 500 and defaults to 100", async () => {
  const { db, calls } = fakeDb();
  await readData(db, null, { entity: "Borrower" });
  assert.equal(calls[0].limit, DEFAULT_LIMIT);
  await readData(db, null, { entity: "Borrower", limit: 9999 });
  assert.equal(calls[1].limit, MAX_LIMIT);
});

test("signed-out Borrower list returns only unowned rows even if the db ignores the query", async () => {
  const { db, calls } = fakeDb();
  const res = await readData(db, null, { entity: "Borrower" });
  assert.equal(res.status, 200);
  assert.deepEqual((res.body.items as { id: string }[]).map((b) => b.id), ["shared1", "shared2"]);
  assert.equal("owner_email" in calls[0].query, false);
});

test("signed-in Borrower list queries owner_email and returns only own rows", async () => {
  const { db, calls } = fakeDb();
  const res = await readData(db, A, { entity: "Borrower" });
  assert.equal(calls[0].query.owner_email, "a@x.com");
  assert.deepEqual((res.body.items as { id: string }[]).map((b) => b.id), ["own1"]);
});

test("owner_email or other unknown key in a Borrower query -> 400", async () => {
  const { db } = fakeDb();
  assert.equal((await readData(db, null, { entity: "Borrower", query: { owner_email: "b@x.com" } })).status, 400);
  assert.equal((await readData(db, A, { entity: "Borrower", query: { status: "red" } })).status, 400);
  const ok = await readData(db, A, { entity: "Borrower", query: { stage: "applicant" } });
  assert.equal(ok.status, 200);
});

test("Borrower get: another user's company -> 404; own -> 200 item; missing -> 404", async () => {
  const { db } = fakeDb();
  assert.equal((await readData(db, A, { entity: "Borrower", id: "other" })).status, 404);
  assert.equal((await readData(db, null, { entity: "Borrower", id: "own1" })).status, 404);
  const own = await readData(db, A, { entity: "Borrower", id: "own1" });
  assert.equal(own.status, 200);
  assert.equal((own.body.item as { id: string }).id, "own1");
  assert.equal((await readData(db, A, { entity: "Borrower", id: "nope" })).status, 404);
});

test("child list needs borrower_id as the only query key", async () => {
  const { db } = fakeDb();
  assert.equal((await readData(db, null, { entity: "Signal" })).status, 400);
  assert.equal((await readData(db, null, { entity: "Signal", query: {} })).status, 400);
  assert.equal((await readData(db, null, { entity: "Signal", query: { borrower_id: "shared1", type: "x" } })).status, 400);
  assert.equal((await readData(db, null, { entity: "Signal", id: "s1" })).status, 400);
});

test("child list for someone else's or a missing company -> 404", async () => {
  const { db } = fakeDb();
  assert.equal((await readData(db, A, { entity: "Signal", query: { borrower_id: "other" } })).status, 404);
  assert.equal((await readData(db, null, { entity: "Signal", query: { borrower_id: "own1" } })).status, 404);
  assert.equal((await readData(db, A, { entity: "Signal", query: { borrower_id: "nope" } })).status, 404);
});

test("child list for an accessible company passes borrower_id, sort and limit through", async () => {
  const { db, calls } = fakeDb();
  const res = await readData(db, null, { entity: "Signal", query: { borrower_id: "shared1" }, sort: "-date", limit: 50 });
  assert.equal(res.status, 200);
  assert.deepEqual(calls[0], { entity: "Signal", query: { borrower_id: "shared1" }, sort: "-date", limit: 50 });
  assert.deepEqual((res.body.items as { id: string }[]).map((s) => s.id), ["s2"]);
});
