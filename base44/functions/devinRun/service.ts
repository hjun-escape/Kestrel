// devinRun orchestration with injected deps (entity access, Devin client, clock),
// so ownership, rate limits and Devin outcomes are testable without a live account.
import { canAccessCompany } from './access.ts';
import { buildPrompt, hourAgo, KINDS, mapSessionStatus, OUTPUT_SCHEMA, rateLimitError, sanitizeQuestion, verifyFindings } from './logic.ts';
import type { RunKind, SignalInput } from './logic.ts';
import type { DevinClient } from './client.ts';

// deno-lint-ignore no-explicit-any
type Run = Record<string, any>;

export interface DevinDeps {
  user(): Promise<{ email?: string } | null>;
  borrower(id: string): Promise<Record<string, unknown> | null>;
  signals(borrowerId: string): Promise<SignalInput[]>;
  latestAudit(borrowerId: string): Promise<unknown>;
  runsFor(borrowerId: string): Promise<Run[]>; // newest first
  recentRuns(sinceIso: string): Promise<Run[]>; // app-wide, started_at >= since
  getRun(id: string): Promise<Run | null>;
  createRun(data: Run): Promise<Run>;
  updateRun(id: string, patch: Run): Promise<Run>;
  devin: DevinClient | null; // null when DEVIN_SERVICE_KEY is not set
  now(): string;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ACTIVE = new Set(['queued', 'running']);
const STALE_ACTIVE_MS = 2 * 60 * 60 * 1000; // an active run older than this no longer blocks a new one
const MAX_ACU = 5; // per-session spend cap sent to Devin
const NOT_CONNECTED = 'Devin is not connected.';
const reply = (status: number, data: Record<string, unknown>) => ({ status, data });

function errorText(e: unknown): string {
  return (e as Error)?.message || 'Devin request failed.';
}

async function authorize(deps: DevinDeps, borrowerId: string) {
  const user = await deps.user().catch(() => null);
  if (!user?.email) return { error: reply(401, { error: 'Sign in to use Devin.' }) };
  const borrower = await deps.borrower(borrowerId).catch(() => null);
  if (!borrower) return { error: reply(404, { error: 'Company not found.' }) };
  if (!canAccessCompany(borrower, user)) return { error: reply(403, { error: 'You do not have access to this company.' }) };
  return { user, borrower };
}

async function start(body: Run, deps: DevinDeps) {
  const kind = body.kind as RunKind;
  if (!KINDS.includes(kind)) return reply(400, { error: 'kind must be independent_audit or investigation.' });
  const question = sanitizeQuestion(body.question);
  if (kind === 'investigation' && question.length < 3) return reply(400, { error: 'An investigation needs a question (3-300 characters).' });
  const auth = await authorize(deps, body.borrower_id);
  if (auth.error) return auth.error;
  if (!deps.devin) return reply(503, { error: NOT_CONNECTED });
  const now = deps.now();
  const existing = (await deps.runsFor(body.borrower_id)).find(r => r.kind === kind && ACTIVE.has(r.status) && Date.parse(now) - Date.parse(r.started_at) < STALE_ACTIVE_MS);
  if (existing) return reply(200, { run: existing, already_running: true });
  const limit = rateLimitError(await deps.recentRuns(hourAgo(now)), body.borrower_id, now);
  if (limit) return reply(429, { error: limit });

  const [signals, latestAudit] = await Promise.all([deps.signals(body.borrower_id), kind === 'independent_audit' ? deps.latestAudit(body.borrower_id) : null]);
  const prompt = buildPrompt({ kind, borrower: auth.borrower, signals, latestAudit, question });
  // Record the run first so the rate limit counts it even if Devin fails.
  const run = await deps.createRun({ borrower_id: body.borrower_id, kind, question, status: 'queued', started_at: now, requested_by: auth.user.email, findings: [] });
  try {
    const session = await deps.devin.createSession({
      prompt,
      title: `Kestrel ${kind === 'independent_audit' ? 'independent audit' : 'investigation'}: ${String(auth.borrower.name || '').slice(0, 80)}`,
      structured_output_schema: OUTPUT_SCHEMA,
      tags: ['kestrel', kind],
      max_acu_limit: MAX_ACU,
      secret_ids: [], // the session gets none of the org's secrets
      knowledge_ids: [],
      idempotent: false,
    });
    const saved = await deps.updateRun(run.id, { status: 'running', devin_session_id: session.session_id, devin_url: session.url });
    return reply(200, { run: saved });
  } catch (e) {
    const saved = await deps.updateRun(run.id, { status: 'failed', finished_at: deps.now(), error: errorText(e) });
    return reply(502, { run: saved, error: saved.error });
  }
}

async function poll(body: Run, deps: DevinDeps) {
  if (typeof body.run_id !== 'string' || !ID.test(body.run_id)) return reply(400, { error: 'Provide run_id.' });
  const run = await deps.getRun(body.run_id).catch(() => null);
  if (!run) return reply(404, { error: 'Run not found.' });
  const auth = await authorize(deps, run.borrower_id);
  if (auth.error) return auth.error;
  if (run.status === 'finished' || run.status === 'failed') return reply(200, { run }); // idempotent
  if (!deps.devin) return reply(503, { error: NOT_CONNECTED, run });
  if (!run.devin_session_id) return reply(200, { run });
  let session;
  try {
    session = await deps.devin.getSession(run.devin_session_id);
  } catch (e) {
    const saved = await deps.updateRun(run.id, { status: 'failed', finished_at: deps.now(), error: errorText(e) });
    return reply(200, { run: saved });
  }
  const status = mapSessionStatus(session);
  if (status === 'failed') {
    return reply(200, { run: await deps.updateRun(run.id, { status, finished_at: deps.now(), error: 'The Devin session expired before returning a result.' }) });
  }
  if (status !== 'finished') {
    return reply(200, { run: status === run.status ? run : await deps.updateRun(run.id, { status }) });
  }
  const signals = await deps.signals(run.borrower_id);
  const output = session?.structured_output;
  const verified = verifyFindings(output, signals);
  if (!verified.ok) {
    return reply(200, { run: await deps.updateRun(run.id, { status: 'failed', finished_at: deps.now(), error: verified.error }) });
  }
  const saved = await deps.updateRun(run.id, {
    status: 'finished', finished_at: deps.now(), structured_output: output, summary: verified.summary, findings: verified.findings, error: '',
  });
  return reply(200, { run: saved });
}

async function list(body: Run, deps: DevinDeps) {
  const auth = await authorize(deps, body.borrower_id);
  if (auth.error) return auth.error;
  const runs = (await deps.runsFor(body.borrower_id)).slice(0, 20);
  return reply(200, { runs, connected: !!deps.devin });
}

export async function handleDevinRun(body: unknown, deps: DevinDeps) {
  try {
    const b = (body && typeof body === 'object' ? body : {}) as Run;
    if (b.action === 'poll') return await poll(b, deps);
    if (b.action !== 'start' && b.action !== 'list') return reply(400, { error: 'action must be start, poll or list.' });
    if (typeof b.borrower_id !== 'string' || !ID.test(b.borrower_id)) return reply(400, { error: 'Provide borrower_id.' });
    return b.action === 'start' ? await start(b, deps) : await list(b, deps);
  } catch {
    return reply(500, { error: 'Could not complete the Devin request.' });
  }
}
