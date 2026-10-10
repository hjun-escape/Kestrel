// Pure, rule-based classification of bank statement lines.
// No npm: imports and no Deno globals, so it runs under Node's test runner.
// The LLM never decides what counts as a lender payment; these rules do.

import { normaliseForMatch } from '../analyzeBorrower/logic.ts';

/** Known small-business lenders: pattern -> canonical display name. */
const KNOWN_LENDERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bkabbage\b/, 'Kabbage'],
  [/\bon\s?deck\b/, 'OnDeck'],
  [/\bfundbox\b/, 'Fundbox'],
  [/\bbluevine\b/, 'Bluevine'],
  [/\bkapitus\b/, 'Kapitus'],
  [/\bcredibly\b/, 'Credibly'],
  [/\blendio\b/, 'Lendio'],
  [/\brapid\s?finance\b/, 'Rapid Finance'],
  [/\bcan\s?capital\b/, 'CAN Capital'],
  [/\bnational\s?funding\b/, 'National Funding'],
  [/\b(?:square|sq)\s?capital\b/, 'Square Capital'],
  [/\b(?:paypal\s?working\s?capital|ppwc)\b/, 'PayPal Working Capital'],
  [/\bshopify\s?capital\b/, 'Shopify Capital'],
  [/\bstripe\s?capital\b/, 'Stripe Capital'],
  [/\bclearco\b/, 'Clearco'],
  [/\bfora\s?financial\b/, 'Fora Financial'],
  [/\byellowstone\s?capital\b/, 'Yellowstone Capital'],
  [/\blibertas\b/, 'Libertas'],
  [/\bbitty\s?advance\b/, 'Bitty Advance'],
  [/\bheadway\s?capital\b/, 'Headway Capital'],
];

/** Words that mark a counterparty as a lender (matched on word boundaries). */
const LENDER_KEYWORDS =
  /\b(bank|bancorp|capital|funding|financial|finance|credit|loan|loans|lending|lender|sba|eidl|mca|advance|lease|leasing)\b/;

const NSF_PATTERN =
  /\b(nsf|non[-\s]?sufficient|insufficient\s+funds|returned\s+(item|ach|check|payment)|return\s+item|unpaid\s+item|overdraft|od\s+fee)\b/;

const LATE_FEE_PATTERN = /\blate\s+(fee|charge|payment\s+(fee|charge))\b/;

/** Any fee-like line is never a lender payment (bank fees mention "bank" all the time). */
const FEE_PATTERN = /\b(fee|fees|service\s+charge)\b/;

/** Payment-rail and posting noise stripped before naming a lender. */
const NOISE_WORDS = new Set([
  'ach', 'debit', 'dr', 'pmt', 'pymt', 'pmnt', 'payment', 'payments', 'autopay', 'auto', 'pay',
  'web', 'ppd', 'ccd', 'tel', 'online', 'electronic', 'withdrawal', 'transfer', 'xfer', 'to',
  'des', 'id', 'indn', 'co', 'ref', 'trace', 'inc', 'llc', 'recurring', 'preauthorized',
  'pos', 'checkcard',
]);

function plain(description: string): string {
  return normaliseForMatch(description);
}

export function isNsfLine(description: string): boolean {
  return NSF_PATTERN.test(plain(description));
}

export function isLateFeeLine(description: string): boolean {
  return LATE_FEE_PATTERN.test(plain(description));
}

/** Acronyms kept upper-case in lender names. */
const ACRONYMS = new Set(['sba', 'eidl', 'mca', 'usa', 'na', 'fsb', 'td', 'pnc', 'bmo']);

function titleCase(word: string): string {
  return ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
}

/** Name a generic lender from its description: drop rail noise, reference numbers and punctuation. */
function genericLenderName(text: string): string {
  const words = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w) && !NOISE_WORDS.has(w));
  return words.map(titleCase).join(' ');
}

/**
 * The normalised lender name for a statement description, or null if the line is not a
 * payment to a lender. Direction and recurrence are checked by the caller.
 */
export function classifyLender(description: string): string | null {
  const text = plain(description);
  if (!text) return null;
  if (NSF_PATTERN.test(text) || LATE_FEE_PATTERN.test(text) || FEE_PATTERN.test(text)) return null;
  for (const [pattern, name] of KNOWN_LENDERS) {
    if (pattern.test(text)) return name;
  }
  if (!LENDER_KEYWORDS.test(text)) return null;
  const name = genericLenderName(text);
  return name || null;
}
