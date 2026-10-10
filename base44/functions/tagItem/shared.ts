// Copied from newsSignals/logic.ts: Base44 bundles each function folder separately
// (no imports across function folders). Keep in sync with the original.

// newsSignals logic (P2). Pure functions plus the network steps, with fetch / LLM injected so tests and the
// local console run the exact code Base44 runs. See entry.ts for the HTTP wrapper.
//
//   1. crawl    Bright Data SERP (zone mcp_unlocker): two Google News searches, last 6 months, parsed JSON
//   2. clean    dedupe by link, parse "3 days ago" / "Jul 9, 2026", keep the last 180 days
//   3. analyze  one LLM call tags every article: {reason, relevant, same_company, signal_type, severity, snippet}
//   4. verify   same company, type matches the article (an exec title for exec_departure), snippet is verbatim
// Returns Signal[] (exec_departure + legal_layoffs). Never writes status.

export interface Borrower {
  id?: string;
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
}

export type SignalType = "exec_departure" | "legal_layoffs";
export type Severity = "strong" | "weak";

export interface Signal {
  borrower_id?: string;
  type: SignalType;
  severity: Severity;
  date: string;
  title: string;
  snippet: string;
  source_name: string;
  source_url: string;
}

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  description: string;
  date: string;
}

export interface Tag {
  relevant: boolean;
  same_company: boolean;
  signal_type: SignalType | null;
  severity: Severity | null;
  snippet: string;
  reason?: string; // the model's one-line explanation; shown in logs / console, never saved
}

export interface NewsBatch {
  type: SignalType;
  source: "News" | "Legal";
  query: string;
  items: NewsItem[];
}

export interface Trace {
  query_type: SignalType;
  item: NewsItem;
  date: string | null;
  tag: Tag | null;
  kept: boolean;
  reason: string;
}

export type LLMParams = { prompt: string; response_json_schema: Record<string, unknown> };
export type InvokeLLM = (params: LLMParams) => Promise<unknown>;
export type Log = (msg: string) => void;

// ---------- pure helpers (tested) ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Google News dates: "3 days ago", "1 month ago", "yesterday", "Jul 9, 2026". Returns YYYY-MM-DD or null.
export function parseNewsDate(raw: string, today: Date): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "yesterday") return ymd(new Date(today.getTime() - 86400000));
  const rel = s.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (rel) {
    const n = Number(rel[1]);
    const d = new Date(today);
    const unit = rel[2];
    if (unit === "day") d.setUTCDate(d.getUTCDate() - n);
    if (unit === "week") d.setUTCDate(d.getUTCDate() - 7 * n);
    if (unit === "month") d.setUTCMonth(d.getUTCMonth() - n);
    if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() - n);
    return ymd(d);
  }
  const abs = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})$/);
  if (abs && MONTHS.includes(abs[1])) return ymd(new Date(Date.UTC(Number(abs[3]), MONTHS.indexOf(abs[1]), Number(abs[2]))));
  return null;
}

export function withinDays(date: string, today: Date, days: number): boolean {
  const age = (today.getTime() - new Date(date + "T00:00:00Z").getTime()) / 86400000;
  return age >= 0 && age <= days;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// Snippet guard: the snippet must appear verbatim in the source (whitespace collapsed).
export function snippetIsExact(snippet: string, source: string): boolean {
  const s = squash(snippet ?? "");
  return s.length > 0 && squash(source).includes(s);
}

export const itemText = (i: NewsItem) => `${i.title}\n${i.description}`;

const EXEC_TITLE = /\b(ceo|cfo|coo|chief [a-z]+ officer|chief executive|chief financial|president|founder|co-founder|chairman|executive)\b/i;

export function slimNews(raw: unknown): NewsItem[] {
  const news = (raw as { news?: Record<string, string>[] })?.news ?? [];
  return news.map((n) => ({
    title: n.title ?? "",
    link: n.link ?? "",
    source: n.source ?? "",
    description: n.description ?? "",
    date: n.date ?? "",
  }));
}

export const QUERIES: { type: SignalType; source: "News" | "Legal"; q: (name: string) => string }[] = [
  { type: "exec_departure", source: "News", q: (n) => `"${n}" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs)` },
  { type: "legal_layoffs", source: "Legal", q: (n) => `"${n}" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)` },
];

// ---------- tagging prompt (shared with tagItem) ----------

export const TAG_SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          reason: { type: "string" },
          relevant: { type: "boolean" },
          same_company: { type: "boolean" },
          signal_type: { type: ["string", "null"], enum: ["exec_departure", "legal_layoffs", "review_distress", null] },
          severity: { type: ["string", "null"], enum: ["strong", "weak", null] },
          snippet: { type: "string" },
        },
        required: ["id", "reason", "relevant", "same_company", "signal_type", "severity", "snippet"],
      },
    },
  },
  required: ["tags"],
};

export function tagPrompt(items: { text: string; url: string }[], b: Borrower, kind = "news items"): string {
  return `You tag ${kind} for a bank credit officer deciding whether a company is a credit risk.

Company: ${b.name} | website: ${b.website_domain ?? "?"} | HQ: ${b.hq_city ?? "?"}, ${b.hq_state ?? "?"}

For EACH item return {id, reason, relevant, same_company, signal_type, severity, snippet}:
- reason: one short sentence explaining your decision (which company, what event, is it new).
- same_company: true only if the item is clearly about this company, not a different company with a similar name. If unsure, false.
- relevant: true only if the item REPORTS a new negative event for this company (an executive leaving, a lawsuit, lien, WARN notice, layoffs, closures, bankruptcy filing, missed or late pay). An item about something else that only mentions a past event in passing (e.g. "after its 2024 bankruptcy") is NOT relevant. Good news (openings, expansion, promotions) is NOT relevant.
- signal_type: exec_departure (a named senior executive leaves), legal_layoffs (lawsuit, lien, WARN notice, layoffs, closures, bankruptcy), or review_distress (an employee review describing layoffs, furloughs, late or missed pay, or closing). null if not relevant. A store or restaurant closure is legal_layoffs, never exec_departure.
- severity: exec_departure: CEO or CFO = strong, other senior roles = weak. legal_layoffs: WARN notice, a new bankruptcy filing, or a lawsuit BY a lender or supplier AGAINST the company = strong; others = weak. review_distress = strong. null if not relevant.
- snippet: copy ONE sentence or phrase EXACTLY, character for character, from the item text, that shows the event. Never paraphrase or shorten words. Empty string if not relevant.

Items (JSON):
${JSON.stringify(items.map((it, id) => ({ id, text: it.text, url: it.url })), null, 1)}`;
}

const EMPTY: Tag = { relevant: false, same_company: false, signal_type: null, severity: null, snippet: "" };

// Base44's InvokeLLM with response_json_schema resolves to a parsed object; some paths return a JSON string.
export function alignTags(n: number, raw: unknown): Tag[] {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const tags = ((parsed as { tags?: unknown })?.tags ?? []) as (Tag & { id: number })[];
  return Array.from({ length: n }, (_, i) => {
    const t = tags.find((x) => x?.id === i);
    return t
      ? { relevant: !!t.relevant, same_company: !!t.same_company, signal_type: t.signal_type ?? null, severity: t.severity ?? null, snippet: t.snippet ?? "", reason: t.reason }
      : EMPTY;
  });
}

export async function tagMany(items: { text: string; url: string }[], b: Borrower, invokeLLM: InvokeLLM, kind?: string): Promise<Tag[]> {
  if (items.length === 0) return [];
  return alignTags(items.length, await invokeLLM({ prompt: tagPrompt(items, b, kind), response_json_schema: TAG_SCHEMA }));
}

// ---------- pipeline ----------

export async function searchNews(query: string, deps: { fetch: typeof fetch; apiKey: string; zone?: string }, timeoutMs = 60000): Promise<NewsItem[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&tbs=qdr:m6&hl=en&gl=us&brd_json=1`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await deps.fetch("https://api.brightdata.com/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ zone: deps.zone ?? "mcp_unlocker", url, format: "raw" }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return slimNews(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function crawlNews(b: Borrower, deps: { fetch: typeof fetch; apiKey: string; zone?: string }, log: Log = () => {}): Promise<NewsBatch[]> {
  return await Promise.all(QUERIES.map(async ({ type, source, q }) => {
    const query = q(b.name);
    try {
      const items = await searchNews(query, deps);
      log(`1. Crawl ${type}: ${items.length} articles`);
      return { type, source, query, items };
    } catch (e) {
      throw new Error(`${source}: ${e instanceof Error ? e.message : e}`);
    }
  }));
}

export async function signalsFromBatches(
  b: Borrower,
  batches: NewsBatch[],
  invokeLLM: InvokeLLM,
  today = new Date(),
  log: Log = () => {},
): Promise<{ signals: Signal[]; trace: Trace[] }> {
  const trace: Trace[] = [];
  const toTag: { item: NewsItem; date: string; row: Trace }[] = [];
  const seen = new Set<string>();

  for (const batch of batches) {
    for (const item of batch.items) {
      const date = parseNewsDate(item.date, today);
      const row: Trace = { query_type: batch.type, item, date, tag: null, kept: false, reason: "" };
      trace.push(row);
      if (seen.has(item.link)) row.reason = "duplicate link";
      else if (!date) row.reason = `unparsed date "${item.date}"`;
      else if (!withinDays(date, today, 180)) row.reason = "older than 180 days";
      else toTag.push({ item, date, row });
      seen.add(item.link);
    }
  }
  log(`2. Clean: ${trace.length} in, ${toTag.length} to analyze`);
  log(`3. Analyze: ${toTag.length} articles in one LLM call`);

  const tags = await tagMany(toTag.map(({ item }) => ({ text: itemText(item), url: item.link })), b, invokeLLM);

  const signals: Signal[] = [];
  toTag.forEach(({ item, date, row }, i) => {
    const tag = tags[i];
    row.tag = tag;
    const text = itemText(item);
    if (!tag.relevant) row.reason = "not relevant";
    else if (!tag.same_company) row.reason = "not the same company";
    else if (tag.signal_type !== "exec_departure" && tag.signal_type !== "legal_layoffs") row.reason = `wrong type ${tag.signal_type}`;
    else if (!tag.severity) row.reason = "missing severity";
    else if (tag.signal_type === "exec_departure" && !EXEC_TITLE.test(text)) row.reason = "exec_departure but no executive title in the article";
    else if (!snippetIsExact(tag.snippet, text)) row.reason = "snippet guard: not an exact quote";
    else {
      row.kept = true;
      row.reason = "kept";
      signals.push({
        borrower_id: b.id,
        type: tag.signal_type,
        severity: tag.severity,
        date,
        title: item.title,
        snippet: squash(tag.snippet),
        source_name: item.source,
        source_url: item.link,
      });
    }
    log(`${row.kept ? "KEEP" : "drop"} ${item.title.slice(0, 80)} -> ${row.reason}${tag.reason ? ` | model: "${tag.reason}"` : ""}`);
  });
  log(`4. Verify: ${signals.length} signals`);

  signals.sort((a, z) => z.date.localeCompare(a.date));
  return { signals, trace };
}
