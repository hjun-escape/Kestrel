// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDecision, recordDecision, type Db } from "../base44/functions/recordDecision/logic.ts";

const NOW = "2026-10-10T12:00:00.000Z";
const USER = { email: "a@x.com" };
const BORROWER = { id: "b1" };

function fakeDb() {
  const created: Record<string, unknown>[] = [];
  const db: Db = { Decision: { create: async (d) => (created.push(d), { id: "d1", ...d }) } };
  return { db, created };
}

test("decision must be one of the four values", async () => {
  const { db } = fakeDb();
  assert.equal((await recordDecision(db, BORROWER, USER, { decision: "approve" }, NOW)).status, 400);
  assert.equal((await recordDecision(db, BORROWER, USER, {}, NOW)).status, 400);
  for (const decision of ["request_documents", "proceed", "watchlist", "decline"]) {
    assert.equal((await recordDecision(db, BORROWER, USER, { decision }, NOW)).status, 200);
  }
});

test("note is trimmed and capped at 2000 characters", async () => {
  const { db, created } = fakeDb();
  const res = await recordDecision(db, BORROWER, USER, { decision: "proceed", note: "  looks fine  " }, NOW);
  assert.equal(created[0].note, "looks fine");
  assert.equal(res.status, 200);
  const long = await recordDecision(db, BORROWER, USER, { decision: "proceed", note: "x".repeat(2001) }, NOW);
  assert.equal(long.status, 400);
});

test("follow_up_date must be a real YYYY-MM-DD date, omitted when empty", async () => {
  const { db, created } = fakeDb();
  assert.equal((await recordDecision(db, BORROWER, USER, { decision: "proceed", follow_up_date: "10/10/2026" }, NOW)).status, 400);
  assert.equal((await recordDecision(db, BORROWER, USER, { decision: "proceed", follow_up_date: "2026-02-30" }, NOW)).status, 400);
  assert.equal((await recordDecision(db, BORROWER, USER, { decision: "proceed", follow_up_date: "2026-11-01" }, NOW)).status, 200);
  assert.equal(created[0].follow_up_date, "2026-11-01");
  await recordDecision(db, BORROWER, USER, { decision: "proceed" }, NOW);
  assert.equal("follow_up_date" in created[1], false);
});

test("documents_requested is kept only for request_documents, fields cleaned", async () => {
  const { db, created } = fakeDb();
  await recordDecision(db, BORROWER, USER, {
    decision: "decline",
    documents_requested: [{ item: "x" }],
  }, NOW);
  assert.deepEqual(created[0].documents_requested, []);
  await recordDecision(db, BORROWER, USER, {
    decision: "request_documents",
    documents_requested: [{ item: "Bank statements", reason: "check cash flow", source_url: "https://x.com/a", extra: "dropped" }],
  }, NOW);
  assert.deepEqual(created[1].documents_requested, [{ item: "Bank statements", reason: "check cash flow", source_url: "https://x.com/a" }]);
});

test("decided_by is the caller, created_at is the clock; client fields are ignored", async () => {
  const { db, created } = fakeDb();
  await recordDecision(db, BORROWER, USER, { decision: "watchlist", decided_by: "evil@x.com", created_at: "1999-01-01", id: "spoof" }, NOW);
  assert.equal(created[0].decided_by, "a@x.com");
  assert.equal(created[0].created_at, NOW);
  assert.equal(created[0].borrower_id, "b1");
});

test("cleanDecision rejects non-string note and oversized document lists", () => {
  assert.equal("error" in cleanDecision({ decision: "proceed", note: 42 }), true);
  assert.equal("error" in cleanDecision({ decision: "request_documents", documents_requested: Array(51).fill({ item: "x" }) }), true);
});

test("a non-http source_url on a document is dropped; item and reason stay", async () => {
  const { db, created } = fakeDb();
  await recordDecision(db, BORROWER, USER, {
    decision: "request_documents",
    documents_requested: [
      { item: "Bank statements", reason: "cash flow", source_url: "javascript:alert(1)" },
      { item: "UCC filing", reason: "liens", source_url: "https://x.com/u" },
      { item: "No link", reason: "r", source_url: "not a url" },
    ],
  }, NOW);
  const docs = created[0].documents_requested as Record<string, unknown>[];
  assert.deepEqual(docs[0], { item: "Bank statements", reason: "cash flow" });
  assert.deepEqual(docs[1], { item: "UCC filing", reason: "liens", source_url: "https://x.com/u" });
  assert.deepEqual(docs[2], { item: "No link", reason: "r" });
});
