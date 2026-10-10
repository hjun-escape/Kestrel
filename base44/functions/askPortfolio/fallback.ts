// Deterministic (no LLM) answer built from the tool results fetched this turn.
// Used when the loop ends without a valid final answer, so fetched data is
// never thrown away. Citations are built from fetched signals only, so they
// pass verifyCitations by construction.

import type { Borrower, Signal } from './tools.ts';

export interface FallbackEntry {
  tool?: string;
  result?: unknown;
}

export interface FallbackAnswer {
  answer: string;
  citations: unknown[];
}

const MAX_SIGNALS_SHOWN = 3;
const STATUS_LABELS: Record<string, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' };

function day(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 10) : null;
}

function byDateDesc(a: Signal, b: Signal): number {
  return (day(b.date) ?? '').localeCompare(day(a.date) ?? '');
}

function companyLines(company: Borrower, signals: Signal[], citations: unknown[]): string[] {
  const label = STATUS_LABELS[company.status ?? ''] ?? 'Status unknown';
  const why = (company.why ?? '').trim().replace(/[.\s]+$/, '') || 'no reason recorded';
  const checked = day(company.last_refreshed);
  const lines = [
    `${company.name} (${company.stage ?? 'unknown stage'}): ${label} — ${why}. ${checked ? `Last checked ${checked}` : 'Never checked'}.`,
  ];
  const recent = [...signals].sort(byDateDesc).slice(0, MAX_SIGNALS_SHOWN);
  for (const s of recent) {
    const title = (s.title ?? '').trim() || 'Untitled signal';
    lines.push(`- ${title} (${day(s.date) ?? 'undated'}, ${s.source_name ?? 'unknown source'})`);
    if (typeof s.source_url === 'string' && s.source_url.trim() !== '') {
      citations.push({
        company_id: company.id,
        signal_id: s.id,
        source_url: s.source_url,
        ...(s.title ? { quote: s.title } : {}),
      });
    }
  }
  return lines;
}

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function countsLine(counts: Record<string, number>, exposure: number): string {
  return `Portfolio: ${counts.red ?? 0} red, ${counts.yellow ?? 0} yellow, ${counts.green ?? 0} green. Exposure at risk: ${usd(exposure)}.`;
}

function listLine(companies: Borrower[]): string {
  const counts: Record<string, number> = { green: 0, yellow: 0, red: 0 };
  let exposure = 0;
  for (const c of companies) {
    if (c.status && c.status in counts) counts[c.status] += 1;
    if ((c.status === 'red' || c.status === 'yellow') && typeof c.loan_amount_usd === 'number') {
      exposure += c.loan_amount_usd;
    }
  }
  return countsLine(counts, exposure);
}

// Returns null when no tool result is usable.
export function buildFallbackAnswer(entries: FallbackEntry[]): FallbackAnswer | null {
  const citations: unknown[] = [];
  const blocks: string[] = [];
  const seenCompanies = new Set<string>();
  for (const entry of entries) {
    const r = entry.result as Record<string, unknown> | undefined;
    if (!r || typeof r !== 'object') continue;
    if (entry.tool === 'get_company') {
      const company = r.company as Borrower | undefined;
      if (r.found === true && company?.id) {
        if (seenCompanies.has(company.id)) continue;
        seenCompanies.add(company.id);
        const signals = Array.isArray(r.signals) ? (r.signals as Signal[]) : [];
        blocks.push(companyLines(company, signals, citations).join('\n'));
      } else if (r.ambiguous && Array.isArray(r.candidates)) {
        const names = (r.candidates as Borrower[]).map((c) => c.name).join(', ');
        blocks.push(`More than one company matches. Which did you mean: ${names}?`);
      } else if (typeof r.message === 'string') {
        blocks.push(r.message);
      }
    } else if (entry.tool === 'portfolio_summary' && r.counts_by_status) {
      const exposure = typeof r.exposure_at_risk_usd === 'number' ? r.exposure_at_risk_usd : 0;
      blocks.push(countsLine(r.counts_by_status as Record<string, number>, exposure));
    } else if (entry.tool === 'list_companies' && Array.isArray(r.companies)) {
      blocks.push(listLine(r.companies as Borrower[]));
    } else if (r.pending_action && typeof (r.pending_action as { summary?: unknown }).summary === 'string') {
      blocks.push(`Waiting for your confirmation: ${(r.pending_action as { summary: string }).summary}`);
    }
  }
  if (blocks.length === 0) return null;
  return { answer: [...new Set(blocks)].join('\n\n'), citations };
}
