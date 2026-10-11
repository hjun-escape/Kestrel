// recordDecision logic: log a decision on a company. Pure: the data layer is passed in, so tests
// run in Node. decided_by is the caller, never a client field; documents are kept only for a
// "request_documents" decision, each entry limited to the fields the document request builds.

export const DECISIONS = ['request_documents', 'proceed', 'watchlist', 'decline'] as const;
export const MAX_NOTE = 2000;
export const MAX_DOCUMENTS = 50;
const MAX_FIELD = 500;

type Patch = Record<string, unknown>;

export interface Db {
  Decision: { create(data: Patch): Promise<unknown> };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function cleanDocument(value: unknown): Patch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as Patch;
  const out: Patch = {};
  for (const k of ['item', 'reason', 'source_url'] as const) {
    const v = d[k];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > MAX_FIELD) return null;
    out[k] = v;
  }
  return out;
}

// Validates the body and returns the fields to store, or an error a user can act on.
export function cleanDecision(body: unknown): { fields: Patch } | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'decision is required' };
  const b = body as Patch;
  const decision = b.decision;
  if (typeof decision !== 'string' || !(DECISIONS as readonly string[]).includes(decision)) {
    return { error: 'decision must be request_documents, proceed, watchlist or decline' };
  }
  const fields: Patch = { decision };

  const note = b.note;
  if (note !== undefined && note !== null && note !== '') {
    if (typeof note !== 'string') return { error: 'note must be text' };
    const trimmed = note.trim();
    if (trimmed.length > MAX_NOTE) return { error: `Note must be ${MAX_NOTE} characters or fewer.` };
    fields.note = trimmed;
  }

  const followUp = b.follow_up_date;
  if (followUp !== undefined && followUp !== null && followUp !== '') {
    if (typeof followUp !== 'string' || !isRealDate(followUp)) return { error: 'Follow-up date must be a real date (YYYY-MM-DD).' };
    fields.follow_up_date = followUp;
  }

  fields.documents_requested = [];
  if (decision === 'request_documents' && Array.isArray(b.documents_requested)) {
    if (b.documents_requested.length > MAX_DOCUMENTS) return { error: `At most ${MAX_DOCUMENTS} documents can be listed.` };
    fields.documents_requested = b.documents_requested.map(cleanDocument).filter(Boolean);
  }
  return { fields };
}

// decided_by comes from the signed-in user; created_at from the caller's clock. Client-supplied
// values for either are ignored.
export async function recordDecision(db: Db, borrower: { id: string }, user: { email?: unknown }, body: unknown, now: string) {
  const cleaned = cleanDecision(body);
  if ('error' in cleaned) return { status: 400, body: { error: cleaned.error } };
  const record = {
    borrower_id: borrower.id,
    ...cleaned.fields,
    decided_by: user.email,
    created_at: now,
  };
  const saved = await db.Decision.create(record);
  return { status: 200, body: { decision: saved } };
}
