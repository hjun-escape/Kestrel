// Minimal Devin API client. Pure (fetch only), so tests can inject a fake fetch.
// API v1 (service or personal API keys), per https://docs.devin.ai/v1-openapi.yaml:
//   POST /v1/sessions               { prompt, structured_output_schema, ... } -> { session_id, url, is_new_session }
//   GET  /v1/sessions/{session_id}  -> { session_id, status, status_enum, structured_output, ... }

export const DEVIN_BASE_URL = 'https://api.devin.ai/v1';
export const DEVIN_TIMEOUT_MS = 15_000;

export class DevinApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'DevinApiError';
    this.status = status;
  }
}

export interface DevinClient {
  createSession(params: Record<string, unknown>): Promise<{ session_id: string; url: string }>;
  // deno-lint-ignore no-explicit-any
  getSession(id: string): Promise<any>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function createDevinClient(key: string, fetchImpl: FetchLike = fetch, baseUrl = DEVIN_BASE_URL): DevinClient {
  async function call(method: string, path: string, body?: unknown) {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(DEVIN_TIMEOUT_MS),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new DevinApiError(504, 'Devin API timed out after 15 s.');
      throw new DevinApiError(502, `Could not reach the Devin API: ${(e as Error)?.message || 'network error'}`);
    }
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const detail = (data as { detail?: unknown; error?: unknown } | null);
      const msg = typeof detail?.detail === 'string' ? detail.detail : typeof detail?.error === 'string' ? detail.error : text.slice(0, 200);
      throw new DevinApiError(res.status, `Devin API error ${res.status}: ${msg || res.statusText}`);
    }
    return data;
  }
  return {
    createSession: async (params) => {
      const out = await call('POST', '/sessions', params) as { session_id?: unknown; url?: unknown } | null;
      if (typeof out?.session_id !== 'string') throw new DevinApiError(502, 'Devin API returned no session_id.');
      return { session_id: out.session_id, url: typeof out.url === 'string' ? out.url : '' };
    },
    getSession: (id) => call('GET', `/sessions/${encodeURIComponent(id)}`),
  };
}
