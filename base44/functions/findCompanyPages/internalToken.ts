// Shared secret between refreshBorrower and the functions it calls on the caller's behalf. Those functions spend
// Bright Data and LLM credits and have no cooldown of their own, so a direct call from a client is refused.
// Base44 bundles each function folder on its own, so this file is copied; tests/internalToken.test.ts checks the copies.
export const INTERNAL_TOKEN_ENV = 'INTERNAL_FUNCTION_TOKEN';
export const MIN_TOKEN_LENGTH = 16;

export type TokenCheck = { ok: true } | { ok: false; status: number; error: string };

function sameString(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Accepts a body whose internal_token equals the configured secret. An unset or short secret fails closed. */
export function checkInternalToken(body: unknown, expected: string | undefined): TokenCheck {
  const secret = (expected ?? '').trim();
  if (secret.length < MIN_TOKEN_LENGTH) return { ok: false, status: 503, error: `${INTERNAL_TOKEN_ENV} secret is not set` };
  const given = (body as { internal_token?: unknown } | null)?.internal_token;
  if (typeof given !== 'string' || !sameString(given, secret)) return { ok: false, status: 401, error: 'This function is called by refreshBorrower only.' };
  return { ok: true };
}
