// scoreBorrower (P3): plain-code status rules from CLAUDE.md. No API calls, no LLM.
//
// Input:  { signals: Signal[], today?: "YYYY-MM-DD" }
// Output: { status: "green" | "yellow" | "red", why: string }
//
// Rules (only signals dated in the last 90 days count):
//   RED    = 2+ strong, or 1 strong + 2 weak
//   YELLOW = 1 strong, or 2+ weak
//   GREEN  = otherwise
// Why line: "<Status>: " + up to 2 top signals (strong first, then newest) joined with " + ".

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  [/layoffs?|laid off|job cuts/i, "Layoffs"],
  [/\blien\b/i, "Lien"],
  [/wage (claim|theft)|unpaid wages/i, "Wage claim"],
  [/contract dispute|breach of contract/i, "Contract dispute"],
  [new RegExp(`\\b${SUED}\\b`, "i"), "Lawsuit"],
];
const MAX_TITLE = 48;

// A headline no rule names: keep its first words (at a word boundary) rather than a generic label, so two
// different events never read the same.
function shortTitle(title: string): string {
  if (title.length <= MAX_TITLE) return title;
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

// hiring_drop is a computed fact as of the refresh, so its date adds nothing to the why line.
function label(s: Signal): string {
  const name = eventName(s);
  return s.type === "hiring_drop" ? name : `${name} (${shortDate(s.date)})`;
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

export function scoreBorrower(signals: Signal[], today: string = todayIso()): { status: Status; why: string } {
  const recent = dedupeSignals(recentSignals(signals, today));
  const strong = recent.filter((s) => s.severity === "strong").length;
  const weak = recent.length - strong;

  let status: Status = "green";
  if (strong >= 2 || (strong === 1 && weak >= 2)) status = "red";
  else if (strong === 1 || weak >= 2) status = "yellow";

  if (status === "green") return { status, why: "Green: no warning signs in the last 90 days." };

  const top = [...recent].sort(byRank).slice(0, 2).map(label);

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
