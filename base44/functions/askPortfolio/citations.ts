// Citation verification. A citation survives only if its source_url (and its
// quote, if any) appears verbatim, whitespace-normalised, in a tool result
// fetched during this turn.

import type { Signal } from './tools.ts';

export interface Citation {
  company_id: string;
  signal_id?: string;
  source_url: string;
  quote?: string;
}

export interface Evidence {
  company_id: string;
  signal_id: string;
  source_url: string;
  texts: string[];
}

const MAX_CITATIONS = 12;
const MAX_QUOTE = 500;

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Collects evidence from a get_company result.
export function evidenceFromToolResult(result: unknown): Evidence[] {
  const r = result as { company?: { id?: string }; signals?: Signal[] } | null;
  const companyId = r?.company?.id;
  if (!companyId || !Array.isArray(r?.signals)) return [];
  return r.signals
    .filter((s) => typeof s.source_url === 'string' && s.source_url.trim() !== '')
    .map((s) => ({
      company_id: companyId,
      signal_id: s.id,
      source_url: normalizeWhitespace(s.source_url as string),
      texts: [s.title, s.snippet]
        .filter((t): t is string => typeof t === 'string')
        .map(normalizeWhitespace),
    }));
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

export function verifyCitations(raw: unknown, evidence: Evidence[]): Citation[] {
  if (!Array.isArray(raw)) return [];
  const kept: Citation[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const companyId = str(c.company_id);
    const url = str(c.source_url);
    if (!companyId || !url) continue;
    const normUrl = normalizeWhitespace(url);
    if (!/^https?:\/\//i.test(normUrl)) continue;
    const signalId = str(c.signal_id);
    const quote = str(c.quote);
    const normQuote = quote ? normalizeWhitespace(quote) : undefined;
    if (normQuote && normQuote.length > MAX_QUOTE) continue;

    const match = evidence.find((e) =>
      e.company_id === companyId &&
      e.source_url === normUrl &&
      (!signalId || e.signal_id === signalId) &&
      (!normQuote || e.texts.some((t) => t.includes(normQuote))));
    if (!match) continue;

    const key = `${match.signal_id}|${normQuote ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const citation: Citation = { company_id: companyId, signal_id: match.signal_id, source_url: match.source_url };
    if (normQuote) citation.quote = normQuote;
    kept.push(citation);
    if (kept.length >= MAX_CITATIONS) break;
  }
  return kept;
}
