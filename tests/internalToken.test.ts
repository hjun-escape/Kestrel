// Run: node --test tests/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkInternalToken, INTERNAL_TOKEN_ENV } from "../base44/functions/refreshBorrower/internalToken.ts";

const FOLDERS = ["refreshBorrower", "hiringSignal", "newsSignals", "reviewSignals", "tagItem", "findCompanyPages"];

const SECRET = "test-internal-token-0123456789";

test("every copy of internalToken.ts is identical", () => {
  const read = (folder: string) =>
    readFileSync(new URL(`../base44/functions/${folder}/internalToken.ts`, import.meta.url), "utf8");
  const first = read(FOLDERS[0]);
  for (const folder of FOLDERS.slice(1)) assert.equal(read(folder), first, `${folder}/internalToken.ts differs`);
});

test("unset or short secret fails closed with 503", () => {
  assert.equal((checkInternalToken({ internal_token: "x" }, undefined) as { status: number }).status, 503);
  assert.equal((checkInternalToken({ internal_token: SECRET }, "") as { status: number }).status, 503);
  assert.equal((checkInternalToken({ internal_token: SECRET }, "short") as { status: number }).status, 503);
});

test("missing or wrong token is 401", () => {
  assert.equal((checkInternalToken({}, SECRET) as { status: number }).status, 401);
  assert.equal((checkInternalToken({ internal_token: "wrong-token-abcdefghij" }, SECRET) as { status: number }).status, 401);
  assert.equal((checkInternalToken({ internal_token: 42 }, SECRET) as { status: number }).status, 401);
  assert.equal((checkInternalToken(null, SECRET) as { status: number }).status, 401);
});

test("the matching token passes; different-length strings do not", () => {
  assert.deepEqual(checkInternalToken({ internal_token: SECRET }, SECRET), { ok: true });
  assert.equal(checkInternalToken({ internal_token: `${SECRET}x` }, SECRET).ok, false);
  assert.equal(checkInternalToken({ internal_token: SECRET.slice(0, -1) }, SECRET).ok, false);
});
