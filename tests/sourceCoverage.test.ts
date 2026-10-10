// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_RESUME_MAX,
  coverageText,
  joinList,
  pendingSources,
  shouldAutoResume,
  sourceCoverage,
} from "../src/lib/sourceCoverage.js";

const checked = (extra = {}) => ({ last_refreshed: "2026-10-10T22:00:00Z", sources_unavailable: [], ...extra });

test("pendingSources: only non-empty snapshot ids count, in display order", () => {
  assert.deepEqual(pendingSources({ pending_snapshots: { newsSignals: null, hiringSignal: null, reviewSignals: null } }), []);
  assert.deepEqual(pendingSources({ pending_snapshots: { reviewSignals: "sd_abc123" } }), ["Reviews"]);
  assert.deepEqual(pendingSources({ pending_snapshots: { reviewSignals: "sd_1", hiringSignal: "sd_2" } }), ["Jobs", "Reviews"]);
  assert.deepEqual(pendingSources({ pending_snapshots: { hiringSignal: "" } }), []);
  assert.deepEqual(pendingSources({}), []);
  assert.deepEqual(pendingSources(null), []);
});

test("shouldAutoResume: only after a successful run that left something collecting", () => {
  const collecting = checked({ pending_snapshots: { reviewSignals: "sd_abc123" }, sources_unavailable: ["Reviews"] });
  assert.equal(shouldAutoResume({ borrower: collecting, attempts: 0, lastResult: { ok: true } }), true);
  assert.equal(shouldAutoResume({ borrower: checked(), attempts: 0, lastResult: { ok: true } }), false, "nothing pending");
  assert.equal(shouldAutoResume({ borrower: collecting, attempts: 0, lastResult: { ok: false, error: "x" } }), false, "error stops it");
  assert.equal(shouldAutoResume({ borrower: collecting, attempts: 0, lastResult: undefined }), false);
  assert.equal(shouldAutoResume({ borrower: collecting, attempts: 0, lastResult: { ok: true }, stopped: true }), false, "Stop");
  assert.equal(shouldAutoResume({ borrower: collecting, attempts: AUTO_RESUME_MAX - 1, lastResult: { ok: true } }), true);
  assert.equal(shouldAutoResume({ borrower: collecting, attempts: AUTO_RESUME_MAX, lastResult: { ok: true } }), false, "cap");
  assert.equal(shouldAutoResume({ borrower: null, attempts: 0, lastResult: { ok: true } }), false);
});

test("joinList", () => {
  assert.equal(joinList([]), "");
  assert.equal(joinList(["Jobs"]), "Jobs");
  assert.equal(joinList(["Jobs", "Reviews"]), "Jobs and Reviews");
  assert.equal(joinList(["News", "Jobs", "Reviews"]), "News, Jobs and Reviews");
});

test("sourceCoverage and coverageText", () => {
  assert.equal(sourceCoverage({ last_refreshed: null }), null, "not checked");
  assert.equal(coverageText(sourceCoverage({ last_refreshed: null })), null);

  assert.equal(coverageText(sourceCoverage(checked())), null, "all four answered");

  assert.equal(
    coverageText(sourceCoverage(checked({ sources_unavailable: ["Jobs", "Reviews"] }))),
    "Checked 2 of 4 sources (Jobs and Reviews unavailable)",
  );
  assert.equal(
    coverageText(sourceCoverage(checked({ sources_unavailable: ["Reviews"] }))),
    "Checked 3 of 4 sources (Reviews unavailable)",
  );
  // A collecting source is also in sources_unavailable; it is reported as collecting, not unavailable.
  assert.equal(
    coverageText(sourceCoverage(checked({ sources_unavailable: ["Jobs", "Reviews"], pending_snapshots: { reviewSignals: "sd_abc123" } }))),
    "Checked 2 of 4 sources (Jobs unavailable; Reviews still collecting)",
  );
  assert.deepEqual(sourceCoverage(checked({ sources_unavailable: ["News", "Legal", "Jobs"] })), {
    checked: 1,
    total: 4,
    collecting: [],
    unavailable: ["News", "Legal", "Jobs"],
  });
});
