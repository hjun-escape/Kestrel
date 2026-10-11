// readData logic: the entities are closed to clients (rls all false), so every screen read goes
// through readData. Pure: the data layer is passed in, so tests run in Node. The per-user rule is
// access.ts's canAccessCompany: signed-in callers see only their own companies, signed-out callers
// only the unowned shared demo book.
//
// Two shapes: { entity, id } reads one record; { entity, query?, sort?, limit? } lists. Denied
// reads answer 404, like Base44's own row rules, so a client cannot tell "another user's" from
// "does not exist".

import { canAccessCompany, type Caller } from './access.ts';

// The entities this function serves. Borrower lists are scoped by owner_email; everything else is
// reached only through an accessible company (query.borrower_id, the only allowed key).
export const ENTITIES = {
  Borrower: { kind: 'company', queryKeys: ['stage', 'website_domain'] },
  Signal: { kind: 'child' },
  Analysis: { kind: 'child' },
  LenderCheck: { kind: 'child' },
  Decision: { kind: 'child' },
  CashflowReview: { kind: 'child' },
  CheckRun: { kind: 'child' },
} as const;

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 100;

const SORT_RE = /^-?[a-z_]{1,40}$/i;

export interface Db {
  [entity: string]: {
    get?: (id: string) => Promise<Record<string, unknown> | null>;
    filter?: (query: Record<string, unknown>, sort: string, limit: number) => Promise<unknown>;
  };
}

type Result = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string): Result => ({ status, body: { error } });

const asItems = (res: unknown): Record<string, unknown>[] =>
  Array.isArray(res) ? res : ((res as { items?: Record<string, unknown>[] })?.items ?? []);

function cleanLimit(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

export async function readData(db: Db, caller: Caller | null, body: unknown): Promise<Result> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'Unknown entity');
  const b = body as Record<string, unknown>;
  const entity = typeof b.entity === 'string' ? b.entity : '';
  const spec = (ENTITIES as Record<string, { kind: string; queryKeys?: string[] }>)[entity];
  if (!spec) return fail(400, 'Unknown entity');

  let sort = '-created_date';
  if (b.sort !== undefined) {
    if (typeof b.sort !== 'string' || !SORT_RE.test(b.sort)) return fail(400, 'Bad sort');
    sort = b.sort;
  }
  const limit = cleanLimit(b.limit);

  if (entity === 'Borrower') {
    if (typeof b.id === 'string' && b.id) {
      const borrower = await db.Borrower.get!(b.id).catch(() => null);
      if (!borrower || !canAccessCompany(borrower, caller)) return fail(404, 'Company not found.');
      return { status: 200, body: { item: borrower } };
    }
    const query = (b.query ?? {}) as Record<string, unknown>;
    if (typeof query !== 'object' || Array.isArray(query)) return fail(400, 'Unsupported query');
    for (const key of Object.keys(query)) {
      if (!spec.queryKeys!.includes(key)) return fail(400, 'Unsupported query');
    }
    const callerEmail = typeof caller?.email === 'string' && caller.email.trim() ? caller.email.trim().toLowerCase() : '';
    const scoped = callerEmail ? { ...query, owner_email: callerEmail } : { ...query };
    const items = asItems(await db.Borrower.filter!(scoped, sort, limit)).filter((row) => canAccessCompany(row, caller));
    return { status: 200, body: { items } };
  }

  // Child records: reachable only through an accessible company.
  if (b.id !== undefined) return fail(400, 'Unsupported query');
  const query = (b.query ?? {}) as Record<string, unknown>;
  if (typeof query !== 'object' || Array.isArray(query)) return fail(400, 'Unsupported query');
  const keys = Object.keys(query);
  const borrowerId = query.borrower_id;
  if (keys.length !== 1 || typeof borrowerId !== 'string' || !borrowerId) return fail(400, 'Unsupported query');
  const borrower = await db.Borrower.get!(borrowerId).catch(() => null);
  if (!borrower || !canAccessCompany(borrower, caller)) return fail(404, 'Company not found.');
  const items = asItems(await db[entity].filter!({ borrower_id: borrowerId }, sort, limit));
  return { status: 200, body: { items } };
}
