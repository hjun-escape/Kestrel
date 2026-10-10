import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALWAYS_ITEMS,
  buildDocumentRequest,
  documentRequestToText,
} from '../base44/functions/lenderCheck/documents.ts';

const BORROWER = { id: 'b1', name: 'Acme Widgets', website_domain: 'acmewidgets.com', stage: 'applicant' };

const NO_LENDERS = {
  lender_count: 0,
  lenders: [],
  late_payment_evidence: [],
  summary: 'No other lenders found in public records (not proof there are none).',
};

const TWO_LENDERS = {
  lender_count: 2,
  lenders: [
    {
      name: 'First Harbor Bank, N.A.',
      kinds: ['lien'],
      evidence: [
        {
          quote: 'Secured party: First Harbor Bank, N.A.',
          source_url: 'https://opencorporates.example/ucc/acme-widgets-2025-001234',
          source_name: 'opencorporates.example',
          date: null,
        },
      ],
    },
    {
      name: 'Rapid Funding Group LLC',
      kinds: ['mca', 'lender_lawsuit'],
      evidence: [
        {
          quote: 'missed three scheduled payments under a merchant cash advance agreement',
          source_url: 'https://courts.example.com/rapid-funding-v-acme-widgets',
          source_name: 'courts.example.com',
          date: '2026-03-02',
        },
      ],
    },
  ],
  late_payment_evidence: [
    {
      quote: 'missed three scheduled payments under a merchant cash advance agreement',
      source_url: 'https://courts.example.com/rapid-funding-v-acme-widgets',
      date: '2026-03-02',
      lender: 'Rapid Funding Group LLC',
    },
  ],
  summary: '2 other lenders found in public records.',
};

function sig(type: string, severity: string, extra: Record<string, string> = {}) {
  return {
    type,
    severity,
    date: '2026-09-01',
    title: `${type} title`,
    source_url: `https://signals.example.com/${type}`,
    ...extra,
  };
}

const items = (list: { item: string }[]) => list.map((d) => d.item);

describe('buildDocumentRequest: always-requested items', () => {
  test('a company with no signals and no lenders gets exactly the three base items', () => {
    const list = buildDocumentRequest(BORROWER, [], NO_LENDERS);
    assert.deepEqual(items(list), ALWAYS_ITEMS.map((d) => d.item));
    assert.equal(list.length, 3);
  });

  test('base items cover bank statements, cash flow and a full debt schedule', () => {
    const text = items(buildDocumentRequest(BORROWER, [], NO_LENDERS)).join(' | ').toLowerCase();
    assert.match(text, /last 12 months.*bank statements/);
    assert.match(text, /13-week cash-flow forecast/);
    assert.match(text, /debt schedule.*all lenders/);
  });

  test('every item has a non-empty reason', () => {
    const list = buildDocumentRequest(BORROWER, [sig('exec_departure', 'weak')], TWO_LENDERS);
    for (const d of list) assert.ok(d.reason.trim().length > 10, `reason missing for ${d.item}`);
  });

  test('works when lenderCheck is null or undefined (check not run yet)', () => {
    assert.equal(buildDocumentRequest(BORROWER, [], null).length, 3);
    assert.equal(buildDocumentRequest(BORROWER, undefined as never, undefined).length, 3);
  });

  test('the debt schedule reason mentions the lender count when lenders were found', () => {
    const list = buildDocumentRequest(BORROWER, [], TWO_LENDERS);
    const debt = list.find((d) => /debt schedule/i.test(d.item));
    assert.ok(debt);
    assert.match(debt.reason, /2 other lenders/);
  });
});

describe('buildDocumentRequest: other lenders', () => {
  test('lender_count >= 1 asks for payoff letters from every named lender with evidence', () => {
    const list = buildDocumentRequest(BORROWER, [], TWO_LENDERS);
    const payoff = list.find((d) => /payoff letters/i.test(d.item));
    assert.ok(payoff, 'payoff item missing');
    assert.match(payoff.item, /First Harbor Bank, N\.A\./);
    assert.match(payoff.item, /Rapid Funding Group LLC/);
    assert.match(payoff.reason, /Secured party: First Harbor Bank/);
    assert.equal(payoff.source_url, 'https://opencorporates.example/ucc/acme-widgets-2025-001234');
  });

  test('no payoff item when no lenders were found', () => {
    const list = buildDocumentRequest(BORROWER, [], NO_LENDERS);
    assert.equal(list.some((d) => /payoff/i.test(d.item)), false);
  });

  test('late payment evidence asks for an explanation per named lender, citing the quote', () => {
    const list = buildDocumentRequest(BORROWER, [], TWO_LENDERS);
    const late = list.filter((d) => /explanation of late payments/i.test(d.item));
    assert.equal(late.length, 1);
    assert.equal(late[0].item, 'Explanation of late payments to Rapid Funding Group LLC');
    assert.match(late[0].reason, /missed three scheduled payments/);
    assert.equal(late[0].source_url, 'https://courts.example.com/rapid-funding-v-acme-widgets');
  });

  test('late payment evidence without a lender name still asks for an explanation', () => {
    const check = {
      ...NO_LENDERS,
      late_payment_evidence: [{ quote: 'the company paid its lender late twice', source_url: 'https://x.example/a', date: null }],
    };
    const list = buildDocumentRequest(BORROWER, [], check);
    assert.ok(list.some((d) => d.item === 'Explanation of late payments to other lenders'));
  });

  test('two late-payment quotes for the same lender produce one item', () => {
    const check = {
      ...TWO_LENDERS,
      late_payment_evidence: [
        ...TWO_LENDERS.late_payment_evidence,
        { quote: 'payment due February 17 was not received', source_url: 'https://y.example/b', date: null, lender: 'Rapid Funding Group LLC' },
      ],
    };
    const late = buildDocumentRequest(BORROWER, [], check).filter((d) => /late payments/i.test(d.item));
    assert.equal(late.length, 1);
  });

  test('lender names are capped so a long list does not blow up the item text', () => {
    const many = {
      ...TWO_LENDERS,
      lender_count: 8,
      lenders: Array.from({ length: 8 }, (_, i) => ({
        name: `Lender ${i + 1}`,
        kinds: ['lien'],
        evidence: [{ quote: `Secured party: Lender ${i + 1}`, source_url: `https://u.example/${i}`, source_name: '', date: null }],
      })),
    };
    const payoff = buildDocumentRequest(BORROWER, [], many).find((d) => /payoff/i.test(d.item));
    assert.ok(payoff);
    assert.match(payoff.item, /and 3 others/);
  });
});

describe('buildDocumentRequest: signals', () => {
  test('strong hiring_drop asks for a headcount and payroll report', () => {
    const list = buildDocumentRequest(BORROWER, [sig('hiring_drop', 'strong')], NO_LENDERS);
    const item = list.find((d) => d.item === 'Headcount and payroll report, last 6 months');
    assert.ok(item);
    assert.equal(item.source_url, 'https://signals.example.com/hiring_drop');
    assert.match(item.reason, /hiring_drop title/);
  });

  test('strong review_distress asks for the headcount report too', () => {
    const list = buildDocumentRequest(BORROWER, [sig('review_distress', 'strong')], NO_LENDERS);
    assert.ok(list.some((d) => d.item === 'Headcount and payroll report, last 6 months'));
  });

  test('weak hiring_drop or review_distress does not ask for the headcount report', () => {
    const list = buildDocumentRequest(
      BORROWER,
      [sig('hiring_drop', 'weak'), sig('review_distress', 'weak')],
      NO_LENDERS,
    );
    assert.equal(list.some((d) => /headcount/i.test(d.item)), false);
  });

  test('both strong hiring and review signals produce a single headcount item', () => {
    const list = buildDocumentRequest(
      BORROWER,
      [sig('hiring_drop', 'strong'), sig('review_distress', 'strong')],
      NO_LENDERS,
    );
    assert.equal(list.filter((d) => /headcount/i.test(d.item)).length, 1);
  });

  test('exec_departure asks for an org chart and transition plan', () => {
    const list = buildDocumentRequest(BORROWER, [sig('exec_departure', 'weak')], NO_LENDERS);
    const item = list.find((d) => d.item === 'Management org chart and transition plan');
    assert.ok(item);
    assert.equal(item.source_url, 'https://signals.example.com/exec_departure');
  });

  test('legal_layoffs asks for a list of pending litigation', () => {
    const list = buildDocumentRequest(BORROWER, [sig('legal_layoffs', 'strong')], NO_LENDERS);
    assert.ok(list.some((d) => d.item === 'List of pending litigation'));
  });

  test('a lender lawsuit also triggers the pending litigation request', () => {
    const list = buildDocumentRequest(BORROWER, [], TWO_LENDERS);
    const lit = list.find((d) => d.item === 'List of pending litigation');
    assert.ok(lit);
    assert.match(lit.reason, /Rapid Funding Group LLC/);
  });

  test('signals with unsafe source URLs are cited without a link', () => {
    const list = buildDocumentRequest(
      BORROWER,
      [sig('exec_departure', 'weak', { source_url: 'javascript:alert(1)' })],
      NO_LENDERS,
    );
    const item = list.find((d) => /org chart/i.test(d.item));
    assert.ok(item);
    assert.equal(item.source_url, undefined);
  });

  test('ignores unknown signal types and malformed entries', () => {
    const list = buildDocumentRequest(
      BORROWER,
      [sig('weather', 'strong'), null as never, 'x' as never],
      NO_LENDERS,
    );
    assert.equal(list.length, 3);
  });

  test('base items stay first, in a stable order', () => {
    const list = buildDocumentRequest(
      BORROWER,
      [sig('legal_layoffs', 'strong'), sig('exec_departure', 'weak'), sig('hiring_drop', 'strong')],
      TWO_LENDERS,
    );
    assert.deepEqual(items(list).slice(0, 3), ALWAYS_ITEMS.map((d) => d.item));
    assert.equal(new Set(items(list)).size, list.length, 'no duplicate items');
  });
});

describe('buildDocumentRequest: analyst brief', () => {
  test('open questions from a brief that recommends documents become one written-answers item', () => {
    const analysis = {
      recommended_action: 'request_documents',
      open_questions: ['Who replaced the CFO?', 'Is the First Harbor line still drawn?'],
    };
    const list = buildDocumentRequest(BORROWER, [], NO_LENDERS, analysis);
    const item = list.find((d) => /open questions/i.test(d.item));
    assert.ok(item);
    assert.match(item.reason, /Who replaced the CFO\?/);
  });

  test('a brief that says proceed adds nothing', () => {
    const analysis = { recommended_action: 'proceed', open_questions: ['Anything?'] };
    assert.equal(buildDocumentRequest(BORROWER, [], NO_LENDERS, analysis).length, 3);
  });
});

describe('documentRequestToText', () => {
  test('renders a plain text email body with numbered items, reasons and sources', () => {
    const list = buildDocumentRequest(BORROWER, [], TWO_LENDERS);
    const text = documentRequestToText(BORROWER, list);
    assert.match(text, /Acme Widgets/);
    assert.match(text, /^1\. Last 12 months of business bank statements/m);
    assert.match(text, /Source: https:\/\/opencorporates\.example/);
    assert.doesNotMatch(text, /<[a-z]/i, 'no HTML in the email body');
  });

  test('an empty list still produces a usable body', () => {
    const text = documentRequestToText(BORROWER, []);
    assert.match(text, /Acme Widgets/);
  });
});
