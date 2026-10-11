// scoreBorrower (P3): plain-code status rules from CLAUDE.md. No API calls, no LLM.
//
// Input:  { signals: Signal[], today?: "YYYY-MM-DD" }
// Output: { status: "green" | "yellow" | "red", why: string }
//
// Rules (only signals dated in the last 90 days count):
//   RED    = 2+ strong, or 1 strong + 2 weak
//   YELLOW = 1 strong, or 2+ weak
//   GREEN  = otherwise
// Why line: "<Status>: " + up to 2 top signals joined with " + ", ranked by impact: strong before weak; within a
// severity, existential events (bankruptcy, liquidation, closure/shutdown, WARN, layoffs with a job count, CEO/CFO
// exit) first; then newest. The same event reported by several outlets counts once (sameEvent).

export type Severity = "strong" | "weak";
export type SignalType = "hiring_drop" | "review_distress" | "exec_departure" | "legal_layoffs";
export type Status = "green" | "yellow" | "red";

export interface Signal {
  borrower_id?: string;
  type: SignalType;
  severity: Severity;
  date: string; // YYYY-MM-DD
  title: string;
  snippet?: string;
  source_name?: string;
  source_url?: string;
}

export const WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-01" or "2026-10-01T00:00:00Z" (the calendar date as written). Impossible dates like 2026-02-30 are null.
function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(typeof s === "string" ? s.trim() : "");
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
}

// The bank's business day (America/Los_Angeles), so an evening refresh never counts "tomorrow" in UTC.
export function todayIso(now: Date = new Date(), timeZone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// "2026-09-12" -> "Sep 12"
function shortDate(s: string): string {
  const t = parseDay(s);
  if (t === null) return s;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// News headlines are long ("Rivian (RIVN) CFO steps down for GE Vernova amid ..."),
// so for news signals the why line names the event instead of quoting the
// headline. Titles our own code writes (hiring_drop, review_distress) are short
// already and stay as they are.
const ROLES: [RegExp, string][] = [
  [/\bCEO\b|chief executive/i, "CEO"],
  [/\bCFO\b|chief financial/i, "CFO"],
  [/\bCOO\b|chief operating/i, "COO"],
  [/\bpresident\b/i, "President"],
  [/\bfounder\b/i, "Founder"],
];
const SUED = "(sue|sues|sued|suing|lawsuit|suit)";
const LEGAL_EVENTS: [RegExp, string][] = [
  [/WARN Act.*investigat|investigat.*WARN Act/i, "WARN Act investigation"],
  [/WARN (notice|Act)/i, "WARN notice"],
  [/bankrupt|chapter (7|11)\b/i, "Bankruptcy filing"],
  [/wrongful[- ]death/i, "Wrongful-death lawsuit"],
  [new RegExp(`\\b(lender|bank|creditor)s?\\b.*\\b${SUED}\\b|\\b${SUED}\\b.*\\b(lender|bank|creditor)s?\\b`, "i"), "Lender lawsuit"],
  [new RegExp(`\\b(supplier|vendor)s?\\b.*\\b${SUED}\\b|\\b${SUED}\\b.*\\b(supplier|vendor)s?\\b`, "i"), "Supplier lawsuit"],
  [/\bclos(e|es|ing|ure)\b.*\b(factory|plant|facility|site|mill|brewery|warehouse)s?\b|\b(factory|plant|facility|site|mill|brewery|warehouse)s?\b.*\bclos(e|es|ing|ure)\b/i, "Plant closure"],
  [/pulls? (the )?plug|shut(s|ting)? down|wind(s|ing)? down|ceases? operations/i, "Shutdown"],
  [/layoffs?|laid off|\blay(s|ing)? off\b|job cuts|\bcut(s|ting)?\b.{0,40}\b(jobs|workers|employees|staff|positions)\b/i, "Layoffs"],
  [/\blien\b/i, "Lien"],
  [/wage (claim|theft)|unpaid wages/i, "Wage claim"],
  [/contract dispute|breach of contract/i, "Contract dispute"],
  [new RegExp(`\\b${SUED}\\b`, "i"), "Lawsuit"],
];
const MAX_TITLE = 64;

// Clause boundaries: a comma, colon, dash, or a conjunction that starts a trailing clause.
const CLAUSE_BOUNDARY = /[,;:]\s|\s[–—-]\s|\s(?:amid|as|after|while)\s/gi;

// A headline no rule names: keep its first words (at a word boundary) rather than a generic label, so two
// different events never read the same. A clean clause break reads complete, so it gets no ellipsis.
export function shortTitle(title: string): string {
  if (title.length <= MAX_TITLE) return title;
  let clauseEnd: number | null = null;
  for (const m of title.matchAll(CLAUSE_BOUNDARY)) {
    if (m.index >= 24 && m.index <= MAX_TITLE) clauseEnd = m.index;
  }
  if (clauseEnd !== null) return title.slice(0, clauseEnd);
  const cut = title.slice(0, MAX_TITLE + 1);
  const words = cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[\s,;:.-]+$/, "");
  return `${words}…`;
}

export function eventName(s: Signal): string {
  const title = (s.title ?? "").trim();
  if (s.type === "exec_departure") {
    const role = ROLES.find(([re]) => re.test(title));
    if (role) return `${role[1]} departure`;
    return shortTitle(title);
  }
  if (s.type === "legal_layoffs") {
    const event = LEGAL_EVENTS.find(([re]) => re.test(title));
    if (event) return event[1];
    return shortTitle(title);
  }
  return title;
}

// "Major U.S. distributor cuts 1,278 jobs amid liquidation risk" -> "Cuts 1,278 jobs amid liquidation risk": a layoff
// headline with a job count is the fact a banker needs, so the why line keeps it from the verb on.
const JOB_COUNT = /\b(\d{1,3}(?:,\d{3})+|\d+)\s+(?:[A-Za-z-]+\s+)?(?:jobs|workers|employees|positions|staff|people|roles)\b/i;
const LAYOFF_CLAUSE = /\b(?:cuts?|cutting|lays? off|laying off|eliminat(?:es|ing)|slash(?:es|ing)?)\b.*$/i;
const MAX_CLAUSE = 64;

function layoffClause(title: string): string | null {
  if (!JOB_COUNT.test(title)) return null;
  const m = LAYOFF_CLAUSE.exec(title);
  if (!m || !JOB_COUNT.test(m[0])) return null;
  const clause = m[0].length <= MAX_CLAUSE ? m[0] : `${m[0].slice(0, MAX_CLAUSE).replace(/\s+\S*$/, "")}…`;
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

// hiring_drop is a computed fact as of the refresh, so its date adds nothing to the why line.
function label(s: Signal): string {
  const name = eventName(s);
  if (s.type === "hiring_drop") return name;
  const lead = name === "Layoffs" ? layoffClause((s.title ?? "").trim()) : null;
  return `${lead ?? name} (${shortDate(s.date)})`;
}

// Existential events: the facts that most threaten repayment. They lead the why line within their severity.
const EXISTENTIAL_LEGAL = /bankrupt|chapter (7|11)\b|liquidat|receivership|insolven|\bclos(e|es|ing|ure)\b|shut(s|ting)? down|wind(s|ing)? down|ceases? operations|pulls? (the )?plug|\bWARN\b/i;
function isExistential(s: Signal): boolean {
  const title = s.title ?? "";
  if (s.type === "exec_departure") return /\b(CEO|CFO)\b|chief (executive|financial)/i.test(title);
  if (s.type === "legal_layoffs") return EXISTENTIAL_LEGAL.test(title) || (eventName(s) === "Layoffs" && JOB_COUNT.test(title));
  return false;
}

// Strongest first, then the worst event, then newest. Used for the why line only.
function byImpact(a: Signal, b: Signal): number {
  if (a.severity !== b.severity) return a.severity === "strong" ? -1 : 1;
  const ea = isExistential(a), eb = isExistential(b);
  if (ea !== eb) return ea ? -1 : 1;
  return (parseDay(b.date) ?? 0) - (parseDay(a.date) ?? 0);
}

// Signals with a valid date and severity, dated within the last WINDOW_DAYS days (inclusive), not in the future.
export function recentSignals(signals: Signal[], today: string = todayIso()): Signal[] {
  const now = parseDay(today);
  if (now === null) throw new Error(`Invalid today: ${today}`);
  return (signals ?? []).filter((s) => {
    const t = parseDay(s?.date);
    if (t === null) return false;
    if (s.severity !== "strong" && s.severity !== "weak") return false;
    const age = (now - t) / DAY_MS;
    return age >= 0 && age <= WINDOW_DAYS;
  });
}

// Strongest first, then newest.
function byRank(a: Signal, b: Signal): number {
  if (a.severity !== b.severity) return a.severity === "strong" ? -1 : 1;
  return (parseDay(b.date) ?? 0) - (parseDay(a.date) ?? 0);
}

const normText = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normUrl = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");

// The same event reported twice counts once: same type and either the same link and title, or the same title on
// the same day. The strongest copy is kept. (A Glassdoor strong and weak signal can share a link, so a link
// alone is not enough.)
export function dedupeSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const s of [...signals].sort(byRank)) {
    const title = normText(s.title);
    const keys = [`${s.type}|day|${title}|${parseDay(s.date)}`];
    if (s.source_url) keys.push(`${s.type}|url|${normUrl(s.source_url)}|${title}`);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(s);
  }
  return out;
}

// ---- Same event, several outlets --------------------------------------------------------------------------------
// Two news signals are one event when they have the same type, are dated within SAME_EVENT_DAYS, belong to the same
// event family (closure/shutdown/layoffs/WARN, or the same named executive exit), and either name the same place
// (with job counts, when both give one, within ±25%) or give the same job count. Conservative on purpose: a false
// merge hides a real event, a missed merge only double-counts one.
export const SAME_EVENT_DAYS = 14;
const COUNT_TOLERANCE = 0.25;
const JOB_LOSS = new Set(["Plant closure", "Shutdown", "Layoffs", "WARN notice"]);
const FACILITY = "(?:plant|factory|facility|site|mill|brewery|warehouse|distribution center|headquarters|hq|store|office)s?";
const PLACE = "([A-Z][A-Za-z.]+(?:\\s+[A-Z][A-Za-z.]+){0,2})";
const PLACE_BEFORE_FACILITY = new RegExp(`${PLACE}\\s+${FACILITY}\\b`, "g");
const PLACE_AFTER_IN = new RegExp(`\\b(?:in|at|near)\\s+${PLACE}`, "g");
const NOT_PLACE = new Set(["the", "its", "their", "his", "her", "our", "a", "an", "first", "new", "main", "original", "oldest", "last", "only", "now", "it", "this", "that"]);

function places(text: string): Set<string> {
  const out = new Set<string>();
  for (const re of [PLACE_BEFORE_FACILITY, PLACE_AFTER_IN]) {
    for (const m of text.matchAll(re)) {
      const words = m[1].split(/\s+/).filter((w) => !NOT_PLACE.has(w.toLowerCase()) && !/['’]s$/.test(w));
      // "Kitchen Santa Rosa" (company word run into the place) also yields "santa rosa" and "rosa".
      for (let i = 0; i < words.length; i += 1) out.add(words.slice(i).join(" ").toLowerCase());
    }
  }
  return out;
}

function jobCount(text: string): number | null {
  const m = JOB_COUNT.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

function eventFamily(s: Signal): string | null {
  const name = eventName(s);
  if (s.type === "legal_layoffs" && JOB_LOSS.has(name)) return "job_loss";
  if (s.type === "exec_departure" && name.endsWith(" departure")) return name;
  return null;
}

export function sameEvent(a: Signal, b: Signal): boolean {
  if (a.type !== b.type) return false;
  const ta = parseDay(a.date), tb = parseDay(b.date);
  if (ta === null || tb === null || Math.abs(ta - tb) / DAY_MS > SAME_EVENT_DAYS) return false;
  const fam = eventFamily(a);
  if (!fam || fam !== eventFamily(b)) return false;
  if (fam !== "job_loss") return true; // the same named role (e.g. CFO) leaving twice in two weeks is one exit
  const textA = `${a.title ?? ""}. ${a.snippet ?? ""}`, textB = `${b.title ?? ""}. ${b.snippet ?? ""}`;
  const ca = jobCount(textA), cb = jobCount(textB);
  const countsAgree = ca !== null && cb !== null && Math.abs(ca - cb) / Math.max(ca, cb) <= COUNT_TOLERANCE;
  if (ca !== null && cb !== null && !countsAgree) return false;
  const pb = places(textB);
  if ([...places(textA)].some((p) => pb.has(p))) return true;
  return ca !== null && ca === cb && ca >= 50;
}

// Strongest copy first, then the earliest report: that copy is kept and names the event in the why line.
function byStrengthThenEarliest(a: Signal, b: Signal): number {
  if (a.severity !== b.severity) return a.severity === "strong" ? -1 : 1;
  return (parseDay(a.date) ?? 0) - (parseDay(b.date) ?? 0);
}

export function mergeSameEvents(signals: Signal[]): Signal[] {
  const kept: Signal[] = [];
  for (const s of [...signals].sort(byStrengthThenEarliest)) {
    if (!kept.some((k) => sameEvent(k, s))) kept.push(s);
  }
  return kept;
}

export function scoreBorrower(signals: Signal[], today: string = todayIso()): { status: Status; why: string } {
  const recent = mergeSameEvents(dedupeSignals(recentSignals(signals, today)));
  const strong = recent.filter((s) => s.severity === "strong").length;
  const weak = recent.length - strong;

  let status: Status = "green";
  if (strong >= 2 || (strong === 1 && weak >= 2)) status = "red";
  else if (strong === 1 || weak >= 2) status = "yellow";

  if (status === "green") return { status, why: "Green: no warning signs in the last 90 days." };

  const top = [...recent].sort(byImpact).slice(0, 2).map(label);

  const name = status === "red" ? "Red" : "Yellow";
  return { status, why: `${name}: ${top.join(" + ")}.` };
}

// Base44 backend function. refreshBorrower invokes it with { signals, today }.
export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    return Response.json(scoreBorrower(body?.signals ?? [], body?.today ?? todayIso()));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
