import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { findVerbatim, tagText, type InvokeLLM } from '../base44/functions/tagItem/shared.ts';

const acme = { name: 'Acme Foods', website_domain: 'acmefoods.com', hq_city: 'Dallas' };
const review = 'Pros: nice team.\nCons: Payroll was late twice this quarter and they announced layoffs in the warehouse.';
const reply = (r: unknown): InvokeLLM => async () => r;

describe('tagItem', () => {
  test('keeps a verbatim snippet and returns it copied from the source text', async () => {
    const tag = await tagText(review, acme, reply({
      relevant: true, same_company: true, signal_type: 'review_distress', severity: 'strong',
      snippet: 'payroll was LATE twice this quarter', reason: 'late pay',
    }), 'employee review');
    assert.equal(tag.relevant, true);
    assert.equal(tag.snippet, 'Payroll was late twice this quarter');
  });

  test('a model-written snippet is turned into not relevant', async () => {
    const tag = await tagText(review, acme, reply({
      relevant: true, same_company: true, signal_type: 'review_distress', severity: 'strong',
      snippet: 'Employees are not being paid', reason: 'pay',
    }));
    assert.equal(tag.relevant, false);
    assert.match(tag.reason, /snippet guard/);
  });

  test('accepts a fenced JSON string reply and rejects garbage', async () => {
    const fenced = '```json\n' + JSON.stringify({ relevant: false, same_company: true, signal_type: 'none', severity: 'none', snippet: '', reason: 'good news' }) + '\n```';
    assert.equal((await tagText(review, acme, reply(fenced))).reason, 'good news');
    assert.equal((await tagText(review, acme, reply('nonsense'))).reason, 'unreadable model reply');
  });

  test('findVerbatim ignores case and spacing but needs 12+ characters', () => {
    assert.equal(findVerbatim('The  CFO resigned on Friday.', 'the cfo resigned'), 'The CFO resigned');
    assert.equal(findVerbatim('The CFO resigned.', 'CFO'), null);
  });
});

describe('tagItem former-employee rule', () => {
  test('prompt rejects stories about former employees', async () => {
    const { buildPrompt } = await import('../base44/functions/tagItem/shared.ts');
    assert.match(buildPrompt('x', acme, 'news article'), /former employee/i);
  });
});
