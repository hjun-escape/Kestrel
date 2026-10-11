import { test } from "node:test";
import assert from "node:assert/strict";
import { BANK_TIME_ZONE, todayIn } from "../base44/functions/refreshBorrower/today.ts";

const AFTER_FIVE_PM_PACIFIC = new Date("2026-10-11T01:30:00Z");

test("after 5 PM Pacific the bank's day is still the 10th while UTC is the 11th", () => {
  assert.equal(todayIn(BANK_TIME_ZONE, AFTER_FIVE_PM_PACIFIC), "2026-10-10");
  assert.equal(todayIn("UTC", AFTER_FIVE_PM_PACIFIC), "2026-10-11");
});
