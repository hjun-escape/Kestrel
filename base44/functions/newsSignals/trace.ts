// Builds the CheckRun record the company page shows under Sources ("How this was checked").
// Pure: newsSignals feeds it events and a save function; it never touches signals or status.
import type { NewsEvent } from './logic.ts';
import type { Check } from './linkedin.ts';

export interface CheckRunArticle {
  url: string;
  title: string;
  source: string;
  date: string;
  query: string;
  read: boolean | null; // null until the page read finishes
  relevant?: boolean;
  same_company?: boolean;
  signal_type?: string;
  severity?: string;
  reason?: string; // the model's own explanation
  decision: 'pending' | 'kept' | 'dropped' | 'failed';
  why?: string; // the code's verdict, e.g. "snippet guard: not an exact quote"
  snippet?: string;
}

export interface CheckRun {
  borrower_id: string;
  source: 'News';
  status: 'running' | 'done' | 'failed';
  started_at: string;
  updated_at: string;
  finished_at?: string;
  error?: string;
  searches: { query_type: string; query: string; ok: boolean; count: number; error?: string }[];
  articles: CheckRunArticle[];
  linkedin_status: 'off' | 'running' | 'done' | 'skipped';
  linkedin: { exec: string; profile_url: string; result: string; detail: string }[];
  log: string[];
  signal_count?: number;
}

const MAX_LOG = 80;
const SAVE_EVERY_MS = 1_000;

export function newCheckRun(borrowerId: string, now: Date, linkedinOn: boolean): CheckRun {
  const t = now.toISOString();
  return {
    borrower_id: borrowerId, source: 'News', status: 'running', started_at: t, updated_at: t,
    searches: [], articles: [], linkedin_status: linkedinOn ? 'running' : 'off', linkedin: [], log: [],
  };
}

export function applyEvent(run: CheckRun, e: NewsEvent): void {
  if (e.kind === 'search') {
    run.searches.push({ query_type: e.query_type, query: e.query, ok: e.ok, count: e.count, ...(e.error ? { error: e.error } : {}) });
  } else if (e.kind === 'read') {
    const a = run.articles.find((x) => x.url === e.url);
    if (a) a.read = e.read;
    else run.articles.push({ url: e.url, title: e.title, source: e.source, date: e.date, query: e.query, read: e.read, decision: 'pending' });
  } else {
    const a = run.articles.find((x) => x.url === e.url);
    if (!a) return;
    a.decision = e.decision;
    a.why = e.why;
    if (e.snippet) a.snippet = e.snippet;
    if (e.tag) {
      a.relevant = e.tag.relevant;
      a.same_company = e.tag.same_company;
      a.signal_type = e.tag.signal_type;
      a.severity = e.tag.severity;
      if (e.tag.reason) a.reason = e.tag.reason;
    }
  }
}

export function addLog(run: CheckRun, msg: string, elapsedS: number): void {
  run.log.push(`${elapsedS.toFixed(1).padStart(5)}s  ${msg}`);
  if (run.log.length > MAX_LOG) run.log.splice(0, run.log.length - MAX_LOG);
}

export function applyLinkedIn(run: CheckRun, checks: Check[] | null): void {
  run.linkedin_status = checks ? 'done' : 'skipped';
  run.linkedin = (checks ?? []).map((c) => ({ exec: c.exec, profile_url: c.profile_url ?? '', result: c.result, detail: c.detail }));
}

/**
 * Tracks one run and saves it: create on the first save, then at most once per SAVE_EVERY_MS, plus a final save.
 * Saving is best effort: a failed write is logged and never fails the check itself.
 */
export function createTracker(
  run: CheckRun,
  io: { create: (r: CheckRun) => Promise<{ id: string }>; update: (id: string, r: CheckRun) => Promise<unknown>; now: () => number; warn: (m: string) => void },
) {
  const t0 = io.now();
  let id: string | null = null;
  let lastSave = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const save = (force = false) => {
    if (!force && io.now() - lastSave < SAVE_EVERY_MS) return chain;
    lastSave = io.now();
    run.updated_at = new Date(io.now()).toISOString();
    const snapshot = JSON.parse(JSON.stringify(run)) as CheckRun;
    chain = chain.then(async () => {
      try {
        if (id) await io.update(id, snapshot);
        else id = (await io.create(snapshot)).id;
      } catch (e) {
        io.warn(`CheckRun save failed: ${(e as Error).message}`);
      }
    });
    return chain;
  };
  return {
    run,
    event(e: NewsEvent) {
      applyEvent(run, e);
      void save();
    },
    log(msg: string) {
      addLog(run, msg, (io.now() - t0) / 1000);
      void save();
    },
    linkedin(checks: Check[] | null) {
      applyLinkedIn(run, checks);
      void save();
    },
    async finish(result: { ok: true; signalCount: number } | { ok: false; error: string }) {
      run.status = result.ok ? 'done' : 'failed';
      run.finished_at = new Date(io.now()).toISOString();
      if (result.ok) run.signal_count = result.signalCount;
      else run.error = result.error;
      await save(true);
    },
  };
}
