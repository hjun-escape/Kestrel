// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_FLAG_KEY, decideWelcomeGate, hasChosenDemo, rememberDemoChoice } from "../src/components/landing/gate.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = String(v);
    },
    data,
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

const base = { hasToken: false, isAuthenticated: false, isLoadingAuth: false, demoChosen: false };

test("signed-out visitor without the demo flag is redirected to /welcome", () => {
  assert.equal(decideWelcomeGate(base), "redirect");
});

test("redirects immediately when there is no session token, even while auth is still loading", () => {
  assert.equal(decideWelcomeGate({ ...base, isLoadingAuth: true }), "redirect");
});

test("visitor who chose Explore the demo stays on the loan book", () => {
  assert.equal(decideWelcomeGate({ ...base, demoChosen: true }), "stay");
});

test("signed-in user is never redirected", () => {
  assert.equal(decideWelcomeGate({ ...base, hasToken: true, isAuthenticated: true }), "stay");
});

test("waits while a session token is being checked", () => {
  assert.equal(decideWelcomeGate({ ...base, hasToken: true, isLoadingAuth: true }), "wait");
});

test("a token that fails to resolve to a user counts as signed out", () => {
  assert.equal(decideWelcomeGate({ ...base, hasToken: true, isLoadingAuth: false }), "redirect");
});

test("demo flag round-trips through storage", () => {
  const s = memoryStorage();
  assert.equal(hasChosenDemo(s), false);
  assert.equal(rememberDemoChoice(s), true);
  assert.equal(s.data[DEMO_FLAG_KEY], "1");
  assert.equal(hasChosenDemo(s), true);
});

test("storage that throws is treated as no flag, and writes fail softly", () => {
  assert.equal(hasChosenDemo(throwingStorage), false);
  assert.equal(rememberDemoChoice(throwingStorage), false);
});

test("missing storage is treated as no flag", () => {
  assert.equal(hasChosenDemo(undefined), false);
  assert.equal(rememberDemoChoice(null), false);
});

test("chooseDemo is remembered for the session even when storage throws", async () => {
  const { chooseDemo, demoChosen } = await import("../src/components/landing/gate.js");
  assert.equal(chooseDemo(throwingStorage), false);
  assert.equal(demoChosen(throwingStorage), true);
});
