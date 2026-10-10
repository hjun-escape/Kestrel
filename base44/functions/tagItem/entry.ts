import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { snippetIsExact, tagMany } from './shared.ts';

// tagItem (P2): tags ONE article or review for P3 and others (CLAUDE.md "LLM use: tagging only").
// Input:  { text, url?, borrower, kind? }   kind: "news items" (default) or "employee reviews"
// Output: { relevant, same_company, signal_type, severity, snippet, reason }
// The snippet guard runs here too: a snippet that is not a verbatim quote of `text` comes back as
// relevant: false, so callers can trust any snippet they receive.

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    if (typeof body?.text !== 'string' || !body.text.trim()) return Response.json({ error: 'text is required' }, { status: 400 });
    if (!body?.borrower?.name) return Response.json({ error: 'borrower is required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const [tag] = await tagMany(
      [{ text: body.text, url: body.url ?? '' }],
      body.borrower,
      (params) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
      body.kind,
    );
    if (tag.relevant && !snippetIsExact(tag.snippet, body.text)) {
      return Response.json({ ...tag, relevant: false, snippet: '', reason: `snippet guard: not an exact quote (${tag.reason ?? ''})` });
    }
    return Response.json(tag);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
