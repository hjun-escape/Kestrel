// Read-only tools for askPortfolio. Pure: no npm:, no Deno. The data layer is
// injected, and it only has read methods; the propose_* tools never act, they
// return a pending_action that the user confirms through confirmAction.

export interface Borrower {
  id: string;
  name: string;
  website_domain?: string;
  stage?: string;
  status?: string;
  why?: string;
  loan_amount_usd?: number;
  last_refreshed?: string;
  owner_email?: string;
}

export interface Signal {
  id: string;
  borrower_id: string;
  type?: string;
  severity?: string;
  date?: string;
  title?: string;
  snippet?: string;
  source_name?: string;
  source_url?: string;
}

export interface DataLayer {
  listBorrowers(): Promise<Borrower[]>;
  getBorrower(id: string): Promise<Borrower | null>;
  listSignals(borrowerId: string): Promise<Signal[]>;
}

export interface ToolContext {
  data: DataLayer;
  nowMs: number;
}

export type ActionKind = 'screen' | 'refresh' | 'deep_check' | 'devin_investigation';

export interface PendingAction {
  action_id: string;
  kind: ActionKind;
  summary: string;
  params: Record<string, string | number>;
}

export const TOOL_NAMES = [
  'list_companies',
  'get_company',
  'portfolio_summary',
  'propose_screen',
  'propose_refresh',
  'propose_deep_check',
  'propose_devin_investigation',
] as const;

const STAGES = ['applicant', 'borrower'];
const STATUSES = ['green', 'yellow', 'red'];
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 8;
const MAX_SIGNALS = 50;
const MAX_NAME = 200;
const MAX_SHORT_FIELD = 100;
const MAX_QUESTION = 500;
const MIN_QUESTION = 3;
const MAX_DEVIN_QUESTION = 300; // devinRun sends at most 300 chars to Devin
const MAX_LOAN_USD = 1e12;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

type Args = Record<string, unknown>;

function asArgs(raw: unknown): Args {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Args) : {};
}

function optionalEnum(args: Args, key: string, allowed: string[]): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${key} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function requiredString(args: Args, key: string, max: number, min = 1): string {
  const value = typeof args[key] === 'string' ? (args[key] as string).trim() : '';
  if (value.length < min || value.length > max) {
    throw new Error(`${key} is required (${min}-${max} characters)`);
  }
  return value;
}

function optionalString(args: Args, key: string, max: number): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new Error(`${key} must be text up to ${max} characters`);
  }
  return value.trim() || undefined;
}

function requiredId(args: Args): string {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!ID_PATTERN.test(id)) throw new Error('id must be a company id from list_companies or get_company');
  return id;
}

export function normalizeDomain(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('website_domain is required');
  const domain = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
  if (!DOMAIN_PATTERN.test(domain)) throw new Error('website_domain must be a domain such as example.com');
  return domain;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function summarize(b: Borrower) {
  return {
    id: b.id,
    name: b.name,
    stage: b.stage,
    status: b.status,
    why: b.why ?? '',
    loan_amount_usd: b.loan_amount_usd ?? null,
    last_refreshed: b.last_refreshed ?? null,
  };
}

function candidate(b: Borrower) {
  return { id: b.id, name: b.name, stage: b.stage, status: b.status };
}

function newActionId(kind: ActionKind, nowMs: number): string {
  return `${kind}_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function requireBorrower(data: DataLayer, id: string): Promise<Borrower> {
  const borrower = await data.getBorrower(id);
  if (!borrower) throw new Error(`company ${id} not found`);
  return borrower;
}

async function listCompanies(args: Args, ctx: ToolContext) {
  const stage = optionalEnum(args, 'stage', STAGES);
  const status = optionalEnum(args, 'status', STATUSES);
  const all = await ctx.data.listBorrowers();
  const companies = all
    .filter((b) => (!stage || b.stage === stage) && (!status || b.status === status))
    .map(summarize);
  return { count: companies.length, companies };
}

function matchByName(all: Borrower[], query: string): Borrower[] {
  const q = normalizeName(query);
  if (!q) return [];
  const exact = all.filter((b) => normalizeName(b.name) === q);
  if (exact.length > 0) return exact;
  const contains = all.filter((b) => normalizeName(b.name).includes(q));
  if (contains.length > 0) return contains;
  const tokens = q.split(' ').filter((t) => t.length > 2);
  if (tokens.length === 0) return [];
  return all.filter((b) => {
    const name = normalizeName(b.name);
    return tokens.every((t) => name.includes(t));
  });
}

async function getCompany(args: Args, ctx: ToolContext) {
  const query = requiredString(args, 'name_or_id', MAX_NAME);
  const all = await ctx.data.listBorrowers();
  const byId = all.find((b) => b.id === query);
  const matches = byId ? [byId] : matchByName(all, query);
  if (matches.length === 0) {
    return { found: false, message: `No company matches "${query}".` };
  }
  if (matches.length > 1) {
    return { found: false, ambiguous: true, candidates: matches.slice(0, MAX_CANDIDATES).map(candidate) };
  }
  const company = matches[0];
  const signals = (await ctx.data.listSignals(company.id)).slice(0, MAX_SIGNALS).map((s) => ({
    id: s.id,
    type: s.type,
    severity: s.severity,
    date: s.date,
    title: s.title,
    snippet: s.snippet,
    source_name: s.source_name,
    source_url: s.source_url,
  }));
  return {
    found: true,
    company: { ...summarize(company), website_domain: company.website_domain ?? '' },
    signals,
  };
}

async function portfolioSummary(ctx: ToolContext) {
  const all = await ctx.data.listBorrowers();
  const counts_by_status = { green: 0, yellow: 0, red: 0 };
  const counts_by_stage = { applicant: 0, borrower: 0 };
  let exposure = 0;
  const stale: { id: string; name: string; last_refreshed: string }[] = [];
  const neverChecked: { id: string; name: string }[] = [];
  for (const b of all) {
    if (b.status === 'green' || b.status === 'yellow' || b.status === 'red') counts_by_status[b.status] += 1;
    if (b.stage === 'applicant' || b.stage === 'borrower') counts_by_stage[b.stage] += 1;
    if ((b.status === 'red' || b.status === 'yellow') && typeof b.loan_amount_usd === 'number') {
      exposure += b.loan_amount_usd;
    }
    const refreshed = b.last_refreshed ? Date.parse(b.last_refreshed) : NaN;
    if (Number.isNaN(refreshed)) neverChecked.push({ id: b.id, name: b.name });
    else if (ctx.nowMs - refreshed > STALE_AFTER_MS) {
      stale.push({ id: b.id, name: b.name, last_refreshed: b.last_refreshed as string });
    }
  }
  return {
    total_companies: all.length,
    counts_by_status,
    counts_by_stage,
    exposure_at_risk_usd: exposure,
    stale,
    never_checked: neverChecked,
  };
}

async function proposeScreen(args: Args, ctx: ToolContext) {
  const name = requiredString(args, 'name', MAX_NAME);
  const website_domain = normalizeDomain(args.website_domain);
  const params: Record<string, string | number> = { name, website_domain };
  for (const key of ['hq_city', 'hq_state', 'industry']) {
    const value = optionalString(args, key, MAX_SHORT_FIELD);
    if (value) params[key] = value;
  }
  const loan = args.loan_amount_usd;
  if (loan !== undefined && loan !== null && loan !== '') {
    const n = Number(loan);
    if (!Number.isFinite(n) || n < 0 || n > MAX_LOAN_USD) throw new Error('loan_amount_usd must be a positive number');
    params.loan_amount_usd = n;
  }
  const existing = (await ctx.data.listBorrowers()).find(
    (b) => typeof b.website_domain === 'string' && b.website_domain.toLowerCase() === website_domain,
  );
  if (existing) throw new Error(`${website_domain} is already in the book as ${existing.name} (${existing.id})`);
  const pending_action: PendingAction = {
    action_id: newActionId('screen', ctx.nowMs),
    kind: 'screen',
    summary: `Add ${name} (${website_domain}) as an applicant and run its first check.`,
    params,
  };
  return { pending_action };
}

async function proposeRefresh(args: Args, ctx: ToolContext) {
  const id = requiredId(args);
  const borrower = await requireBorrower(ctx.data, id);
  const pending_action: PendingAction = {
    action_id: newActionId('refresh', ctx.nowMs),
    kind: 'refresh',
    summary: `Re-check public sources for ${borrower.name}.`,
    params: { id },
  };
  return { pending_action };
}

async function proposeDeepCheck(args: Args, ctx: ToolContext) {
  const id = requiredId(args);
  const question = requiredString(args, 'question', MAX_QUESTION, MIN_QUESTION);
  const borrower = await requireBorrower(ctx.data, id);
  const pending_action: PendingAction = {
    action_id: newActionId('deep_check', ctx.nowMs),
    kind: 'deep_check',
    summary: `Run an analyst deep check on ${borrower.name}: "${question}"`,
    params: { id, question },
  };
  return { pending_action };
}

// Proposes an independent Devin investigation (functions/devinRun, kind 'investigation').
// Like every propose_* tool it never acts; the user confirms through confirmAction.
async function proposeDevinInvestigation(args: Args, ctx: ToolContext) {
  const id = requiredId(args);
  const question = requiredString(args, 'question', MAX_DEVIN_QUESTION, MIN_QUESTION);
  const borrower = await requireBorrower(ctx.data, id);
  const pending_action: PendingAction = {
    action_id: newActionId('devin_investigation', ctx.nowMs),
    kind: 'devin_investigation',
    summary: `Ask Devin to independently investigate ${borrower.name} from its cited sources: "${question}"`,
    params: { id, question },
  };
  return { pending_action };
}

// Runs one tool. Throws on bad input or unknown tool; the agent loop records
// the error and continues.
// deno-lint-ignore no-explicit-any
export async function dispatchTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<any> {
  const args = asArgs(rawArgs);
  switch (name) {
    case 'list_companies': return listCompanies(args, ctx);
    case 'get_company': return getCompany(args, ctx);
    case 'portfolio_summary': return portfolioSummary(ctx);
    case 'propose_screen': return proposeScreen(args, ctx);
    case 'propose_refresh': return proposeRefresh(args, ctx);
    case 'propose_deep_check': return proposeDeepCheck(args, ctx);
    case 'propose_devin_investigation': return proposeDevinInvestigation(args, ctx);
    default: throw new Error(`unknown tool "${name}"`);
  }
}
