// Pure logic for analyzeBorrower: the agentic credit analyst.
// No npm: imports and no Deno globals, so it runs under Node's test runner.
// The Deno handler (entry.ts) injects fetch, the LLM and the Bright Data key.
//
// The analyst never sets status. Status stays plain code in scoreBorrower.

import {
  BRIEF_SCHEMA,
  PLAN_SCHEMA,
  buildBriefPrompt,
  buildPlanPrompt,
} from './prompts.ts';
import type { Borrower, Observation, SignalLike } from './prompts.ts';

export { BRIEF_SCHEMA, PLAN_SCHEMA, buildBriefPrompt, buildPlanPrompt };
export type { Borrower, Observation, SignalLike };

// ---------- limits ----------

export const MAX_STEPS = 4;
export const BUDGET_MS = 90_000;
/** Time kept back for the final brief call. Planning stops once less than this is left. */
export const FINAL_RESERVE_MS = 20_000;
export const TOOL_TIMEOUT_MS = 25_000;
export const PAGE_TEXT_CAP = 15_000;
const MAX_SEARCH_RESULTS = 10;
const MAX_FINDINGS = 10;
const MAX_OPEN_QUESTIONS = 8;
const MAX_TOOL_INPUT = 500;
/** A shorter quote matches too easily to prove anything. */
const MIN_QUOTE_CHARS = 12;

export const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const BRIGHTDATA_ZONE = 'mcp_unlocker';

export const TOOL_NAMES = ['news_search', 'read_page'] as const;
export const RECOMMENDED_ACTIONS = ['proceed', 'request_documents', 'escalate'] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export interface NewsResult {
  title: string;
  url: string;
  source: string;
  date: string;
  snippet: string;
}

export interface ToolChoice {
  action: ToolName | 'finish';
  input: string;
}

export interface Finding {
  claim: string;
  quote: string;
  source_url: string;
  source_name: string;
  date?: string;
}

export interface Brief {
  summary: string;
  findings: Finding[];
  open_questions: string[];
  recommended_action: RecommendedAction;
}

export interface Step {
  tool: string;
  input: string;
  ok: boolean;
  detail?: string;
}

export interface DroppedFinding {
  finding: Finding;
  reason: 'unknown_source' | 'quote_not_found' | 'quote_too_short';
}

export interface AnalysisRecord {
  borrower_id: string;
  created_at: string;
  summary: string;
  findings: Finding[];
  findings_dropped: number;
  open_questions: string[];
  recommended_action: RecommendedAction;
  steps: Step[];
}

export interface LLMParams {
  prompt: string;
  response_json_schema: object;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

export interface AnalystDeps {
  borrower: Borrower;
  signals: SignalLike[];
  invokeLLM: (params: LLMParams) => Promise<unknown>;
  fetch: FetchLike;
  apiKey: string | undefined;
  now?: () => number;
  maxSteps?: number;
  budgetMs?: number;
}

export type AnalystResult =
  | { ok: true; analysis: AnalysisRecord; dropped: DroppedFinding[] }
  | { ok: false; code: 'llm_unavailable' | 'llm_malformed' | 'internal_error'; error: string; steps: Step[] };

// ---------- small helpers ----------

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse an LLM reply that may be an object, a JSON string, or JSON wrapped in prose/fences. */
export function coerceJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Canonical form of an http(s) URL for comparison, or null if it is not one. */
export function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';
  return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
}

/** Whitespace-normalised, case-insensitive form used for quote matching. */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ---------- Bright Data ----------

export function buildNewsSearchUrl(query: string): string {
  return (
    `https://www.google.com/search?q=${encodeURIComponent(query)}` +
    '&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1'
  );
}

export function buildBrightDataRequest(apiKey: string, targetUrl: string) {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone: BRIGHTDATA_ZONE, url: targetUrl, format: 'raw' }),
  };
}

/** Bright Data SERP JSON (results under `news`) -> NewsResult[]. Skips anything malformed. */
export function normaliseSerpJson(raw: unknown): NewsResult[] {
  const data = coerceJson(raw);
  if (!isRecord(data)) return [];
  const list = Array.isArray(data.news) ? data.news : Array.isArray(data.news_results) ? data.news_results : [];
  const results: NewsResult[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const title = str(item.title);
    const url = str(item.link) || str(item.url);
    if (!title || !normaliseUrl(url)) continue;
    const source = isRecord(item.source) ? str(item.source.name) : str(item.source) || str(item.source_name);
    results.push({
      title,
      url,
      source,
      date: str(item.date),
      snippet: str(item.description) || str(item.snippet),
    });
    if (results.length >= MAX_SEARCH_RESULTS) break;
  }
  return results;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
  copy: '©', reg: '®', trade: '™', middot: '·', bull: '•',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    const lower = code.toLowerCase();
    if (lower === 'amp') return '&';
    return NAMED_ENTITIES[lower] ?? match;
  });
}

/** HTML -> readable text: drops scripts/styles, tags and entities, collapses whitespace, caps length. */
export function htmlToText(html: string, cap: number = PAGE_TEXT_CAP): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/ /g, ' ').replace(/\s+/g, ' ').trim().slice(0, cap);
}

// ---------- parsing LLM replies ----------

export function parseToolChoice(raw: unknown): ToolChoice | null {
  const data = coerceJson(raw);
  if (!isRecord(data)) return null;
  const action = str(data.action) || str(data.tool);
  if (action === 'finish') return { action: 'finish', input: '' };
  if (!(TOOL_NAMES as readonly string[]).includes(action)) return null;
  const input = (str(data.input) || str(data.query) || str(data.url)).slice(0, MAX_TOOL_INPUT);
  if (!input) return null;
  return { action: action as ToolName, input };
}

function limitSentences(text: string, max: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, max).join(' ');
}

function parseFinding(raw: unknown): Finding | null {
  if (!isRecord(raw)) return null;
  const claim = str(raw.claim);
  const quote = str(raw.quote);
  const sourceUrl = str(raw.source_url);
  if (!claim || !quote || !sourceUrl) return null;
  const date = str(raw.date);
  return {
    claim,
    quote,
    source_url: sourceUrl,
    source_name: str(raw.source_name),
    ...(date ? { date } : {}),
  };
}

export function parseBrief(raw: unknown): Brief | null {
  const data = coerceJson(raw);
  if (!isRecord(data)) return null;
  const summary = str(data.summary);
  if (!summary) return null;
  const findings = (Array.isArray(data.findings) ? data.findings : [])
    .map(parseFinding)
    .filter((f): f is Finding => f !== null)
    .slice(0, MAX_FINDINGS);
  const openQuestions = (Array.isArray(data.open_questions) ? data.open_questions : [])
    .map(str)
    .filter(Boolean)
    .slice(0, MAX_OPEN_QUESTIONS);
  const action = str(data.recommended_action);
  const recommended = (RECOMMENDED_ACTIONS as readonly string[]).includes(action)
    ? (action as RecommendedAction)
    : 'request_documents';
  return {
    summary: limitSentences(summary, 3),
    findings,
    open_questions: openQuestions,
    recommended_action: recommended,
  };
}

// ---------- verification (code, not LLM) ----------

function cleanQuote(quote: string): string {
  return quote
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, '');
}

/**
 * Keep a finding only if its source_url is one we saw (fetched this run or in a stored
 * Signal) and its quote appears verbatim (whitespace-normalised, case-insensitive) in the
 * text we actually have for that same URL.
 */
export function verifyFindings(
  findings: Finding[],
  sources: ReadonlyMap<string, readonly string[]>,
): { kept: Finding[]; dropped: DroppedFinding[] } {
  const byUrl = new Map<string, string[]>();
  for (const [url, texts] of sources) {
    const key = normaliseUrl(url);
    if (!key) continue;
    byUrl.set(key, [...(byUrl.get(key) ?? []), ...texts.map(normaliseForMatch)]);
  }
  const kept: Finding[] = [];
  const dropped: DroppedFinding[] = [];
  for (const finding of findings) {
    const key = normaliseUrl(finding.source_url);
    const texts = key ? byUrl.get(key) : undefined;
    if (!texts) {
      dropped.push({ finding, reason: 'unknown_source' });
      continue;
    }
    const quote = normaliseForMatch(cleanQuote(finding.quote));
    if (quote.length < MIN_QUOTE_CHARS) {
      dropped.push({ finding, reason: 'quote_too_short' });
      continue;
    }
    if (!texts.some((t) => t.includes(quote))) {
      dropped.push({ finding, reason: 'quote_not_found' });
      continue;
    }
    kept.push(finding);
  }
  return { kept, dropped };
}

// ---------- tools ----------

type SourceMap = Map<string, string[]>;

function addSource(sources: SourceMap, url: string, texts: string[]): void {
  const key = normaliseUrl(url);
  if (!key) return;
  sources.set(key, [...(sources.get(key) ?? []), ...texts.filter(Boolean)]);
}

function sourcesFromSignals(signals: SignalLike[]): SourceMap {
  const sources: SourceMap = new Map();
  for (const s of signals) {
    if (s.source_url) addSource(sources, s.source_url, [str(s.title), str(s.snippet)]);
  }
  return sources;
}

interface ToolOutcome {
  step: Step;
  observation?: Observation;
}

async function callBrightData(
  fetchFn: FetchLike,
  apiKey: string,
  targetUrl: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const request = buildBrightDataRequest(apiKey, targetUrl);
  const run = async () => {
    const res = await fetchFn(BRIGHTDATA_ENDPOINT, { ...request, signal: controller.signal });
    if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
    return res.text();
  };
  try {
    return await withTimeout(run(), timeoutMs, 'Bright Data request');
  } finally {
    controller.abort();
  }
}

async function runTool(
  choice: ToolChoice,
  ctx: { fetch: FetchLike; apiKey: string | undefined; sources: SourceMap },
  timeoutMs: number,
): Promise<ToolOutcome> {
  const fail = (detail: string): ToolOutcome => ({
    step: { tool: choice.action, input: choice.input, ok: false, detail },
  });
  if (choice.action === 'read_page') {
    const key = normaliseUrl(choice.input);
    if (!key || !ctx.sources.has(key)) return fail('URL was not in search results or stored signals');
  }
  if (!ctx.apiKey) return fail('BRIGHTDATA_API_KEY is not set');
  try {
    if (choice.action === 'news_search') {
      const body = await callBrightData(ctx.fetch, ctx.apiKey, buildNewsSearchUrl(choice.input), timeoutMs);
      const results = normaliseSerpJson(body);
      for (const r of results) addSource(ctx.sources, r.url, [r.title, r.snippet]);
      return {
        step: { tool: choice.action, input: choice.input, ok: true, detail: `${results.length} results` },
        observation: { tool: 'news_search', input: choice.input, results },
      };
    }
    const html = await callBrightData(ctx.fetch, ctx.apiKey, choice.input, timeoutMs);
    const text = htmlToText(html);
    if (!text) return fail('Page had no readable text');
    addSource(ctx.sources, choice.input, [text]);
    return {
      step: { tool: choice.action, input: choice.input, ok: true, detail: `${text.length} characters read` },
      observation: { tool: 'read_page', input: choice.input, text },
    };
  } catch (error) {
    return fail(errorMessage(error));
  }
}

// ---------- the agent loop ----------

async function planLoop(
  deps: AnalystDeps,
  sources: SourceMap,
  deadline: number,
): Promise<{ steps: Step[]; observations: Observation[] }> {
  const now = deps.now ?? Date.now;
  const maxSteps = deps.maxSteps ?? MAX_STEPS;
  const remaining = () => deadline - now() - FINAL_RESERVE_MS;
  const steps: Step[] = [];
  const observations: Observation[] = [];

  for (let toolSteps = 0; toolSteps < maxSteps; toolSteps += 1) {
    const planTime = remaining();
    if (planTime <= 0) break;
    const prompt = buildPlanPrompt({
      borrower: deps.borrower,
      signals: deps.signals,
      observations,
      stepsLeft: maxSteps - toolSteps,
    });
    let raw: unknown;
    try {
      raw = await withTimeout(deps.invokeLLM({ prompt, response_json_schema: PLAN_SCHEMA }), planTime, 'Planning call');
    } catch (error) {
      steps.push({ tool: 'plan', input: '', ok: false, detail: `LLM error: ${errorMessage(error)}` });
      break;
    }
    const choice = parseToolChoice(raw);
    if (!choice) {
      steps.push({ tool: 'plan', input: '', ok: false, detail: 'Unreadable tool choice from the LLM' });
      break;
    }
    if (choice.action === 'finish') break;
    const toolTime = Math.min(TOOL_TIMEOUT_MS, remaining());
    if (toolTime <= 0) break;
    const outcome = await runTool(choice, { fetch: deps.fetch, apiKey: deps.apiKey, sources }, toolTime);
    steps.push(outcome.step);
    if (outcome.observation) observations.push(outcome.observation);
  }
  return { steps, observations };
}

const FINAL_ATTEMPTS = 2;
/** The brief call always gets at least this long, even if planning used the budget. */
const MIN_FINAL_MS = 15_000;
/** Only retry the brief call if at least this much budget is left. */
const RETRY_MIN_MS = 10_000;

async function writeBrief(
  deps: AnalystDeps,
  observations: Observation[],
  deadline: number,
): Promise<{ brief: Brief } | { code: 'llm_unavailable' | 'llm_malformed'; error: string }> {
  const prompt = buildBriefPrompt({ borrower: deps.borrower, signals: deps.signals, observations });
  let lastFailure: { code: 'llm_unavailable' | 'llm_malformed'; error: string } = {
    code: 'llm_unavailable',
    error: 'The AI analyst is unavailable right now. Try again in a minute.',
  };
  const now = deps.now ?? Date.now;
  for (let attempt = 0; attempt < FINAL_ATTEMPTS; attempt += 1) {
    const left = deadline - now();
    if (attempt > 0 && left < RETRY_MIN_MS) break;
    let raw: unknown;
    try {
      raw = await withTimeout(
        deps.invokeLLM({ prompt, response_json_schema: BRIEF_SCHEMA }),
        Math.max(left, MIN_FINAL_MS),
        'Brief call',
      );
    } catch (error) {
      lastFailure = {
        code: 'llm_unavailable',
        error: `The AI analyst is unavailable right now (${errorMessage(error)}). Try again in a minute.`,
      };
      continue;
    }
    const brief = parseBrief(raw);
    if (brief) return { brief };
    lastFailure = { code: 'llm_malformed', error: 'The AI analyst returned an unreadable brief. Try again.' };
  }
  return lastFailure;
}

/** Investigate one company and produce a verified, sourced brief. Never throws. */
export async function runAnalyst(deps: AnalystDeps): Promise<AnalystResult> {
  const sources = sourcesFromSignals(deps.signals);
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.budgetMs ?? BUDGET_MS);
  let steps: Step[] = [];
  try {
    const loop = await planLoop(deps, sources, deadline);
    steps = loop.steps;
    const written = await writeBrief(deps, loop.observations, deadline);
    if (!('brief' in written)) return { ok: false, code: written.code, error: written.error, steps };
    const { kept, dropped } = verifyFindings(written.brief.findings, sources);
    return {
      ok: true,
      dropped,
      analysis: {
        borrower_id: str(deps.borrower.id),
        created_at: new Date().toISOString(),
        summary: written.brief.summary,
        findings: kept,
        findings_dropped: dropped.length,
        open_questions: written.brief.open_questions,
        recommended_action: written.brief.recommended_action,
        steps,
      },
    };
  } catch (error) {
    return { ok: false, code: 'internal_error', error: `Analyst failed: ${errorMessage(error)}`, steps };
  }
}
