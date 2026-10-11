// loadDemo logic: put the demo companies (demoCompanies.ts) into a loan book without duplicating them.
// Pure: the data layer is passed in, so tests run in Node.
//
// - Signed out (ownerEmail undefined): the shared demo book, rows with no owner_email.
// - Signed in: copies owned by the caller. The owner comes from auth.me() in entry.ts, never from the client.
// - Rows are matched by website_domain within that book, so running it again creates nothing.
// - purgePlaceholders (shared book only): deletes the seeded .example companies and every record hanging off them.
// - One run per book per 30 s (DemoRun), a basic guard since the shared book is open without an account.

import { DEMO_COMPANIES, type DemoCompany } from "./demoCompanies.ts";

export const RATE_LIMIT_MS = 30_000;
export const SHARED_SCOPE = "shared";

// Same list as manageCompany/logic.ts CHILD_ENTITIES (tests/loadDemo.test.ts checks).
export const CHILD_ENTITIES = ["Signal", "Analysis", "LenderCheck", "Decision", "CashflowReview", "CheckRun", "AuditRun"] as const;

type Row = Record<string, unknown> & { id?: unknown };

interface Entity {
  filter?: (query: Record<string, unknown>, sort?: string, limit?: number) => Promise<unknown>;
  create?: (data: Record<string, unknown>) => Promise<unknown>;
  update?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  delete?: (id: string) => Promise<unknown>;
  deleteMany?: (query: Record<string, unknown>) => Promise<unknown>;
}
export type DemoDb = Record<string, Entity>;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeDomain(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
}

export function isPlaceholder(company: { website_domain?: unknown }): boolean {
  return normalizeDomain(company?.website_domain).endsWith(".example");
}

export function isRateLimited(lastRunIso: unknown, now: number): boolean {
  const last = typeof lastRunIso === "string" ? Date.parse(lastRunIso) : NaN;
  return Number.isFinite(last) && now - last < RATE_LIMIT_MS;
}

function inBook(row: Row, owner: string): boolean {
  return normalizeEmail(row.owner_email) === owner;
}

/** For each demo company, the id of the row already in this book (same domain), if any. */
export function planDemoLoad(existing: Row[], companies: readonly DemoCompany[], ownerEmail: string | undefined) {
  const owner = normalizeEmail(ownerEmail);
  const byDomain = new Map<string, string>();
  for (const row of existing) {
    if (!inBook(row, owner) || typeof row.id !== "string") continue;
    const domain = normalizeDomain(row.website_domain);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, row.id);
  }
  return companies.map((company) => ({ company, existingId: byDomain.get(normalizeDomain(company.website_domain)) }));
}

async function rows(entity: Entity, query: Record<string, unknown>): Promise<Row[]> {
  const res = await entity.filter!(query, "-created_date", 500);
  if (Array.isArray(res)) return res as Row[];
  const items = (res as { items?: unknown })?.items;
  return Array.isArray(items) ? (items as Row[]) : [];
}

/** A Borrower record for a demo company: "Not checked" (status placeholder green, no last_refreshed). */
export function borrowerRecord(company: DemoCompany, owner: string): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: company.name,
    website_domain: company.website_domain,
    hq_city: company.hq_city,
    hq_state: company.hq_state,
    industry: company.industry,
    stage: company.stage,
    loan_amount_usd: company.loan_amount_usd,
    status: "green",
    why: "",
    sources_unavailable: [],
  };
  if (owner) record.owner_email = owner;
  return record;
}

async function claimRun(db: DemoDb, scope: string, now: number): Promise<boolean> {
  const runs = await rows(db.DemoRun, { scope });
  if (runs.some((r) => isRateLimited(r.ran_at, now))) return false;
  const ranAt = new Date(now).toISOString();
  const first = runs.find((r) => typeof r.id === "string");
  if (first) await db.DemoRun.update!(first.id as string, { ran_at: ranAt });
  else await db.DemoRun.create!({ scope, ran_at: ranAt });
  return true;
}

async function purgeSharedPlaceholders(db: DemoDb, existing: Row[]): Promise<number> {
  const targets = existing.filter((b) => inBook(b, "") && isPlaceholder(b) && typeof b.id === "string");
  for (const b of targets) {
    // Children first, so a failure part-way never leaves records pointing at a company that is gone.
    for (const entity of CHILD_ENTITIES) await db[entity].deleteMany!({ borrower_id: b.id });
    await db.Borrower.delete!(b.id as string);
  }
  return targets.length;
}

export interface LoadDemoOptions {
  now: number;
  ownerEmail?: string;
  purgePlaceholders?: boolean;
  companies?: readonly DemoCompany[];
}

export async function loadDemo(db: DemoDb, opts: LoadDemoOptions) {
  const owner = normalizeEmail(opts.ownerEmail);
  if (!(await claimRun(db, owner || SHARED_SCOPE, opts.now))) {
    return { status: 429, body: { error: "The demo was loaded a moment ago. Try again in 30 seconds." } };
  }
  const companies = opts.companies ?? DEMO_COMPANIES;
  const existing = (await rows(db.Borrower, owner ? { owner_email: owner } : {})).filter((b) => inBook(b, owner));
  const purged = !owner && opts.purgePlaceholders ? await purgeSharedPlaceholders(db, existing) : 0;

  const out: { id: string; name: string; created: boolean }[] = [];
  for (const { company, existingId } of planDemoLoad(existing, companies, owner)) {
    if (existingId) {
      out.push({ id: existingId, name: company.name, created: false });
      continue;
    }
    const created = (await db.Borrower.create!(borrowerRecord(company, owner))) as Row;
    out.push({ id: String(created?.id ?? ""), name: company.name, created: true });
  }
  return { status: 200, body: { companies: out, purged } };
}
