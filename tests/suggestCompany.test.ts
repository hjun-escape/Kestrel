import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseGlassdoor, normaliseLinkedIn, rootDomain, suggestCompany, verify, type WebResult } from '../base44/functions/suggestCompany/logic.ts';

const R = (link: string, title: string, description = ''): WebResult => ({ link, title, description });
const results = [
  R('https://rivian.com/', 'Rivian | Electric Adventure Vehicles', 'Rivian builds electric trucks and SUVs.'),
  R('https://en.wikipedia.org/wiki/Rivian', 'Rivian - Wikipedia', 'Rivian Automotive, Inc. is an American electric vehicle manufacturer headquartered in Irvine, California.'),
  R('https://www.linkedin.com/company/rivian/', 'Rivian | LinkedIn', 'Rivian | 400,000 followers on LinkedIn.'),
  R('https://www.glassdoor.com/Overview/Working-at-Rivian-EI_IE1170953.11,17.htm', 'Working at Rivian | Glassdoor', 'Reviews from Rivian employees.'),
  R('https://investors.rivian.com/', 'Rivian Investor Relations', ''),
];

describe('suggestCompany verify', () => {
  test('keeps values that the cited results actually show', () => {
    const out = verify('Rivian', results, {
      website_domain: 'rivian.com', website_result: 0, industry: 'Electric vehicles', industry_result: 1,
      hq_city: 'Irvine', hq_state: 'CA', hq_result: 1, linkedin_result: 2, glassdoor_result: 3,
    });
    assert.deepEqual(Object.fromEntries(Object.entries(out.suggestions).map(([k, v]) => [k, v!.value])), {
      website_domain: 'rivian.com',
      hq_city: 'Irvine',
      hq_state: 'CA',
      industry: 'Electric vehicles',
      linkedin_url: 'https://www.linkedin.com/company/rivian',
      glassdoor_url: 'https://www.glassdoor.com/Overview/Working-at-Rivian-EI_IE1170953.11,17.htm',
    });
    assert.deepEqual(out.dropped, []);
  });

  test('drops a domain that is not the cited result, a directory site, and a city the result does not mention', () => {
    const out = verify('Rivian', results, {
      website_domain: 'rivian-motors.com', website_result: 0, industry: '', industry_result: -1,
      hq_city: 'Plymouth', hq_state: 'MI', hq_result: 1, linkedin_result: -1, glassdoor_result: -1,
    });
    assert.equal(out.suggestions.website_domain, undefined);
    assert.equal(out.suggestions.hq_city, undefined);
    assert.equal(out.suggestions.hq_state, undefined);
    assert.equal(out.dropped.length, 2);
    const wiki = verify('Rivian', results, { website_domain: 'wikipedia.org', website_result: 1 });
    assert.equal(wiki.suggestions.website_domain, undefined);
  });

  test('a subdomain result gives the root domain; profile links are found even if the model misses them', () => {
    const out = verify('Rivian', results, { website_domain: 'investors.rivian.com', website_result: 4, linkedin_result: -1, glassdoor_result: -1 });
    assert.equal(out.suggestions.website_domain?.value, 'rivian.com');
    assert.equal(out.suggestions.linkedin_url?.value, 'https://www.linkedin.com/company/rivian');
  });

  test('unreadable reply suggests nothing', () => {
    assert.deepEqual(verify('Rivian', results, 'nonsense').suggestions, {});
  });

  test('url helpers', () => {
    assert.equal(rootDomain('investors.rivian.com'), 'rivian.com');
    assert.equal(rootDomain('shop.acme.co.uk'), 'acme.co.uk');
    assert.equal(normaliseLinkedIn('https://uk.linkedin.com/company/acme-foods?trk=x'), 'https://www.linkedin.com/company/acme-foods');
    assert.equal(normaliseLinkedIn('https://www.linkedin.com/in/someone'), null);
    assert.equal(normaliseGlassdoor('https://www.glassdoor.com/Job/acme-jobs-SRCH_KE0,4.htm'), null);
  });

  test('end to end with stubbed search and LLM: 2 searches, 1 LLM call', async () => {
    let searches = 0, llmCalls = 0;
    const out = await suggestCompany({
      name: 'Rivian',
      apiKey: 'test',
      fetch: async () => { searches++; return { ok: true, status: 200, text: async () => JSON.stringify({ organic: results.map((r) => ({ ...r })) }) }; },
      invokeLLM: async () => { llmCalls++; return { website_domain: 'rivian.com', website_result: 0, industry: 'Electric vehicles', industry_result: 0, hq_city: 'Irvine', hq_state: 'CA', hq_result: 1, linkedin_result: 2, glassdoor_result: 3 }; },
    });
    assert.deepEqual([searches, llmCalls], [2, 1]);
    assert.equal(out.suggestions.hq_city?.value, 'Irvine');
  });
});
