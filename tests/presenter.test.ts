// Run: node --test tests/*.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isRealCompany, pickCompany, resolvePicks, resolveStep } from "../src/lib/demoPicks.js";
import { DEMO_PINS, DEMO_STEPS } from "../src/lib/demoScript.js";

const NOW = "2026-10-10T20:00:00Z";
const book = [
  { id: "seed-red", name: "Crestline Logistics LLC", website_domain: "crestlinelogistics.example", stage: "applicant", status: "red", last_refreshed: NOW },
  { id: "real-red-unchecked", name: "Acme Freight", website_domain: "acmefreight.com", stage: "applicant", status: "red", last_refreshed: null },
  { id: "real-red", name: "Gravie", website_domain: "gravie.com", stage: "applicant", status: "red", last_refreshed: NOW },
  { id: "real-yellow-applicant", name: "Rivian", website_domain: "rivian.com", stage: "applicant", status: "yellow", last_refreshed: NOW },
  { id: "seed-yellow", name: "Meridian Springs Manufacturing", website_domain: "meridiansprings.example", stage: "borrower", status: "yellow", last_refreshed: NOW },
];

describe("isRealCompany", () => {
  test(".example domains are placeholders", () => {
    assert.equal(isRealCompany({ website_domain: "northfieldpackaging.example" }), false);
    assert.equal(isRealCompany({ website_domain: "gravie.com" }), true);
    assert.equal(isRealCompany({ website_domain: "" }), false);
    assert.equal(isRealCompany(null), false);
  });
});

describe("pickCompany", () => {
  test("prefers a checked real company", () => {
    assert.equal(pickCompany(book, { stage: "applicant", status: "red" })?.id, "real-red");
  });

  test("falls back to a placeholder when no real company matches", () => {
    assert.equal(pickCompany(book, { stage: "borrower", status: "yellow" })?.id, "seed-yellow");
  });

  test("a checked placeholder beats an unchecked real company", () => {
    const list = book.filter((b) => b.id !== "real-red");
    assert.equal(pickCompany(list, { stage: "applicant", status: "red" })?.id, "seed-red");
  });

  test("stage and status must both match", () => {
    assert.equal(pickCompany(book, { stage: "borrower", status: "red" }), null);
  });

  test("a pinned name wins, ignoring case and spaces", () => {
    assert.equal(pickCompany(book, { stage: "applicant", status: "red", pinnedName: "  crestline logistics llc " })?.id, "seed-red");
  });

  test("an unknown pinned name falls back to the normal pick", () => {
    assert.equal(pickCompany(book, { stage: "applicant", status: "red", pinnedName: "Nope Inc" })?.id, "real-red");
  });

  test("empty or missing lists give null", () => {
    assert.equal(pickCompany([], { stage: "applicant", status: "red" }), null);
    assert.equal(pickCompany(undefined, { stage: "applicant", status: "red" }), null);
  });
});

describe("resolveStep", () => {
  const picks = resolvePicks(book, {});

  test("route and target functions get the picked companies", () => {
    const evidence = resolveStep(DEMO_STEPS.find((s) => s.id === "evidence"), picks);
    assert.equal(evidence.route, "/borrower/real-red");
    assert.equal(evidence.target, "evidence");
    assert.equal(evidence.missingCompany, false);

    const borrowers = resolveStep(DEMO_STEPS.find((s) => s.id === "borrowers"), picks);
    assert.equal(borrowers.route, "/");
    assert.equal(borrowers.press, "tab-borrowers");
    assert.equal(borrowers.target, "row-seed-yellow");
  });

  test("a step whose company is missing is flagged, not crashed", () => {
    const none = resolvePicks([], {});
    const status = resolveStep(DEMO_STEPS.find((s) => s.id === "status"), none);
    assert.equal(status.route, null);
    assert.equal(status.missingCompany, true);
    const borrowers = resolveStep(DEMO_STEPS.find((s) => s.id === "borrowers"), none);
    assert.equal(borrowers.target, "loanbook-table");
  });

  test("a caption can name the picked company", () => {
    const step = { id: "x", caption: ({ redApplicant }) => `${redApplicant.name} is Red.`, target: "t" };
    assert.equal(resolveStep(step, picks).caption, `${picks.redApplicant.name} is Red.`);
    const broken = { id: "y", caption: () => { throw new Error("boom"); }, target: "t" };
    assert.equal(resolveStep(broken, picks).caption, "");
  });

  test("a throwing route or target function resolves to null", () => {
    const step = { id: "x", caption: "c", route: () => { throw new Error("boom"); }, target: () => { throw new Error("boom"); } };
    const r = resolveStep(step, picks);
    assert.equal(r.route, null);
    assert.equal(r.target, null);
  });
});

describe("demoScript", () => {
  test("every step has an id, a caption and a target; ids are unique", () => {
    const ids = new Set();
    for (const s of DEMO_STEPS) {
      assert.ok(s.id && !ids.has(s.id), `duplicate or empty id ${s.id}`);
      ids.add(s.id);
      const caption = resolveStep(s, resolvePicks(book, {})).caption;
      assert.ok(typeof caption === "string" && caption.trim().length > 0, `${s.id} needs a caption`);
      assert.ok(resolveStep(s, resolvePicks([], {})).caption.trim().length > 0, `${s.id} needs a caption with no companies`);
      assert.ok(s.target, `${s.id} needs a target`);
    }
  });

  test("pins default to empty", () => {
    assert.equal(DEMO_PINS.redApplicant, "");
    assert.equal(DEMO_PINS.yellowBorrower, "");
  });
});
