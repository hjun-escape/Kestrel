// "Load demo companies": pure helpers for the loan book's demo loader (src/components/demo/).
// No React, no network, so they run under node --test.

import { isRealCompany } from "./demoPicks.js";

export const DEMO_LOAD_PARAM = "demo-load";
// Checks run two at a time: each one calls Bright Data and can take minutes.
export const CHECK_CONCURRENCY = 2;

/** Companies the loader should check: real ones never checked. A recent check is never repeated (cooldown). */
export function companiesToCheck(borrowers) {
  return (borrowers || []).filter((b) => b && isRealCompany(b) && !b.last_refreshed);
}

/** True when the book has at least one real (non-.example) company. */
export function hasRealCompanies(borrowers) {
  return (borrowers || []).some(isRealCompany);
}

/** True when the URL asks the loan book to start the demo load ("/?demo-load=1"). */
export function demoLoadRequested(search) {
  try {
    return new URLSearchParams(search || "").get(DEMO_LOAD_PARAM) === "1";
  } catch {
    return false;
  }
}

const ORDER = [
  ["red", "Red"],
  ["yellow", "Yellow"],
  ["green", "Green"],
];

/** "6 companies checked: 2 Red, 2 Yellow, 2 Green." plus how many could not be checked. */
export function summarizeChecks(results) {
  const done = (results || []).filter((r) => r.state === "done");
  const failed = (results || []).length - done.length;
  if (done.length === 0 && failed === 0) return "No companies needed a check.";
  if (done.length === 0) return `${failed} ${failed === 1 ? "company" : "companies"} could not be checked.`;
  const parts = ORDER.map(([key, label]) => [done.filter((r) => r.status === key).length, label])
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);
  const head = `${done.length} ${done.length === 1 ? "company" : "companies"} checked`;
  const main = parts.length ? `${head}: ${parts.join(", ")}.` : `${head}.`;
  return failed > 0 ? `${main} ${failed} could not be checked.` : main;
}

/** Runs worker(item) for every item, at most `limit` at a time. Stops starting new items once isCancelled(). */
export async function runPool(items, limit, worker, isCancelled = () => false) {
  const queue = [...(items || [])];
  async function lane() {
    while (queue.length > 0 && !isCancelled()) {
      await worker(queue.shift());
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, lane));
}
