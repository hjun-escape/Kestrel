// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHILD_ENTITIES,
  RESET_CHECK,
  changedFields,
  cleanFields,
  deleteCompany,
  updateCompany,
  type Db,
} from "../base44/functions/manageCompany/logic.ts";

const STORED = {
  id: "b1",
  name: "Gravie",
  website_domain: "gravie.com",
  hq_city: "Minneapolis",
  hq_state: "MN",
  industry: "Insurance",
  stage: "applicant",
  loan_amount_usd: 2000000,
  linkedin_url: "https://www.linkedin.com/company/gravie",
  glassdoor_url: "https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm",
  status: "yellow",
  why: "Yellow: Employee review mentions layoffs (Sep 1).",
  last_refreshed: "2026-10-10T20:00:00.000Z",
  owner_email: "a@x.com",
};

function fakeDb() {
  const calls: string[] = [];
  const entity = (name: string) => ({
    update: async (id: string, data: Record<string, unknown>) => (calls.push(`${name}.update ${id} ${JSON.stringify(data)}`), { ...STORED, ...data }),
    delete: async (id: string) => (calls.push(`${name}.delete ${id}`), {}),
    deleteMany: async (q: Record<string, unknown>) => (calls.push(`${name}.deleteMany ${JSON.stringify(q)}`), {}),
  });
  const db: Db = Object.fromEntries(["Borrower", ...CHILD_ENTITIES].map((n) => [n, entity(n)]));
  return { db, calls };
}

test("cleanFields trims, normalizes the domain, and ignores fields a user may not edit", () => {
  const r = cleanFields({ name: "  Gravie Inc ", website_domain: "https://www.Gravie.com/about", status: "red", owner_email: "x@y.com", why: "x" });
  assert.deepEqual(r, { patch: { name: "Gravie Inc", website_domain: "gravie.com" } });
});

test("cleanFields rejects what the add form rejects", () => {
  assert.deepEqual(cleanFields({ name: " " }), { error: "Enter the company name." });
  assert.deepEqual(cleanFields({ website_domain: "gravie" }), { error: "Enter a website domain such as harbortool.com." });
  assert.deepEqual(cleanFields({ loan_amount_usd: -5 }), { error: "Loan amount must be a positive number of dollars." });
  assert.deepEqual(cleanFields({ loan_amount_usd: "abc" }), { error: "Loan amount must be a positive number of dollars." });
  assert.deepEqual(cleanFields({ stage: "prospect" }), { error: "Stage must be applicant or borrower." });
  assert.deepEqual(cleanFields({ linkedin_url: "javascript:alert(1)" }), { error: "LinkedIn URL must start with https://" });
  assert.deepEqual(cleanFields({ glassdoor_url: "glassdoor.com/x" }), { error: "Glassdoor URL must start with https://" });
  assert.deepEqual(cleanFields(null), { error: "fields is required" });
  assert.deepEqual(cleanFields({ name: 42 }), { error: "name must be text" });
});

test("cleanFields: a cleared amount is null, cleared optional text is empty", () => {
  assert.deepEqual(cleanFields({ loan_amount_usd: "", glassdoor_url: "", industry: "" }), { patch: { loan_amount_usd: null, glassdoor_url: "", industry: "" } });
  assert.deepEqual(cleanFields({ loan_amount_usd: "2500000" }), { patch: { loan_amount_usd: 2500000 } });
});

test("changedFields keeps only real changes; missing stored values count as empty", () => {
  assert.deepEqual(changedFields(STORED, { name: "Gravie", hq_city: "St Paul" }), { hq_city: "St Paul" });
  assert.deepEqual(changedFields({ name: "A" }, { industry: "", loan_amount_usd: null }), {});
});

test("editing details that do not affect the checks keeps the evidence", async () => {
  const { db, calls } = fakeDb();
  const r = await updateCompany(db, STORED, { hq_city: "St Paul", loan_amount_usd: 3000000, stage: "borrower" });
  assert.equal(r.status, 200);
  assert.equal((r.body as { evidence_cleared: boolean }).evidence_cleared, false);
  assert.deepEqual(calls, [`Borrower.update b1 {"hq_city":"St Paul","stage":"borrower","loan_amount_usd":3000000}`]);
});

test("changing name, domain, LinkedIn or Glassdoor clears the evidence and goes back to Not checked", async () => {
  for (const fields of [
    { name: "Gravie Health" },
    { website_domain: "gravie.health" },
    { linkedin_url: "https://www.linkedin.com/company/gravie-health" },
    { glassdoor_url: "" },
  ]) {
    const { db, calls } = fakeDb();
    const r = await updateCompany(db, STORED, fields);
    assert.equal((r.body as { evidence_cleared: boolean }).evidence_cleared, true, JSON.stringify(fields));
    assert.deepEqual(calls, [
      'Signal.deleteMany {"borrower_id":"b1"}',
      `Borrower.update b1 ${JSON.stringify({ ...fields, ...RESET_CHECK })}`,
    ]);
  }
});

test("saving with no changes writes nothing", async () => {
  const { db, calls } = fakeDb();
  const r = await updateCompany(db, STORED, { name: "Gravie", website_domain: "gravie.com" });
  assert.equal(r.status, 200);
  assert.deepEqual(calls, []);
});

test("an invalid edit is a 400 and writes nothing", async () => {
  const { db, calls } = fakeDb();
  const r = await updateCompany(db, STORED, { website_domain: "nope" });
  assert.deepEqual(r, { status: 400, body: { error: "Enter a website domain such as harbortool.com." } });
  assert.deepEqual(calls, []);
});

test("delete removes every linked record, then the company", async () => {
  const { db, calls } = fakeDb();
  assert.deepEqual(await deleteCompany(db, "b1"), { status: 200, body: { deleted: "b1" } });
  assert.deepEqual(calls, [
    'Signal.deleteMany {"borrower_id":"b1"}',
    'Analysis.deleteMany {"borrower_id":"b1"}',
    'LenderCheck.deleteMany {"borrower_id":"b1"}',
    'Decision.deleteMany {"borrower_id":"b1"}',
    'CashflowReview.deleteMany {"borrower_id":"b1"}',
    "Borrower.delete b1",
  ]);
});

test("every entity with a borrower_id field is cleaned up on delete", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../base44/entities/", import.meta.url);
  const linked = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonc") && /"borrower_id"\s*:/.test(readFileSync(new URL(f, dir), "utf8")))
    .map((f) => f.replace(".jsonc", ""))
    .sort();
  assert.deepEqual([...CHILD_ENTITIES].sort(), linked);
});
