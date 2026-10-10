import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { executeAction } from './logic.ts';
import type { ConfirmDeps } from './logic.ts';

// confirmAction({ action }). Runs one pending action from Ask Kestrel
// after the user clicks Confirm. The action is re-validated in logic.ts;
// only screen, refresh and deep_check are allowed.
export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Send { action }.' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Sign in to confirm actions.' }, { status: 401 });

    const sr = base44.asServiceRole;
    const deps: ConfirmDeps = {
      // Ownership comes from the server-side user, never from the action.
      caller: user,
      createBorrower: (data) => sr.entities.Borrower.create(data),
      getBorrower: (id) => sr.entities.Borrower.get(id).catch(() => null),
      // Invoked as the signed-in user (not the service role) so refreshBorrower
      // and analyzeBorrower see who is asking and can apply their own access
      // checks; a service-role invoke carries no user identity.
      // functions.invoke is not response-intercepted: it resolves to the axios
      // response (body in .data) and throws on non-2xx with error.response.
      invoke: async (name, payload) => (await base44.functions.invoke(name, payload))?.data,
    };

    const result = await executeAction((body as { action?: unknown }).action, deps);
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    console.error('confirmAction failed:', (error as Error).message);
    return Response.json({ error: 'Could not complete the action.' }, { status: 500 });
  }
}
