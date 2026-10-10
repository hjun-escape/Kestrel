// Run: node --test "tests/**/*.test.ts"
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEMO_COMPANIES } from "../base44/functions/loadDemo/demoCompanies.ts";
import { DEMO_COMPANIES as CLIENT_COMPANIES } from "../src/lib/demoCompanies.js";
import {
  RATE_LIMIT_MS,
  isPlaceholder,
  isRateLimited,
  loadDemo,
  planDemoLoad,
  CHILD_ENTITIES as DEMO_CHILD_ENTITIES,
  type DemoDb,
} from "../base44/functions/loadDemo/logic.ts";
import { CHILD_ENTITIES } from "../base44/functions/manageCompany/logic.ts";

const NOW = Date.parse("2026-10-10T20:00:00Z");

type Row = Record<string, unknown> & { id: string };

function fakeDb(seed: { Borrower?: Row[]; DemoRun?: Row[]; Signal?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    Borrower: [...(seed.Borrower ?? [])],
    DemoRun: [...(seed.DemoRun ?? [])],
    Signal: [...(seed.Signal ?? [])],
  };
  const calls: string[] = [];
  let n = 0;
  const matches = (row: Row, q: Record<string, unknown>) => Object.entries(q).every(([k, v]) => row[k] === v);
  const entity = (name: string) => ({
    filter: async (q: Record<string, unknown>) => (tables[name] ?? []).filter((r) => matches(r, q)),
    create: async (data: Record<string, unknown>) => {
      const row = { ...data, id: `${name}-${++n}` };
      tables[name] = [...(tables[name] ?? []), row];
      calls.push(`${name}.create ${String(data.website_domain ?? data.scope ?? "")}`);
      return row;
    },
    update: async (id: string, data: Record<string, unknown>) => {
      tables[name] = (tables[name] ?? []).map((r) => (r.id === id ? { ...r, ...data } : r));
      calls.push(`${name}.update ${id}`);
      return tables[name].find((r) => r.id === id);
    },
    delete: async (id: string) => {
      tables[name] = (tables[name] ?? []).filter((r) => r.id !== id);
      calls.push(`${name}.delete ${id}`);
    },
    deleteMany: async (q: Record<string, unknown>) => {
      tables[name] = (tables[name] ?? []).filter((r) => !matches(r, q));
      calls.push(`${name}.deleteMany ${JSON.stringify(q)}`);
    },
  });
  const db = Object.fromEntries(["Borrower", "DemoRun", ...CHILD_ENTITIES].map((e) => [e, entity(e)])) as unknown as DemoDb;
  return { db, tables, calls };
}

describe("demo company list", () => {
  test("includes the six agreed real companies with their details", () => {
    const byDomain = Object.fromEntries(DEMO_COMPANIES.map((c) => [c.website_domain, c]));
    assert.deepEqual(
      DEMO_COMPANIES.map((c) => [c.name, c.website_domain, c.hq_city, c.hq_state, c.industry, c.stage, c.loan_amount_usd]),
      [
        ["Amy's Kitchen", "amys.com", "Petaluma", "CA", "Frozen food manufacturing", "applicant", 18000000],
        ["Essendant", "essendant.com", "Deerfield", "IL", "Office products distribution", "applicant", 35000000],
        ["Ruiz Foods", "ruizfoods.com", "Dinuba", "CA", "Frozen food manufacturing", "applicant", 12000000],
        ["Stone Brewing", "stonebrewing.com", "Escondido", "CA", "Craft brewing", "borrower", 8000000],
        ["Bob's Red Mill", "bobsredmill.com", "Milwaukie", "OR", "Food manufacturing", "applicant", 6000000],
        ["Rivian", "rivian.com", "Irvine", "CA", "Electric vehicles", "borrower", 25000000],
      ],
    );
    assert.ok(byDomain["amys.com"]);
  });

  test("no company uses a placeholder .example domain", () => {
    for (const c of DEMO_COMPANIES) assert.equal(isPlaceholder(c), false, c.website_domain);
  });

  test("the client copy matches the backend copy", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(CLIENT_COMPANIES)), JSON.parse(JSON.stringify(DEMO_COMPANIES)));
  });

  test("the DemoRun entity has no borrower_id, so company deletes need not clean it up", () => {
    const text = readFileSync(new URL("../base44/entities/DemoRun.jsonc", import.meta.url), "utf8");
    assert.doesNotMatch(text, /"borrower_id"\s*:/);
  });
});

test("purge cleans up the same child records as a company delete", () => {
  assert.deepEqual([...DEMO_CHILD_ENTITIES], [...CHILD_ENTITIES]);
});

describe("isRateLimited", () => {
  test("refuses a second run within 30 s of the last one", () => {
    assert.equal(RATE_LIMIT_MS, 30_000);
    assert.equal(isRateLimited(new Date(NOW - 5_000).toISOString(), NOW), true);
    assert.equal(isRateLimited(new Date(NOW - 31_000).toISOString(), NOW), false);
  });
  test("allows a first run and ignores unreadable timestamps", () => {
    assert.equal(isRateLimited(undefined, NOW), false);
    assert.equal(isRateLimited("not a date", NOW), false);
  });
});

describe("planDemoLoad", () => {
  test("shared book: matches unowned rows by normalized domain and creates the rest", () => {
    const existing = [
      { id: "a", website_domain: "WWW.Amys.com", owner_email: "" },
      { id: "e", website_domain: "essendant.com", owner_email: "x@y.com" }, // someone's own copy, not the shared book
    ];
    const plan = planDemoLoad(existing, DEMO_COMPANIES, undefined);
    assert.equal(plan.find((p) => p.company.website_domain === "amys.com")?.existingId, "a");
    assert.equal(plan.find((p) => p.company.website_domain === "essendant.com")?.existingId, undefined);
    assert.equal(plan.length, DEMO_COMPANIES.length);
  });

  test("signed in: matches only the caller's own rows, case-insensitively", () => {
    const existing = [
      { id: "mine", website_domain: "rivian.com", owner_email: "Me@Bank.com" },
      { id: "shared", website_domain: "amys.com" },
    ];
    const plan = planDemoLoad(existing, DEMO_COMPANIES, "me@bank.com");
    assert.equal(plan.find((p) => p.company.website_domain === "rivian.com")?.existingId, "mine");
    assert.equal(plan.find((p) => p.company.website_domain === "amys.com")?.existingId, undefined);
  });
});

describe("loadDemo", () => {
  test("signed out: creates every demo company in the shared book, unowned and Not checked", async () => {
    const { db, tables } = fakeDb();
    const r = await loadDemo(db, { now: NOW });
    assert.equal(r.status, 200);
    const body = r.body as { companies: { id: string; name: string; created: boolean }[] };
    assert.equal(body.companies.length, DEMO_COMPANIES.length);
    assert.ok(body.companies.every((c) => c.created && c.id));
    assert.equal(tables.Borrower.length, DEMO_COMPANIES.length);
    for (const b of tables.Borrower) {
      assert.equal("owner_email" in b, false);
      assert.equal(b.status, "green");
      assert.equal(b.last_refreshed, undefined);
    }
  });

  test("is idempotent: a second run (after the rate limit) creates nothing", async () => {
    const { db, tables } = fakeDb();
    await loadDemo(db, { now: NOW });
    const r = await loadDemo(db, { now: NOW + RATE_LIMIT_MS + 1 });
    assert.equal(r.status, 200);
    const body = r.body as { companies: { created: boolean }[] };
    assert.ok(body.companies.every((c) => c.created === false));
    assert.equal(tables.Borrower.length, DEMO_COMPANIES.length);
  });

  test("refuses a second run within 30 s with 429 and writes nothing", async () => {
    const { db, tables } = fakeDb({ DemoRun: [{ id: "r1", scope: "shared", ran_at: new Date(NOW - 10_000).toISOString() }] });
    const r = await loadDemo(db, { now: NOW });
    assert.equal(r.status, 429);
    assert.equal(tables.Borrower.length, 0);
  });

  test("the rate limit is per book: a signed-in user is not blocked by a shared run", async () => {
    const { db } = fakeDb({ DemoRun: [{ id: "r1", scope: "shared", ran_at: new Date(NOW - 10_000).toISOString() }] });
    const r = await loadDemo(db, { now: NOW, ownerEmail: "me@bank.com" });
    assert.equal(r.status, 200);
  });

  test("signed in: creates copies owned by the caller, leaving the shared book alone", async () => {
    const shared = DEMO_COMPANIES.map((c, i) => ({ ...c, id: `s${i}`, status: "green" }));
    const { db, tables } = fakeDb({ Borrower: shared });
    const r = await loadDemo(db, { now: NOW, ownerEmail: "Me@Bank.com " });
    assert.equal(r.status, 200);
    const mine = tables.Borrower.filter((b) => b.owner_email === "me@bank.com");
    assert.equal(mine.length, DEMO_COMPANIES.length);
    assert.equal(tables.Borrower.length, DEMO_COMPANIES.length * 2);
  });

  test("purge_placeholders deletes shared .example companies and their records, not real or owned ones", async () => {
    const { db, tables, calls } = fakeDb({
      Borrower: [
        { id: "p1", website_domain: "crestlinelogistics.example" },
        { id: "p2", website_domain: "mine.example", owner_email: "me@bank.com" },
        { id: "r1", website_domain: "gravie.com" },
      ],
      Signal: [
        { id: "s1", borrower_id: "p1" },
        { id: "s2", borrower_id: "r1" },
      ],
    });
    const r = await loadDemo(db, { now: NOW, purgePlaceholders: true });
    assert.equal(r.status, 200);
    assert.deepEqual(tables.Borrower.filter((b) => !DEMO_COMPANIES.some((c) => c.website_domain === b.website_domain)).map((b) => b.id), ["p2", "r1"]);
    assert.deepEqual(tables.Signal.map((s) => s.id), ["s2"]);
    for (const e of CHILD_ENTITIES) assert.ok(calls.includes(`${e}.deleteMany {"borrower_id":"p1"}`), e);
    assert.equal((r.body as { purged: number }).purged, 1);
  });

  test("purge_placeholders is ignored for a signed-in caller", async () => {
    const { db, tables } = fakeDb({ Borrower: [{ id: "p1", website_domain: "crestlinelogistics.example" }] });
    await loadDemo(db, { now: NOW, ownerEmail: "me@bank.com", purgePlaceholders: true });
    assert.ok(tables.Borrower.some((b) => b.id === "p1"));
  });

  test("records the run time so the next call within 30 s is refused", async () => {
    const { db, tables } = fakeDb();
    await loadDemo(db, { now: NOW });
    assert.equal(tables.DemoRun.length, 1);
    assert.equal(tables.DemoRun[0].scope, "shared");
    assert.equal((await loadDemo(db, { now: NOW + 1000 })).status, 429);
    await loadDemo(db, { now: NOW + RATE_LIMIT_MS + 1 });
    assert.equal(tables.DemoRun.length, 1, "updates the one record instead of adding rows");
  });

  test("accepts a data layer whose filter returns { items }", async () => {
    const { db } = fakeDb();
    const wrapped = { ...db, Borrower: { ...db.Borrower, filter: async (q: Record<string, unknown>) => ({ items: await (db.Borrower.filter as (q: unknown) => Promise<unknown[]>)(q) }) } } as DemoDb;
    const r = await loadDemo(wrapped, { now: NOW });
    assert.equal(r.status, 200);
  });
});
