// LinkedIn exec check (P2): find the borrower's executives from public search results, find their LinkedIn
// profiles, scrape them with Bright Data, and emit exec_departure when a profile shows an exec role at the
// borrower that ended in the last 180 days.
//   A. find execs     Google web search (Bright Data SERP) -> LLM lists {name, title, quote}; quote must be verbatim
//   B. find profiles  Google web search "<exec>" <company> linkedin -> first linkedin.com/in link naming them
//   C. scrape         Bright Data "LinkedIn people profiles" dataset (sync scrape, all profiles in one call)
//   D. check dates    exec role at the borrower with an end date in the last 180 days -> Signal
// A profile that only shows a different current employer is "unconfirmed", never a signal: parent companies
// and old departures make it unreliable (TGI Fridays' former CEOs all show other employers, from 2023-24).
import { type Borrower, type InvokeLLM, type Log, type Signal, snippetIsExact, withinDays } from "./logic.ts";

export const PEOPLE_DATASET = "gd_l1viktl72bvl7bjuj0"; // "LinkedIn people profiles"
const MAX_EXECS = 3;

export type WebResult = { title: string; link: string; description: string };
export type Exec = { name: string; title: string; quote: string; source_url: string };
export type ProfileHit = { exec: string; query: string; url: string | null; results: WebResult[] };
export type Experience = { title: string; company: string; start_date: string; end_date: string };
export type Profile = { url: string; name: string; current_company: string; experience: Experience[]; error?: string };
export type Check = { exec: string; profile_url: string | null; result: "departed" | "still there" | "unconfirmed" | "no profile"; detail: string };
export type LinkedInRun = { exec_query: string; exec_results: WebResult[]; execs: Exec[]; profile_hits: ProfileHit[]; profiles: Profile[] };
export type Deps = { fetch: typeof fetch; apiKey: string; zone?: string; invokeLLM: InvokeLLM };

const EXEC_TITLE = /\b(ceo|cfo|chief executive|chief financial|president|founder|co-founder|chief operating|coo)\b/i;
const STRONG_TITLE = /\b(ceo|cfo|chief executive|chief financial)\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "Dec 2023" -> 2023-12-01, "2021" -> 2021-01-01, "Present" / "" -> null
export function parseMonthYear(raw: string): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  const m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1])) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-01`;
  const y = s.match(/^(\d{4})$/);
  return y ? `${y[1]}-01-01` : null;
}

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const sameCompanyName = (a: string, b: string) => !!norm(a) && !!norm(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));

// Experience entries come flat ({title, company, start_date, end_date}) or grouped ({company, positions: [...]}).
export function flattenExperience(raw: unknown): Experience[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e: Record<string, unknown>) => {
    const company = String(e.company ?? e.company_name ?? "");
    const positions = Array.isArray(e.positions) && e.positions.length ? (e.positions as Record<string, unknown>[]) : [e];
    return positions.map((p) => ({
      title: String(p.title ?? e.title ?? ""),
      company,
      start_date: String(p.start_date ?? e.start_date ?? ""),
      end_date: String(p.end_date ?? e.end_date ?? ""),
    }));
  });
}

export async function searchWeb(query: string, deps: Deps, timeoutMs = 45000): Promise<WebResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us&brd_json=1`;
  const res = await deps.fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone: deps.zone ?? "mcp_unlocker", url, format: "raw" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Bright Data HTTP ${res.status}`);
  const organic = ((await res.json())?.organic ?? []) as Record<string, string>[];
  return organic.map((o) => ({ title: o.title ?? "", link: o.link ?? "", description: o.description ?? "" }));
}

export function pickProfile(exec: string, results: WebResult[]): string | null {
  const last = norm(exec).split(" ").filter((w) => !/^(jr|sr|ii|iii|iv)$/.test(w)).pop() ?? "";
  const hit = results.find((r) => /linkedin\.com\/in\//.test(r.link) && norm(r.title).includes(last));
  return hit ? hit.link.split("?")[0] : null;
}

const EXEC_SCHEMA = {
  type: "object",
  properties: {
    execs: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, title: { type: "string" }, quote: { type: "string" }, result_index: { type: "integer" } },
        required: ["name", "title", "quote", "result_index"],
      },
    },
  },
  required: ["execs"],
};

export async function findExecs(b: Borrower, results: WebResult[], invokeLLM: InvokeLLM): Promise<Exec[]> {
  const text = results.map((r, i) => `[${i}] ${r.title}\n${r.description}`).join("\n\n");
  const raw = await invokeLLM({
    prompt: `From these search results, list EVERY senior executive (CEO, CFO, president, founder, COO), current or former, of ${b.name}
(website ${b.website_domain ?? "?"}, HQ ${b.hq_city ?? "?"}), most recent first. Ignore people at other companies.
For each: full name, title, the result index, and a quote copied EXACTLY from that result that names them and their role.

${text}`,
    response_json_schema: EXEC_SCHEMA,
  });
  const out = (typeof raw === "string" ? JSON.parse(raw) : raw) as { execs?: { name: string; title: string; quote: string; result_index: number }[] };
  const seen = new Set<string>();
  const execs = (out?.execs ?? []).flatMap((e) => {
    const r = results[e.result_index];
    if (!r || !e.name || seen.has(norm(e.name))) return [];
    const lastName = norm(e.name).split(" ").filter((w) => !/^(jr|sr|ii|iii|iv)$/.test(w)).pop() ?? "";
    if (!snippetIsExact(e.quote, `${r.title}\n${r.description}`) || !norm(e.quote).includes(lastName)) return [];
    seen.add(norm(e.name));
    return [{ name: e.name, title: e.title, quote: e.quote, source_url: r.link }];
  });
  // Execs whose profile is already in the results need no extra search, so check them first.
  const direct = (e: Exec) => (pickProfile(e.name, results) ? 0 : 1);
  return execs.sort((a, z) => direct(a) - direct(z)).slice(0, MAX_EXECS);
}

export async function scrapeProfiles(urls: string[], deps: Deps, timeoutMs = 60000): Promise<Profile[]> {
  if (urls.length === 0) return [];
  const res = await deps.fetch(
    `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${PEOPLE_DATASET}&include_errors=true&format=json`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(urls.map((url) => ({ url }))),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!res.ok) throw new Error(`Bright Data LinkedIn HTTP ${res.status}`);
  const rows = (await res.json()) as Record<string, unknown>[] | Record<string, unknown>;
  return (Array.isArray(rows) ? rows : [rows]).map((r) => ({
    url: String((r.input as { url?: string })?.url ?? r.url ?? r.input_url ?? ""),
    name: String(r.name ?? ""),
    current_company: String(r.current_company_name ?? (r.current_company as { name?: string })?.name ?? ""),
    experience: flattenExperience(r.experience),
    error: r.error ? String(r.error) : undefined,
  }));
}

// Network part, kept separate so a run can be saved and replayed for free.
export async function crawlLinkedIn(b: Borrower, deps: Deps, log: Log = () => {}): Promise<LinkedInRun> {
  const exec_query = `"${b.name}" CEO CFO executive leadership`;
  log(`A. Searching for leadership: ${exec_query}`);
  const exec_results = await searchWeb(exec_query, deps);
  const execs = await findExecs(b, exec_results, deps.invokeLLM);
  log(`A. Executives: ${execs.map((e) => `${e.name} (${e.title})`).join("; ") || "none found"}`);
  const profile_hits = await Promise.all(execs.map(async (e) => {
    const direct = pickProfile(e.name, exec_results);
    if (direct) {
      log(`B. ${e.name}: ${direct} (from leadership results)`);
      return { exec: e.name, query: "(found in leadership search)", url: direct, results: [] };
    }
    // Quoting both name and company returns generic company pages; quote only the name, then try the name alone.
    let query = `"${e.name}" ${b.name} linkedin`;
    let results = await searchWeb(query, deps);
    if (!pickProfile(e.name, results)) {
      query = `"${e.name}" linkedin`;
      results = await searchWeb(query, deps);
    }
    const url = pickProfile(e.name, results);
    log(`B. ${e.name}: ${url ?? "no profile found"}`);
    return { exec: e.name, query, url, results };
  }));
  const urls = [...new Set(profile_hits.map((h) => h.url).filter((u): u is string => !!u))];
  log(`C. Scraping ${urls.length} LinkedIn profile(s)...`);
  const profiles = await scrapeProfiles(urls, deps);
  for (const p of profiles) log(`C. ${p.name || p.url}: now at "${p.current_company || "?"}", ${p.experience.length} dated roles`);
  return { exec_query, exec_results, execs, profile_hits, profiles };
}

// Pure part: decide signals from a crawl. Never writes status.
export function linkedInSignals(b: Borrower, run: LinkedInRun, today = new Date()): { signals: Signal[]; checks: Check[] } {
  const signals: Signal[] = [];
  const checks: Check[] = run.execs.map((e) => {
    const url = run.profile_hits.find((h) => h.exec === e.name)?.url ?? null;
    if (!url) return { exec: e.name, profile_url: null, result: "no profile", detail: "No LinkedIn profile found for this name." };
    const p = run.profiles.find((x) => x.url.replace(/\/$/, "") === url.replace(/\/$/, ""));
    if (!p || p.error) return { exec: e.name, profile_url: url, result: "unconfirmed", detail: p?.error ?? "Profile could not be scraped." };

    const atBorrower = p.experience.filter((x) => sameCompanyName(x.company, b.name) && EXEC_TITLE.test(x.title));
    const current = atBorrower.find((x) => !parseMonthYear(x.end_date));
    if (current) return { exec: e.name, profile_url: url, result: "still there", detail: `${current.title}, ${current.start_date} - Present` };

    const ended = atBorrower.map((x) => ({ ...x, end: parseMonthYear(x.end_date)! })).sort((a, z) => z.end.localeCompare(a.end))[0];
    if (ended && withinDays(ended.end, today, 180)) {
      const now = p.current_company ? `; now at ${p.current_company}` : "";
      signals.push({
        borrower_id: b.id,
        type: "exec_departure",
        severity: STRONG_TITLE.test(ended.title) ? "strong" : "weak",
        date: ended.end,
        title: `${p.name || e.name} left ${ended.title} role (LinkedIn)`,
        snippet: `LinkedIn profile: ${ended.title} at ${ended.company}, ${ended.start_date} - ${ended.end_date}${now}`,
        source_name: "LinkedIn",
        source_url: url,
      });
      return { exec: e.name, profile_url: url, result: "departed", detail: `${ended.title} ended ${ended.end_date}${now}` };
    }
    if (ended) return { exec: e.name, profile_url: url, result: "unconfirmed", detail: `Role ended ${ended.end_date}, older than 180 days` };
    const other = p.current_company && !sameCompanyName(p.current_company, b.name);
    return {
      exec: e.name,
      profile_url: url,
      result: "unconfirmed",
      detail: other ? `Profile shows current employer "${p.current_company}" but no dated role at ${b.name}` : "No dated role at this company on the profile",
    };
  });
  return { signals, checks };
}
