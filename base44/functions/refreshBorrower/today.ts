// Calendar date for the bank's day, not the server's UTC day: after 5 PM Pacific a UTC stamp is already tomorrow.
// Pure: no npm:, no Deno. Base44 bundles each function folder on its own, so
// this file is shared between entry.ts and the node --test suite.
export const BANK_TIME_ZONE = 'America/Los_Angeles';

// en-CA formats as YYYY-MM-DD.
export function todayIn(zone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
