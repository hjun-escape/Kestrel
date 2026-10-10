// Run: node --test "tests/**/*.test.ts"
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { companiesToCheck, demoLoadRequested, hasRealCompanies, runPool, summarizeChecks } from "../src/lib/demoLoad.js";

describe("companiesToCheck", () => {
  test("only companies never checked, skipping placeholders", () => {
    const list = [
      { id: "a", website_domain: "amys.com", last_refreshed: null },
      { id: "b", website_domain: "rivian.com", last_refreshed: "2026-10-10T19:59:00Z" },
      { id: "c", website_domain: "crest.example", last_refreshed: null },
      { id: "d", website_domain: "ruizfoods.com" },
    ];
    assert.deepEqual(companiesToCheck(list).map((b) => b.id), ["a", "d"]);
  });
});

describe("hasRealCompanies / demoLoadRequested", () => {
  test("placeholders only or empty means no real companies", () => {
    assert.equal(hasRealCompanies([]), false);
    assert.equal(hasRealCompanies([{ website_domain: "x.example" }]), false);
    assert.equal(hasRealCompanies([{ website_domain: "x.example" }, { website_domain: "amys.com" }]), true);
  });
  test("reads the demo-load query flag", () => {
    assert.equal(demoLoadRequested("?demo-load=1"), true);
    assert.equal(demoLoadRequested("?x=1&demo-load=1"), true);
    assert.equal(demoLoadRequested("?demo-load=0"), false);
    assert.equal(demoLoadRequested(""), false);
  });
});

describe("summarizeChecks", () => {
  test("counts statuses in Red, Yellow, Green order and notes unavailable ones", () => {
    const results = [
      { state: "done", status: "red" },
      { state: "done", status: "green" },
      { state: "done", status: "red" },
      { state: "done", status: "yellow" },
      { state: "unavailable" },
    ];
    assert.equal(summarizeChecks(results), "4 companies checked: 2 Red, 1 Yellow, 1 Green. 1 could not be checked.");
  });
  test("singular and empty", () => {
    assert.equal(summarizeChecks([{ state: "done", status: "green" }]), "1 company checked: 1 Green.");
    assert.equal(summarizeChecks([]), "No companies needed a check.");
    assert.equal(summarizeChecks([{ state: "unavailable" }]), "1 company could not be checked.");
  });
});

describe("runPool", () => {
  test("runs at most `limit` workers at once and processes every item", async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(n);
      active--;
    });
    assert.equal(peak, 2);
    assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5]);
  });
  test("stops starting new items once cancelled", async () => {
    let cancelled = false;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4], 1, async (n: number) => {
      seen.push(n);
      if (n === 2) cancelled = true;
    }, () => cancelled);
    assert.deepEqual(seen, [1, 2]);
  });
});
