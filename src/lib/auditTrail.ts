// Per-company audit trail: one chronological log (newest first) built only from records the viewer can
// already load (Borrower, Signal, CheckRun, Analysis, LenderCheck, CashflowReview, Decision). Nothing is
// invented: the only status entry is the one the company record holds (status + why at last_refreshed).
// Pure functions; the AuditTrail component loads the records and renders / exports the entries.

type Rec = Record<string, any>;

export interface AuditRecords {
  borrower?: Rec | null;
  signals?: Rec[];
  checkRuns?: Rec[];
  analyses?: Rec[];
  lenderChecks?: Rec[];
  cashflowReviews?: Rec[];
  decisions?: Rec[];
}

export type AuditKind = "status" | "check_run" | "signal" | "analysis" | "lender_check" | "cashflow" | "decision";

export interface AuditEntry {
  at: string; // ISO timestamp (or YYYY-MM-DD when only a date is known)
  kind: AuditKind;
  actor: string;
  event: string;
  details: string;
  source_url: string;
  count?: number; // identical consecutive check entries folded into this one (>= 2); `at` is the latest
}

export const ACTOR_SYSTEM = "System check";
export const ACTOR_AI = "AI news summary · quotes checked by code";
export const ACTOR_GUEST = "Guest (demo)";

const SIGNAL_LABELS: Record<string, string> = {
  hiring_drop: "Sharp drop in job postings",
  review_distress: "Employee reviews report trouble",
  exec_departure: "Executive change",
  legal_layoffs: "Lawsuit, layoffs or closure",
};
const STATUS_LABELS: Record<string, string> = { red: "Red", yellow: "Yellow", green: "Green" };
const DECISION_LABELS: Record<string, string> = {
  request_documents: "Request documents",
  proceed: "Proceed",
  watchlist: "Watchlist",
  decline: "Decline",
};
const ACTION_LABELS: Record<string, string> = {
  proceed: "proceed",
  request_documents: "request documents",
  escalate: "escalate",
};
const CASHFLOW_METHODS: Record<string, string> = {
  csv: "parsed by a fixed CSV parser (code)",
  sandbox: "parsed in an isolated sandbox by a fixed script",
  extract: "read by file extraction, then checked by code",
  llm: "read by AI (fallback), then lenders and late payments found by code",
};

const SEVERITY_LABELS = { strong: "serious", weak: "minor" } as const;
const severityLabel = (v: unknown) => (v === "strong" ? SEVERITY_LABELS.strong : SEVERITY_LABELS.weak);

const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : /(s|sh|ch|x)$/.test(word) ? "es" : "s"}`;
const join = (parts: string[]) => parts.filter(Boolean).join(" ");
const sentence = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s);
const safeUrl = (v: unknown) => (/^https?:\/\//i.test(text(v)) ? text(v) : "");

// Base44's created_date / updated_date are UTC but carry no zone
// ("2026-10-10T23:28:00.000000"), and a browser reads such a string as local
// time: 7 hours late in California. Mark those as UTC; date-only values and
// values that already have a zone are left alone.
function asUtc(s: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s;
}

// One date style everywhere in the trail: "Oct 10, 5:42 PM" (local time), or "Sep 25" for a bare date.
// The year is added only when it is not the current year.
export function formatTrailDate(at: string, now: Date = new Date()): string {
  const s = text(at);
  if (!s) return "Unknown";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(dateOnly ? `${s}T00:00:00` : asUtc(s));
  if (Number.isNaN(d.getTime())) return s;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  if (!dateOnly) { opts.hour = "numeric"; opts.minute = "2-digit"; }
  return d.toLocaleString("en-US", opts);
}

function when(...candidates: unknown[]): string {
  for (const c of candidates) {
    const s = asUtc(text(c));
    if (s && !Number.isNaN(Date.parse(s))) return s;
  }
  return "";
}

function statusEntry(b: Rec | null | undefined): AuditEntry[] {
  if (!b?.last_refreshed) return [];
  const label = STATUS_LABELS[b.status] ?? "Not checked";
  const unavailable: string[] = Array.isArray(b.sources_unavailable) ? b.sources_unavailable : [];
  const sources = unavailable.length ? `Sources unavailable: ${unavailable.join(", ")}.` : "All four sources answered.";
  return [{
    at: b.last_refreshed,
    kind: "status",
    actor: ACTOR_SYSTEM,
    event: `Status set to ${label} by the fixed rules`,
    details: join([sentence(text(b.why)), sources, ""]),
    source_url: "",
  }];
}

function droppedReasons(articles: Rec[]): string {
  const counts = new Map<string, number>();
  articles.filter((a) => a?.decision === "dropped").forEach((a) => {
    const why = text(a.why) || text(a.reason) || "no reason recorded";
    counts.set(why, (counts.get(why) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([why, n]) => `${why} (${n})`).join("; ");
}

function checkRunEntry(r: Rec): AuditEntry {
  const searches: Rec[] = Array.isArray(r.searches) ? r.searches : [];
  const articles: Rec[] = Array.isArray(r.articles) ? r.articles : [];
  const ok = searches.filter((s) => s?.ok).length;
  const kept = articles.filter((a) => a?.decision === "kept").length;
  const dropped = articles.filter((a) => a?.decision === "dropped").length;
  const reasons = droppedReasons(articles);
  const state = r.status === "failed" ? "failed" : r.status === "running" ? "started (not finished)" : "finished";
  const details = [
    searches.length ? `${ok} of ${plural(searches.length, "search")} answered${ok < searches.length ? `, ${searches.length - ok} unavailable` : ""}.` : "",
    `${plural(articles.length, "article")} found: ${kept} confirmed, ${dropped} set aside.`,
    reasons ? `Set aside because: ${reasons}.` : "",
    typeof r.signal_count === "number" ? `${plural(r.signal_count, "warning sign")} saved.` : "",
    r.error ? `Error: ${text(r.error)}.` : "",
  ];
  return {
    at: when(r.finished_at, r.updated_at, r.started_at, r.created_date),
    kind: "check_run",
    actor: ACTOR_SYSTEM,
    event: `${text(r.source) || "News"} and legal check ${state}`,
    details: join(details),
    source_url: "",
  };
}

function signalEntry(s: Rec): AuditEntry {
  const label = SIGNAL_LABELS[s.type] ?? text(s.type);
  const quote = text(s.snippet);
  return {
    at: when(s.created_date, s.date),
    kind: "signal",
    actor: ACTOR_SYSTEM,
    event: `Warning sign found: ${label} (${severityLabel(s.severity)})`,
    details: join([
      s.date ? `Dated ${formatTrailDate(text(s.date))}.` : "",
      sentence(text(s.title)),
      quote ? `Quote: "${quote}"` : "",
      s.source_name ? `Source: ${text(s.source_name)}.` : "",
    ]),
    source_url: safeUrl(s.source_url),
  };
}

function analysisEntry(a: Rec): AuditEntry {
  const findings: Rec[] = Array.isArray(a.findings) ? a.findings : [];
  const dropped = Number(a.findings_dropped) || 0;
  return {
    at: when(a.created_at, a.created_date),
    kind: "analysis",
    actor: ACTOR_AI,
    event: `AI news summary written (recommends: ${ACTION_LABELS[a.recommended_action] ?? text(a.recommended_action)})`,
    details: join([
      sentence(text(a.summary)),
      `${plural(findings.length, "finding")} confirmed with quotes found word for word in the source; ${dropped} set aside because the quote was not in the source.`,
    ]),
    source_url: safeUrl(findings[0]?.source_url),
  };
}

function lenderCheckEntry(c: Rec): AuditEntry {
  const searched: Rec[] = Array.isArray(c.searched) ? c.searched : [];
  const ok = searched.filter((s) => s?.ok).length;
  const lenders: Rec[] = Array.isArray(c.lenders) ? c.lenders : [];
  return {
    at: when(c.created_at, c.created_date),
    kind: "lender_check",
    actor: ACTOR_AI,
    event: `Other-lenders check: ${plural(Number(c.lender_count) || 0, "lender")} found`,
    details: join([
      sentence(text(c.summary)),
      searched.length ? `${ok} of ${plural(searched.length, "search")} answered.` : "",
      lenders.length ? `Lenders: ${lenders.map((l) => text(l?.name)).filter(Boolean).join(", ")}.` : "",
    ]),
    source_url: safeUrl(lenders[0]?.evidence?.[0]?.source_url),
  };
}

function cashflowEntry(r: Rec): AuditEntry {
  const method = CASHFLOW_METHODS[r.extraction_method] ?? "parsed";
  const flags: Rec[] = Array.isArray(r.flags) ? r.flags : [];
  return {
    at: when(r.created_at, r.created_date),
    kind: "cashflow",
    actor: r.extraction_method === "llm" ? ACTOR_AI : ACTOR_SYSTEM,
    event: "Cash-flow statement reviewed",
    details: join([
      `Statement ${method}.`,
      typeof r.transaction_count === "number" ? `${plural(r.transaction_count, "transaction")}${r.period_start ? ` from ${formatTrailDate(text(r.period_start))} to ${formatTrailDate(text(r.period_end))}` : ""}.` : "",
      sentence(text(r.summary)),
      flags.length ? `Flags: ${flags.map((f) => `${text(f?.text)} (${severityLabel(f?.severity)})`).join("; ")}.` : "",
    ]),
    source_url: safeUrl(r.file_url),
  };
}

function decisionEntry(d: Rec): AuditEntry {
  const docs: Rec[] = Array.isArray(d.documents_requested) ? d.documents_requested : [];
  return {
    at: when(d.created_at, d.created_date),
    kind: "decision",
    actor: text(d.decided_by) || ACTOR_GUEST,
    event: `Decision recorded: ${DECISION_LABELS[d.decision] ?? text(d.decision)}`,
    details: join([
      d.note ? `Note: ${sentence(text(d.note))}` : "",
      docs.length ? `Documents requested: ${docs.map((x) => join([text(x?.item), x?.reason ? `(${text(x.reason)})` : ""])).join("; ")}.` : "",
      d.follow_up_date ? `Follow up by ${formatTrailDate(text(d.follow_up_date))}.` : "",
    ]),
    source_url: safeUrl(docs.find((x) => safeUrl(x?.source_url))?.source_url),
  };
}

const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

// Every record becomes one entry, newest first. Entries with no usable time sort last.
export function buildAuditTrail(records: AuditRecords): AuditEntry[] {
  const entries: AuditEntry[] = [
    ...statusEntry(records?.borrower),
    ...list(records?.checkRuns).map(checkRunEntry),
    ...list(records?.signals).map(signalEntry),
    ...list(records?.analyses).map(analysisEntry),
    ...list(records?.lenderChecks).map(lenderCheckEntry),
    ...list(records?.cashflowReviews).map(cashflowEntry),
    ...list(records?.decisions).map(decisionEntry),
  ];
  const time = (e: AuditEntry) => (e.at ? Date.parse(e.at) : Number.NEGATIVE_INFINITY);
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => time(b.e) - time(a.e) || a.i - b.i)
    .map(({ e }) => e);
}

// Folds runs of identical, adjacent check entries (same event and details) into one row for display and
// export: the newest time, a count, and a plain "Checked N times" note. Nothing else is merged.
export function collapseRepeatedChecks(entries: AuditEntry[]): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const e of entries ?? []) {
    const prev = out[out.length - 1];
    if (prev && e.kind === "check_run" && prev.kind === "check_run" && prev.event === e.event && prev.details === e.details) {
      out[out.length - 1] = { ...prev, count: (prev.count ?? 1) + 1 };
    } else {
      out.push(e);
    }
  }
  return out.map((e) => (e.count && e.count > 1
    ? { ...e, details: join([e.details, `Checked ${e.count} times, latest ${formatTrailDate(e.at)}.`]) }
    : e));
}

export const CSV_HEADER = ["Timestamp", "Actor", "Event", "Details", "Source"];

// RFC 4180 quoting, plus a leading apostrophe on cells a spreadsheet would run as a formula.
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function auditTrailCsv(entries: AuditEntry[]): string {
  const rows = [CSV_HEADER, ...(entries ?? []).map((e) => [e.at, e.actor, e.event, e.details, e.source_url])];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// kestrel-audit-<company-slug>-<YYYY-MM-DD>.csv
export function auditFileName(companyName: string, date: Date = new Date()): string {
  const slug = text(companyName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "company";
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `kestrel-audit-${slug}-${day}.csv`;
}
