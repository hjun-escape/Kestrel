import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { tagText } from './shared.ts';
import { checkInternalToken, INTERNAL_TOKEN_ENV } from './internalToken.ts';
import type { LLMParams } from './shared.ts';

// tagItem (P2): tags ONE article or review (CLAUDE.md "LLM use: tagging only").
// Input:  { text, borrower, kind? }   kind: "news article" (default) or "employee review"
// Output: { relevant, same_company, signal_type, severity, snippet, reason }
// The snippet guard runs here: a relevant tag always carries a snippet copied from `text`, so callers
// (e.g. P3's reviewSignals with TAG_ITEM_ENABLED) can use it as-is. It never decides status.

export default async function(req: Request): Promise<Response> {
  try {
    let body: { text?: unknown; borrower?: { name?: unknown }; kind?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'request body must be JSON' }, { status: 400 });
    }
    const gate = checkInternalToken(body, Deno.env.get(INTERNAL_TOKEN_ENV));
    if (!gate.ok) return Response.json({ error: gate.error }, { status: gate.status });
    if (typeof body?.text !== 'string' || !body.text.trim()) return Response.json({ error: 'text is required' }, { status: 400 });
    if (!body.borrower || typeof body.borrower.name !== 'string') return Response.json({ error: 'borrower is required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const tag = await tagText(
      body.text,
      body.borrower as { name: string },
      (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
      typeof body.kind === 'string' ? body.kind : undefined,
    );
    return Response.json(tag);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
