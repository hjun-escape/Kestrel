// Copied from analyzeBorrower/logic.ts: Base44 bundles each function folder separately
// (no imports across function folders). Keep in sync with the original.

/** Parse an LLM reply that may be an object, a JSON string, or JSON wrapped in prose/fences. */
export function coerceJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const unfenced = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Canonical form of an http(s) URL for comparison, or null if it is not one. */
export function normaliseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '';
  return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
}

/** Whitespace-normalised, case-insensitive form used for quote matching. */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
