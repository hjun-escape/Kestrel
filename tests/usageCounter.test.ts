// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { takeUsage, DAILY_LIMIT, type UsageDb } from "../base44/functions/suggestCompany/usage.ts";

function fakeDb(rows: { id: string; key: string; day: string; count: number }[] = []) {
  const writes: string[] = [];
  let seq = 0;
  const db: UsageDb = {
    UsageCounter: {
      filter: async (q) => ({ items: rows.filter((r) => r.key === q.key && r.day === q.day).slice(0, 1) }),
      create: async (d) => { writes.push("create"); rows.push({ id: `u${++seq}`, ...(d as (typeof rows)[0]) }); return d; },
      update: async (id, d) => { writes.push("update"); const r = rows.find((x) => x.id === id)!; r.count = d.count as number; return r; },
    },
  };
  return { db, rows, writes };
}

test("first call of the day creates the counter at 1", async () => {
  const { db, rows } = fakeDb();
  const res = await takeUsage(db, "suggestCompany", "2026-10-10");
  assert.deepEqual(res, { allowed: true, count: 1 });
  assert.deepEqual(rows[0], { id: "u1", key: "suggestCompany", day: "2026-10-10", count: 1 });
});

test("calls under the limit increment", async () => {
  const { db, rows } = fakeDb([{ id: "u1", key: "suggestCompany", day: "2026-10-10", count: 3 }]);
  const res = await takeUsage(db, "suggestCompany", "2026-10-10");
  assert.deepEqual(res, { allowed: true, count: 4 });
  assert.equal(rows[0].count, 4);
});

test("at the limit the call is refused without writing", async () => {
  const { db, rows, writes } = fakeDb([{ id: "u1", key: "suggestCompany", day: "2026-10-10", count: DAILY_LIMIT }]);
  const res = await takeUsage(db, "suggestCompany", "2026-10-10");
  assert.equal(res.allowed, false);
  assert.equal(res.count, DAILY_LIMIT);
  assert.equal(rows[0].count, DAILY_LIMIT);
  assert.deepEqual(writes, []);
});

test("a new day starts at 1", async () => {
  const { db, rows } = fakeDb([{ id: "u1", key: "suggestCompany", day: "2026-10-10", count: DAILY_LIMIT }]);
  const res = await takeUsage(db, "suggestCompany", "2026-10-11");
  assert.deepEqual(res, { allowed: true, count: 1 });
  assert.equal(rows.length, 2);
});
