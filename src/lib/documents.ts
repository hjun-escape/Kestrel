// Copied from base44/functions/lenderCheck/documents.ts: the frontend must not import across the src/ boundary.
// Keep in sync with the backend copy.

// Document request checklist. Pure code, no LLM, no npm:, no Deno.
// Imported by the lenderCheck function's tests and by the ApplicantDecision
// component (Vite compiles the .ts file directly).
//
// From user testing: "I wish I woulda asked the cash flow documents a lot
// earlier in the process." So the cash-flow items are always on the list, and
// public evidence (other lenders, late payments, signals) adds targeted items.

export interface DocumentItem {
  item: string;
  reason: string;
  source_url?: string;
}

export interface EvidenceLike {
  quote?: string;
  source_url?: string;
  source_name?: string;
  date?: string | null;
}

export interface LenderLike {
  name?: string;
  kinds?: string[];
  evidence?: EvidenceLike[];
}

export interface LatePaymentLike {
  quote?: string;
  source_url?: string;
  date?: string | null;
  lender?: string | null;
}

export interface LenderCheckLike {
  lender_count?: number;
  lenders?: LenderLike[];
  late_payment_evidence?: LatePaymentLike[];
}

export interface SignalInput {
  type?: string;
  severity?: string;
  title?: string;
  source_url?: string;
}

export interface AnalysisLike {
  recommended_action?: string;
  open_questions?: string[];
}

export interface BorrowerLike {
  name?: string;
}

const MAX_NAMED_LENDERS = 5;
const MAX_LENDERS_IN_REASON = 3;
const MAX_QUOTE_CHARS = 160;
const MAX_QUESTIONS_IN_REASON = 4;

export const ALWAYS_ITEMS: readonly DocumentItem[] = [
  {
    item: 'Last 12 months of business bank statements',
    reason:
      'Shows actual cash in and out, including payments to lenders that do not appear on the application.',
  },
  {
    item: 'Monthly cash-flow statement and 13-week cash-flow forecast',
    reason: 'Shows whether the company can carry new debt service in the coming quarter.',
  },
  {
    item: 'Debt schedule listing all lenders, with balances and payment status',
    reason: 'Loans at several banks and small late payments to them are early signs of trouble.',
  },
];

const HEADCOUNT_ITEM = 'Headcount and payroll report, last 6 months';
const ORG_CHART_ITEM = 'Management org chart and transition plan';
const LITIGATION_ITEM = 'List of pending litigation';
const LAWSUIT_KINDS = ['lender_lawsuit', 'judgment'];
const KIND_LABELS: Record<string, string> = {
  lien: 'lien',
  lender_lawsuit: 'lender lawsuit',
  judgment: 'judgment',
  new_loan: 'new loan',
  mca: 'merchant cash advance',
};

// ---------- helpers ----------

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeUrl(raw: unknown): string | undefined {
  const value = text(raw);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function clip(value: string, max: number = MAX_QUOTE_CHARS): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function withSource(item: string, reason: string, sourceUrl: unknown): DocumentItem {
  const url = safeUrl(sourceUrl);
  return url ? { item, reason, source_url: url } : { item, reason };
}

function namedLenders(check: LenderCheckLike | null | undefined): LenderLike[] {
  const list = Array.isArray(check?.lenders) ? check.lenders : [];
  return list.filter((l) => l && text(l.name));
}

function firstEvidence(lender: LenderLike): EvidenceLike | undefined {
  return (Array.isArray(lender.evidence) ? lender.evidence : []).find((e) => e && text(e.quote));
}

function validSignals(signals: unknown): SignalInput[] {
  if (!Array.isArray(signals)) return [];
  return signals.filter((s): s is SignalInput => typeof s === 'object' && s !== null);
}

// ---------- conditional items ----------

function debtScheduleItem(lenderCount: number): DocumentItem {
  const base = ALWAYS_ITEMS[2];
  if (lenderCount < 1) return { ...base };
  return {
    ...base,
    reason: `${base.reason} Public records already show ${plural(lenderCount, 'other lender', 'other lenders')}.`,
  };
}

function payoffItem(lenders: LenderLike[]): DocumentItem | null {
  if (lenders.length === 0) return null;
  const names = lenders.map((l) => text(l.name));
  const shown = names.slice(0, MAX_NAMED_LENDERS);
  const extra = names.length - shown.length;
  const nameList = extra > 0 ? `${shown.join(', ')} and ${extra} others` : joinNames(shown);
  const cited = lenders.slice(0, MAX_LENDERS_IN_REASON).map((l) => {
    const kinds = (l.kinds || []).map((k) => KIND_LABELS[k] || k).join(', ');
    const ev = firstEvidence(l);
    const quote = ev ? `: "${clip(text(ev.quote))}"` : '';
    return `${text(l.name)}${kinds ? ` (${kinds})` : ''}${quote}`;
  });
  const reason = `Public records show ${plural(lenders.length, 'other lender', 'other lenders')}. ${cited.join('; ')}.`;
  const source = lenders.map(firstEvidence).find((e) => safeUrl(e?.source_url));
  return withSource(`Payoff letters / statements from ${nameList}`, reason, source?.source_url);
}

function latePaymentItems(check: LenderCheckLike | null | undefined): DocumentItem[] {
  const evidence = Array.isArray(check?.late_payment_evidence) ? check.late_payment_evidence : [];
  const byLender = new Map<string, LatePaymentLike[]>();
  for (const ev of evidence) {
    if (!ev || !text(ev.quote)) continue;
    const lender = text(ev.lender) || 'other lenders';
    byLender.set(lender, [...(byLender.get(lender) ?? []), ev]);
  }
  return [...byLender.entries()].map(([lender, list]) => {
    const quotes = list.slice(0, 2).map((e) => `"${clip(text(e.quote))}"`).join('; ');
    return withSource(
      `Explanation of late payments to ${lender}`,
      `Public sources mention late or missed payments: ${quotes}.`,
      list.find((e) => safeUrl(e.source_url))?.source_url,
    );
  });
}

function signalItem(signals: SignalInput[], item: string, lead: string): DocumentItem | null {
  if (signals.length === 0) return null;
  const titles = signals.map((s) => text(s.title)).filter(Boolean).slice(0, 2);
  const reason = titles.length > 0 ? `${lead}: ${titles.join('; ')}.` : `${lead}.`;
  return withSource(item, reason, signals.find((s) => safeUrl(s.source_url))?.source_url);
}

function litigationItem(signals: SignalInput[], lenders: LenderLike[]): DocumentItem | null {
  const legal = signals.filter((s) => s.type === 'legal_layoffs');
  const suing = lenders.filter((l) => (l.kinds || []).some((k) => LAWSUIT_KINDS.includes(k)));
  if (legal.length === 0 && suing.length === 0) return null;
  const parts: string[] = [];
  if (legal.length > 0) {
    const titles = legal.map((s) => text(s.title)).filter(Boolean).slice(0, 2);
    parts.push(`Legal or layoff signal${titles.length ? `: ${titles.join('; ')}` : ''}`);
  }
  if (suing.length > 0) {
    parts.push(`lender lawsuit or judgment involving ${joinNames(suing.map((l) => text(l.name)))}`);
  }
  const reason = `${parts.join('. Also a ')}.`;
  const source =
    legal.find((s) => safeUrl(s.source_url))?.source_url ??
    suing.map(firstEvidence).find((e) => safeUrl(e?.source_url))?.source_url;
  return withSource(LITIGATION_ITEM, reason.charAt(0).toUpperCase() + reason.slice(1), source);
}

function analystItem(analysis: AnalysisLike | null | undefined): DocumentItem | null {
  if (!analysis) return null;
  const action = text(analysis.recommended_action);
  if (action !== 'request_documents' && action !== 'escalate') return null;
  const questions = (Array.isArray(analysis.open_questions) ? analysis.open_questions : [])
    .map(text)
    .filter(Boolean);
  if (questions.length === 0) return null;
  return {
    item: 'Written answers to open questions from our review',
    reason: `Open questions: ${questions.slice(0, MAX_QUESTIONS_IN_REASON).join(' ')}`,
  };
}

// ---------- public API ----------

/**
 * Checklist of documents to request from a company. The three base items
 * always come first; evidence-driven items follow, without duplicates.
 */
export function buildDocumentRequest(
  _borrower: BorrowerLike | null | undefined,
  signals: unknown,
  lenderCheck: LenderCheckLike | null | undefined,
  analysis?: AnalysisLike | null,
): DocumentItem[] {
  const lenders = namedLenders(lenderCheck);
  const lenderCount = Math.max(Number(lenderCheck?.lender_count) || 0, lenders.length);
  const sigs = validSignals(signals);
  const strongStaff = sigs.filter(
    (s) => (s.type === 'hiring_drop' || s.type === 'review_distress') && s.severity === 'strong',
  );
  const execs = sigs.filter((s) => s.type === 'exec_departure');

  const candidates: (DocumentItem | null)[] = [
    { ...ALWAYS_ITEMS[0] },
    { ...ALWAYS_ITEMS[1] },
    debtScheduleItem(lenderCount),
    payoffItem(lenders),
    ...latePaymentItems(lenderCheck),
    signalItem(strongStaff, HEADCOUNT_ITEM, 'Strong staffing signal'),
    signalItem(execs, ORG_CHART_ITEM, 'Executive departure'),
    litigationItem(sigs, lenders),
    analystItem(analysis),
  ];

  const seen = new Set<string>();
  const result: DocumentItem[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate.item)) continue;
    seen.add(candidate.item);
    result.push(candidate);
  }
  return result;
}

/** Plain-text email body for the checklist (no HTML), ready to paste. */
export function documentRequestToText(
  borrower: BorrowerLike | null | undefined,
  items: DocumentItem[],
): string {
  const name = text(borrower?.name) || 'your company';
  const lines = [
    `Subject: Documents requested for the ${name} credit review`,
    '',
    'Hello,',
    '',
  ];
  if (items.length === 0) {
    lines.push(`We do not need any additional documents from ${name} at this time.`);
  } else {
    lines.push(`As part of our credit review of ${name}, please send the following:`, '');
    items.forEach((d, i) => {
      lines.push(`${i + 1}. ${d.item}`, `   Reason: ${d.reason}`);
      if (d.source_url) lines.push(`   Source: ${d.source_url}`);
      lines.push('');
    });
    lines.push('Please reply with any questions.');
  }
  lines.push('', 'Thank you.');
  return lines.join('\n');
}
