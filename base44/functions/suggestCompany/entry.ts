import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { suggestCompany } from './logic.ts';
import type { LLMParams } from './logic.ts';

// suggestCompany (P2): { name } -> { suggestions: { website_domain, industry, hq_city, hq_state, linkedin_url,
// glassdoor_url }, dropped } for the "Screen new applicant" form. Each suggestion carries the search result it came
// from; anything code could not verify against the results is left out (see logic.ts).
// Uses Base44's built-in LLM and 2 Bright Data searches per call. Saves nothing.

export default async function(req: Request): Promise<Response> {
  try {
    let body: { name?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'request body must be JSON' }, { status: 400 });
    }
    const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
    if (!name) return Response.json({ error: 'Enter the company name first.' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const result = await suggestCompany({
      name,
      fetch: (url, init) => fetch(url, init),
      apiKey: Deno.env.get('BRIGHTDATA_API_KEY'),
      invokeLLM: (params: LLMParams) => base44.asServiceRole.integrations.Core.InvokeLLM(params),
    });
    return Response.json(result);
  } catch (error) {
    console.error('suggestCompany error:', (error as Error).message);
    return Response.json({ error: 'Could not look the company up. Fill the fields in by hand.' }, { status: 502 });
  }
}
