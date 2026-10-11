import { test } from "node:test";
import assert from "node:assert/strict";
import { COOLDOWN_MS, cooldownLeft } from "../base44/functions/refreshBorrower/cooldown.ts";

const NOW = Date.parse("2026-10-10T12:00:00Z");

test("no prior checks have no cooldown", () => {
  assert.equal(cooldownLeft({}, NOW), 0);
});

test("counts down from a successful refresh", () => {
  assert.equal(cooldownLeft({ last_refreshed: new Date(NOW - 60_000).toISOString() }, NOW), 60_000);
});

test("uses the later of the last success and the last attempt", () => {
  assert.equal(
    cooldownLeft(
      {
        last_refreshed: new Date(NOW - 60 * 60_000).toISOString(),
        last_attempted: new Date(NOW - 30_000).toISOString(),
      },
      NOW,
    ),
    90_000,
  );
});

test("checks older than two minutes have no cooldown", () => {
  assert.equal(
    cooldownLeft(
      {
        last_refreshed: new Date(NOW - 3 * 60_000).toISOString(),
        last_attempted: new Date(NOW - 2 * 60_000 - 1).toISOString(),
      },
      NOW,
    ),
    0,
  );
});

test("ignores invalid timestamps", () => {
  assert.equal(cooldownLeft({ last_refreshed: "soon", last_attempted: "soon" }, NOW), 0);
});

test("clamps future timestamps to the cooldown duration", () => {
  assert.equal(cooldownLeft({ last_attempted: new Date(NOW + 5 * 60_000).toISOString() }, NOW), COOLDOWN_MS);
});
