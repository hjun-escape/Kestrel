import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runCashflowAnalysis } from './logic.ts';
import { parseAllowedHosts } from './fileUrl.ts';
import type { ExtractParams, LLMFileParams } from './logic.ts';

// analyzeCashflow({ borrower_id, file_url }) -> { review }
//
// Cash-flow document check. Reads transactions from an uploaded bank or cash-flow
// statement (CSV parsed in code; PDF/XLSX/images via ExtractDataFromUploadedFile,
// with InvokeLLM + file_urls as a fallback), then code finds the lenders paid from
// the account, late and missed payments, NSF items and debt-service metrics.
// Saves one CashflowReview record per run.
//
// It never sets Borrower.status and never writes Signal records.

const MAX_CSV_BYTES = 5_000_000;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'error' });
  if (!res.ok) throw new Error(`File download failed (HTTP ${res.status})`);
  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_CSV_BYTES) throw new Error('File is too large to read');
  const text = await res.text();
  if (text.length > MAX_CSV_BYTES) throw new Error('File is too large to read');
  return text;
}

/** Base44 entity fields are typed as numbers; drop nulls rather than storing them. */
function withoutNulls<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== null)) as Partial<T>;
}

export default async function(req: Request): Promise<Response> {
  try {
    let body: { borrower_id?: unknown; file_url?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
    }
    const borrowerId = typeof body?.borrower_id === 'string' ? body.borrower_id.trim() : '';
    const fileUrl = typeof body?.file_url === 'string' ? body.file_url.trim() : '';
    if (!borrowerId || !fileUrl) {
      return Response.json({ error: 'borrower_id and file_url are required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    try {
      await base44.auth.me();
    } catch {
      return Response.json({ error: 'Sign in to run a cash-flow check' }, { status: 401 });
    }
    const db = base44.asServiceRole.entities;
    try {
      await db.Borrower.get(borrowerId);
    } catch {
      return Response.json({ error: 'Company not found' }, { status: 404 });
    }

    const core = base44.asServiceRole.integrations.Core;
    const result = await runCashflowAnalysis({
      borrowerId,
      fileUrl,
      fetchText,
      allowedHosts: parseAllowedHosts(Deno.env.get('ALLOWED_FILE_HOSTS')),
      extract: (params: ExtractParams) => core.ExtractDataFromUploadedFile(params),
      invokeLLM: (params: LLMFileParams) => core.InvokeLLM(params),
      now: () => new Date(),
    });

    if (!result.ok) {
      console.error(`analyzeCashflow ${borrowerId} failed: ${result.code}: ${result.error} [${result.attempts.join('; ')}]`);
      const status = result.code === 'bad_request' ? 400 : result.code === 'internal_error' ? 500 : 502;
      return Response.json({ error: result.error, code: result.code, attempts: result.attempts }, { status });
    }

    const saved = await db.CashflowReview.create(withoutNulls({ ...result.review }));
    return Response.json({ review: { ...result.review, ...saved } });
  } catch (error) {
    console.error('analyzeCashflow error:', (error as Error).message);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
