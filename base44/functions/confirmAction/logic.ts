// confirmAction logic. Pure: no npm:, no Deno. entry.ts injects the SDK.
//
// Runs a pending action from Ask Kestrel after the user confirms it.
// The action comes from the browser, so it is re-validated here from scratch:
// only 'screen', 'refresh' and 'deep_check' are allowed, and only whitelisted
// fields are passed on. Nothing here ever sets status on an existing company.
// This file intentionally does not import from askPortfolio, so each function
// deploys on its own; tests check that every action askPortfolio proposes is
// accepted here.
//
// Ownership (access.ts): a screened company is owned by the signed-in caller
// (deps.caller, from auth.me() on the server, never from the action), and
// refresh / deep_check only run on companies the caller may access.

import { canAccessCompany, ownerEmailFor } from './access.ts';
import type { Caller } from './access.ts';

export type ActionKind = 'screen' | 'refresh' | 'deep_check';

export interface ValidAction {
  kind: ActionKind;
  params: Record<string, string | number>;
}

export type Validation = { ok: true; action: ValidAction } | { ok: false; error: string };

export interface ConfirmDeps {
  // The signed-in user (from auth.me() in entry.ts); null or missing = shared only.
  caller?: Caller | null;
  createBorrower(data: Record<string, unknown>): Promise<{ id: string } & Record<string, unknown>>;
  getBorrower(id: string): Promise<({ id: string; name?: string } & Record<string, unknown>) | null>;
  // Invokes a backend function and returns its JSON body; throws on non-2xx
  // (with error.response.status / error.response.data like the SDK does).
  invoke(name: string, payload: Record<string, unknown>): Promise<unknown>;
}

export interface ConfirmResult {
  status: number;
  body: Record<string, unknown>;
}

const MAX_NAME = 200;
const MAX_SHORT_FIELD = 100;
const MAX_QUESTION = 500;
const MIN_QUESTION = 3;
const MAX_LOAN_USD = 1e12;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ANALYST_FUNCTION = 'analyzeBorrower';
const REFRESH_FUNCTION = 'refreshBorrower';

function fail(error: string): Validation {
  return { ok: false, error };
}

function text(v: unknown, max: number, min = 1): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

function domain(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = v.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
  return DOMAIN_PATTERN.test(d) ? d : null;
}

function validateScreen(p: Record<string, unknown>): Validation {
  const name = text(p.name, MAX_NAME);
  if (!name) return fail('name is required');
  const website_domain = domain(p.website_domain);
  if (!website_domain) return fail('website_domain must be a domain such as example.com');
  const params: Record<string, string | number> = { name, website_domain };
  for (const key of ['hq_city', 'hq_state', 'industry']) {
    if (p[key] === undefined || p[key] === null || p[key] === '') continue;
    const value = text(p[key], MAX_SHORT_FIELD);
    if (!value) return fail(`${key} must be text up to ${MAX_SHORT_FIELD} characters`);
    params[key] = value;
  }
  if (p.loan_amount_usd !== undefined && p.loan_amount_usd !== null && p.loan_amount_usd !== '') {
    const loan = Number(p.loan_amount_usd);
    if (!Number.isFinite(loan) || loan < 0 || loan > MAX_LOAN_USD) return fail('loan_amount_usd must be a positive number');
    params.loan_amount_usd = loan;
  }
  return { ok: true, action: { kind: 'screen', params } };
}

function validateId(p: Record<string, unknown>): string | null {
  return typeof p.id === 'string' && ID_PATTERN.test(p.id) ? p.id : null;
}

export function validateAction(raw: unknown): Validation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('action must be an object');
  const a = raw as { kind?: unknown; params?: unknown };
  const p = a.params && typeof a.params === 'object' && !Array.isArray(a.params)
    ? (a.params as Record<string, unknown>)
    : null;
  if (!p) return fail('action.params must be an object');
  switch (a.kind) {
    case 'screen':
      return validateScreen(p);
    case 'refresh': {
      const id = validateId(p);
      return id ? { ok: true, action: { kind: 'refresh', params: { id } } } : fail('a valid company id is required');
    }
    case 'deep_check': {
      const id = validateId(p);
      if (!id) return fail('a valid company id is required');
      const question = text(p.question, MAX_QUESTION, MIN_QUESTION);
      if (!question) return fail(`question must be ${MIN_QUESTION}-${MAX_QUESTION} characters`);
      return { ok: true, action: { kind: 'deep_check', params: { id, question } } };
    }
    default:
      return fail('only screen, refresh and deep_check actions are allowed');
  }
}

function errorStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: number }; status?: number } | null;
  return e?.response?.status ?? e?.status;
}

function errorMessage(error: unknown): string {
  const e = error as { response?: { data?: { error?: unknown } }; message?: string } | null;
  const fromBody = e?.response?.data?.error;
  return typeof fromBody === 'string' && fromBody ? fromBody : e?.message || 'request failed';
}

function upstreamFailure(error: unknown): ConfirmResult {
  const status = errorStatus(error);
  const code = status && status >= 400 && status < 600 ? status : 502;
  return { status: code, body: { error: errorMessage(error) } };
}

async function screen(params: Record<string, string | number>, deps: ConfirmDeps): Promise<ConfirmResult> {
  const owner = ownerEmailFor(deps.caller);
  const borrower = await deps.createBorrower({
    ...params,
    ...(owner ? { owner_email: owner } : {}),
    stage: 'applicant',
    status: 'green',
    why: '',
    sources_unavailable: [],
  });
  try {
    const result = await deps.invoke(REFRESH_FUNCTION, { borrower_id: borrower.id });
    return { status: 200, body: { ok: true, kind: 'screen', borrower, refresh: { ok: true, result } } };
  } catch (error) {
    // The company was created; report the failed first check rather than hide it.
    return {
      status: 200,
      body: { ok: true, kind: 'screen', borrower, refresh: { ok: false, error: errorMessage(error) } },
    };
  }
}

export async function executeAction(raw: unknown, deps: ConfirmDeps): Promise<ConfirmResult> {
  const validation = validateAction(raw);
  if (!validation.ok) return { status: 400, body: { error: validation.error } };
  const { kind, params } = validation.action;

  if (kind === 'screen') return screen(params, deps);

  const id = params.id as string;
  const borrower = await deps.getBorrower(id);
  if (!borrower) return { status: 404, body: { error: `company ${id} not found` } };
  if (!canAccessCompany(borrower, deps.caller)) {
    return { status: 403, body: { error: 'You do not have access to this company.' } };
  }

  if (kind === 'refresh') {
    try {
      const result = await deps.invoke(REFRESH_FUNCTION, { borrower_id: id });
      return { status: 200, body: { ok: true, kind, result } };
    } catch (error) {
      return upstreamFailure(error);
    }
  }

  try {
    const result = await deps.invoke(ANALYST_FUNCTION, { borrower_id: id, question: params.question });
    return { status: 200, body: { ok: true, kind, result } };
  } catch (error) {
    if (errorStatus(error) === 404) return { status: 501, body: { error: 'analyst not deployed yet' } };
    return upstreamFailure(error);
  }
}
