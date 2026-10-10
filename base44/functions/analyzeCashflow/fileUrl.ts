// file_url allow-list for analyzeCashflow (SSRF guard). Pure: no Deno globals.
//
// The function downloads the statement server-side, so it must only fetch files that
// Base44's UploadFile produced. We accept https URLs whose host is on an allow-list,
// never an IP literal or localhost, never URLs with credentials or a custom port.
// Override the list with the ALLOWED_FILE_HOSTS env var (comma separated); an entry
// matches the host itself and its subdomains.

export const DEFAULT_ALLOWED_FILE_HOSTS: readonly string[] = ['media.base44.com', 'base44.app'];

export type FileUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/** Parse a comma separated ALLOWED_FILE_HOSTS value; empty or missing gives the defaults. */
export function parseAllowedHosts(raw: string | null | undefined): string[] {
  const hosts = (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/^\*?\./, ''))
    .filter(Boolean);
  return hosts.length ? hosts : [...DEFAULT_ALLOWED_FILE_HOSTS];
}

function isIpLiteral(host: string): boolean {
  if (host.startsWith('[') || host.includes(':')) return true; // IPv6
  if (/^\d+(\.\d+){3}$/.test(host)) return true; // dotted IPv4
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) return true; // 2130706433, 0x7f000001
  return false;
}

function isLocalName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.');
}

export function checkFileUrl(raw: string, allowedHosts: readonly string[] = DEFAULT_ALLOWED_FILE_HOSTS): FileUrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'file_url is not a valid URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'file_url must use https' };
  if (url.username || url.password) return { ok: false, reason: 'file_url must not contain credentials' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'file_url must use the default https port' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host) || isLocalName(host)) return { ok: false, reason: 'file_url host is not allowed' };
  const allowed = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) return { ok: false, reason: 'file_url must point to Base44 file storage' };
  return { ok: true, url: url.toString() };
}
