// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  domainMatches,
  findCompanyPages,
  glassdoorCompanyName,
  glassdoorReviewsUrl,
  hostOf,
  linkedinCompanyUrl,
  normalizeName,
  pickGlassdoor,
  pickLinkedInCandidates,
  registrableDomain,
  toLinkedInCompany,
  toWebResults,
  LINKEDIN_COMPANY_DATASET_ID,
  type Borrower,
  type FetchLike,
} from "../base44/functions/findCompanyPages/logic.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const SERP_LINKEDIN = fixture("find-pages-serp-linkedin-gravie.json");
const SERP_GLASSDOOR = fixture("find-pages-serp-glassdoor-gravie.json");
const SERP_SIMILAR = fixture("find-pages-serp-similar-name.json");
const COMPANIES = fixture("find-pages-linkedin-company-gravie.json");

const GRAVIE: Borrower = { name: "Gravie", website_domain: "gravie.com", hq_city: "Minneapolis", hq_state: "MN" };

type Call = { url: string; body: any };

// Fake Bright Data: SERP answers by query, the company dataset answers from the fixture records it was asked for.
function fakeFetch(opts: {
  serp?: (query: string) => unknown;
  serpStatus?: number;
  companies?: unknown[];
  companyStatus?: number;
  calls?: Call[];
} = {}): FetchLike {
  return async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    opts.calls?.push({ url, body });
    const reply = (status: number, data: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
    if (url === "https://api.brightdata.com/request") {
      const query = new URL(body.url).searchParams.get("q") ?? "";
      return reply(opts.serpStatus ?? 200, opts.serp ? opts.serp(query) : { organic: [] });
    }
    if (url.includes("/datasets/v3/scrape")) {
      const asked = new Set((body.input ?? []).map((i: { url: string }) => i.url));
      const rows = (opts.companies ?? COMPANIES).filter((r: any) => asked.has(r.input?.url));
      return reply(opts.companyStatus ?? 200, rows);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

const gravieSerp = (q: string) => (/glassdoor/i.test(q) ? SERP_GLASSDOOR : SERP_LINKEDIN);

// ---------- helpers ----------

test("hostOf strips scheme, www, port and path; rejects junk", () => {
  assert.equal(hostOf("https://www.gravie.com/about"), "gravie.com");
  assert.equal(hostOf("gravie.com"), "gravie.com");
  assert.equal(hostOf("WWW.Gravie.com:443/x?y"), "gravie.com");
  assert.equal(hostOf("http://careers.gravie.com"), "careers.gravie.com");
  assert.equal(hostOf(""), null);
  assert.equal(hostOf("not a domain"), null);
  assert.equal(hostOf("javascript:alert(1)"), null);
  assert.equal(hostOf(null), null);
});

test("registrableDomain keeps the company's own domain", () => {
  assert.equal(registrableDomain("careers.gravie.com"), "gravie.com");
  assert.equal(registrableDomain("shop.acme.co.uk"), "acme.co.uk");
  assert.equal(registrableDomain("gravie.com"), "gravie.com");
});

test("domainMatches: https://www.gravie.com/about matches gravie.com, look-alikes do not", () => {
  assert.equal(domainMatches("https://www.gravie.com/about", "gravie.com"), true);
  assert.equal(domainMatches("http://careers.gravie.com", "www.gravie.com"), true);
  // The page's site must be the entered domain or under it, not a parent of it.
  assert.equal(domainMatches("https://acme.co.uk", "shop.acme.co.uk"), false);
  assert.equal(domainMatches("https://shop.acme.co.uk", "acme.co.uk"), true);
  // Shared hosts: another site on the same suffix is a different company.
  assert.equal(domainMatches("https://evil.github.io", "acme.github.io"), false);
  assert.equal(domainMatches("https://other-app.base44.app", "acme.base44.app"), false);
  assert.equal(domainMatches("https://acme.vercel.app", "acme.vercel.app"), true);
  assert.equal(domainMatches("https://gravie.co", "gravie.com"), false);
  assert.equal(domainMatches("https://gravie.com.evil.example", "gravie.com"), false);
  assert.equal(domainMatches("https://notgravie.com", "gravie.com"), false);
  assert.equal(domainMatches(null, "gravie.com"), false);
  assert.equal(domainMatches("https://gravie.com", ""), false);
});

test("linkedinCompanyUrl normalizes country subdomains, query and sub-paths", () => {
  assert.equal(linkedinCompanyUrl("https://uk.linkedin.com/company/gravie?trk=x"), "https://www.linkedin.com/company/gravie");
  assert.equal(linkedinCompanyUrl("https://linkedin.com/company/Gravie/"), "https://www.linkedin.com/company/gravie");
  assert.equal(linkedinCompanyUrl("https://www.linkedin.com/company/gravie-care/about/"), "https://www.linkedin.com/company/gravie-care");
});

test("linkedinCompanyUrl skips jobs, people, posts, life, showcase, profiles and look-alike hosts", () => {
  for (const sub of ["jobs/", "people/", "posts/?feedView=all", "life/"]) {
    assert.equal(linkedinCompanyUrl(`https://www.linkedin.com/company/gravie/${sub}`), null, sub);
  }
  assert.equal(linkedinCompanyUrl("https://www.linkedin.com/showcase/gravie-health/"), null);
  assert.equal(linkedinCompanyUrl("https://www.linkedin.com/in/janedoe"), null);
  assert.equal(linkedinCompanyUrl("https://ablinkedin.com/company/gravie"), null);
  assert.equal(linkedinCompanyUrl("https://linkedin.com.evil.example/company/gravie"), null);
});

test("pickLinkedInCandidates takes the first two company pages in rank order", () => {
  assert.deepEqual(pickLinkedInCandidates(toWebResults(SERP_LINKEDIN)), [
    "https://www.linkedin.com/company/gravie",
    "https://www.linkedin.com/company/gravie-care",
  ]);
});

test("Glassdoor: only /Reviews/<Name>-Reviews-E<id>.htm, rewritten to glassdoor.com", () => {
  assert.deepEqual(pickGlassdoor(toWebResults(SERP_GLASSDOOR)), {
    url: "https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm",
    companySlug: "Gravie",
  });
  assert.equal(glassdoorReviewsUrl("https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527_P2.htm"), null);
  assert.equal(glassdoorReviewsUrl("https://www.glassdoor.com/Jobs/Gravie-Jobs-E1055527.htm"), null);
  assert.equal(
    glassdoorReviewsUrl("https://www.glassdoor.com/Reviews/Gravie-Minneapolis-Reviews-EI_IE1055527.0,6_IL.7,18_IC1142551.htm"),
    null,
  );
  // Look-alike hosts are ignored, so a chosen slug cannot pass with another company's E-number.
  assert.equal(glassdoorReviewsUrl("https://www.glassdoor.com.evil/Reviews/Gravie-Reviews-E999.htm"), null);
  assert.equal(glassdoorReviewsUrl("https://glassdoor.co.evil/Reviews/Gravie-Reviews-E999.htm"), null);
  assert.equal(glassdoorReviewsUrl("https://user@www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm"), null);
  assert.deepEqual(glassdoorReviewsUrl("https://www.glassdoor.co.uk/Reviews/Gravie-Reviews-E1055527.htm?sort=date"), {
    url: "https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm",
    companySlug: "Gravie",
  });
  assert.equal(glassdoorCompanyName("Acme-Widgets"), "acme widgets");
});

test("normalizeName ignores case, punctuation and legal suffixes", () => {
  assert.equal(normalizeName("Acme Widgets, Inc."), "acme widgets");
  assert.equal(normalizeName("ACME-WIDGETS LLC"), "acme widgets");
  assert.equal(normalizeName("Smith & Sons Co"), "smith and sons");
});

test("toLinkedInCompany reads the website and skips error records", () => {
  assert.deepEqual(toLinkedInCompany(COMPANIES[0]), {
    url: "https://www.linkedin.com/company/gravie",
    inputUrl: "https://www.linkedin.com/company/gravie",
    name: "Gravie",
    website: "https://www.gravie.com/about",
  });
  assert.equal(toLinkedInCompany({ error: "dead page", input: { url: "x" } }), null);
  assert.equal(toLinkedInCompany("garbage"), null);
  assert.equal(toLinkedInCompany({ name: "X", website_simplified: "x.example" })?.website, "x.example");
});

// ---------- findCompanyPages ----------

test("Gravie: finds and verifies both pages with no URLs given", async () => {
  const calls: Call[] = [];
  const r = await findCompanyPages(GRAVIE, { fetch: fakeFetch({ serp: gravieSerp, calls }), apiKey: "k" });
  assert.equal(r.linkedin, "found");
  assert.equal(r.linkedin_url, "https://www.linkedin.com/company/gravie");
  assert.equal(r.glassdoor, "found");
  assert.equal(r.glassdoor_url, "https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm");

  const serp = calls.filter((c) => c.url === "https://api.brightdata.com/request");
  assert.equal(serp.length, 2);
  for (const c of serp) {
    assert.equal(c.body.zone, "mcp_unlocker");
    assert.equal(c.body.format, "raw");
    assert.match(c.body.url, /^https:\/\/www\.google\.com\/search\?q=.*&hl=en&gl=us&brd_json=1$/);
    assert.doesNotMatch(c.body.url, /tbm=nws/);
  }
  const lookups = calls.filter((c) => c.url.includes("/datasets/v3/scrape"));
  assert.equal(lookups.length, 1, "both LinkedIn candidates are checked in one call");
  assert.match(lookups[0].url, new RegExp(`dataset_id=${LINKEDIN_COMPANY_DATASET_ID}`));
  assert.deepEqual(lookups[0].body.input.map((i: { url: string }) => i.url), [
    "https://www.linkedin.com/company/gravie",
    "https://www.linkedin.com/company/gravie-care",
  ]);
});

test("rank order wins when the first candidate's website matches", async () => {
  const r = await findCompanyPages(
    { ...GRAVIE, name: "Gravie Care", website_domain: "graviecare.example" },
    { fetch: fakeFetch({ serp: gravieSerp }), apiKey: "k" },
  );
  // gravie (rank 1) lists gravie.com, so gravie-care (rank 2) is the one that matches.
  assert.equal(r.linkedin_url, "https://www.linkedin.com/company/gravie-care");
  assert.equal(r.linkedin, "found");
  // The Glassdoor page found is Gravie's, not Gravie Care's, so it is not used.
  assert.equal(r.glassdoor, "not_found");
  assert.equal(r.glassdoor_url, null);
});

test("similar name, different company: both come back not_found", async () => {
  const companies = [{
    input: { url: "https://www.linkedin.com/company/gravity-solutions-inc" },
    url: "https://www.linkedin.com/company/gravity-solutions-inc",
    name: "Gravity Solutions Inc",
    website: "https://gravity-solutions.co",
  }];
  const r = await findCompanyPages(
    { name: "Gravity Solutions", website_domain: "gravitysolutions.example", hq_city: "Austin" },
    { fetch: fakeFetch({ serp: () => SERP_SIMILAR, companies }), apiKey: "k" },
  );
  assert.deepEqual(
    { linkedin: r.linkedin, linkedin_url: r.linkedin_url, glassdoor: r.glassdoor, glassdoor_url: r.glassdoor_url },
    { linkedin: "not_found", linkedin_url: null, glassdoor: "not_found", glassdoor_url: null },
  );
  assert.ok(r.notes.some((n) => n.includes("gravity-solutions.co")));
});

test("never replaces URLs the borrower already has, and searches nothing when both are set", async () => {
  const calls: Call[] = [];
  const b = { ...GRAVIE, linkedin_url: "https://www.linkedin.com/company/some-other", glassdoor_url: "https://www.glassdoor.com/Reviews/X-Reviews-E1.htm" };
  const r = await findCompanyPages(b, { fetch: fakeFetch({ serp: gravieSerp, calls }), apiKey: "k" });
  assert.deepEqual(r, {
    linkedin_url: b.linkedin_url,
    glassdoor_url: b.glassdoor_url,
    linkedin: "user",
    glassdoor: "user",
    notes: [],
  });
  assert.equal(calls.length, 0);
});

test("user LinkedIn only: kept as is, its name verifies the Glassdoor page", async () => {
  const calls: Call[] = [];
  const b = { ...GRAVIE, linkedin_url: "https://uk.linkedin.com/company/gravie/" };
  const r = await findCompanyPages(b, { fetch: fakeFetch({ serp: gravieSerp, calls }), apiKey: "k" });
  assert.equal(r.linkedin, "user");
  assert.equal(r.linkedin_url, "https://uk.linkedin.com/company/gravie/", "returned exactly as entered");
  assert.equal(r.glassdoor, "found");
  const serpQueries = calls
    .filter((c) => c.url === "https://api.brightdata.com/request")
    .map((c) => new URL(c.body.url).searchParams.get("q"));
  assert.deepEqual(serpQueries, ['"Gravie" Glassdoor reviews'], "no LinkedIn search when the officer gave one");
});

test("user LinkedIn whose website does not match: still kept, Glassdoor not used", async () => {
  const b = { ...GRAVIE, website_domain: "somethingelse.example", linkedin_url: "https://www.linkedin.com/company/gravie" };
  const r = await findCompanyPages(b, { fetch: fakeFetch({ serp: gravieSerp }), apiKey: "k" });
  assert.equal(r.linkedin, "user");
  assert.equal(r.linkedin_url, "https://www.linkedin.com/company/gravie");
  assert.equal(r.glassdoor, "not_found");
});

test("user Glassdoor only: kept, LinkedIn still searched", async () => {
  const b = { ...GRAVIE, glassdoor_url: "https://www.glassdoor.com/Reviews/Gravie-Reviews-E1055527.htm" };
  const r = await findCompanyPages(b, { fetch: fakeFetch({ serp: gravieSerp }), apiKey: "k" });
  assert.equal(r.glassdoor, "user");
  assert.equal(r.linkedin, "found");
});

test("search failure is 'error', not 'not_found'", async () => {
  const r = await findCompanyPages(GRAVIE, { fetch: fakeFetch({ serp: gravieSerp, serpStatus: 500 }), apiKey: "k" });
  assert.equal(r.linkedin, "error");
  assert.equal(r.glassdoor, "error");
  assert.equal(r.linkedin_url, null);
});

test("LinkedIn lookup failure: LinkedIn 'error', Glassdoor not used", async () => {
  const r = await findCompanyPages(GRAVIE, { fetch: fakeFetch({ serp: gravieSerp, companyStatus: 500 }), apiKey: "k" });
  assert.equal(r.linkedin, "error");
  assert.equal(r.glassdoor, "not_found");
  assert.equal(r.glassdoor_url, null);
});

test("no website domain: nothing searched, nothing guessed", async () => {
  const calls: Call[] = [];
  const r = await findCompanyPages({ name: "Gravie" }, { fetch: fakeFetch({ serp: gravieSerp, calls }), apiKey: "k" });
  assert.equal(calls.length, 0);
  assert.equal(r.linkedin, "not_found");
  assert.equal(r.glassdoor, "not_found");
});

test("slow LinkedIn lookup: follows the snapshot until it is ready", async () => {
  let progressCalls = 0;
  const fetch: FetchLike = async (url, init) => {
    const reply = (status: number, data: unknown) => ({ ok: status < 300, status, json: async () => data, text: async () => "" });
    if (url === "https://api.brightdata.com/request") {
      const q = new URL(JSON.parse(init.body!).url).searchParams.get("q") ?? "";
      return reply(200, gravieSerp(q));
    }
    if (url.includes("/scrape")) return reply(202, { snapshot_id: "sd_abc12345" });
    if (url.includes("/progress/sd_abc12345")) return reply(200, { status: ++progressCalls > 1 ? "ready" : "running" });
    if (url.includes("/snapshot/sd_abc12345")) return reply(200, COMPANIES);
    throw new Error(`unexpected ${url}`);
  };
  const r = await findCompanyPages(GRAVIE, { fetch, apiKey: "k", sleep: async () => {} });
  assert.equal(r.linkedin, "found");
  assert.equal(r.glassdoor, "found");
  assert.equal(progressCalls, 2);
});

test("a bad snapshot id from Bright Data is refused before it reaches a URL", async () => {
  const fetch: FetchLike = async (url, init) => {
    const reply = (status: number, data: unknown) => ({ ok: status < 300, status, json: async () => data, text: async () => "" });
    if (url === "https://api.brightdata.com/request") {
      const q = new URL(JSON.parse(init.body!).url).searchParams.get("q") ?? "";
      return reply(200, gravieSerp(q));
    }
    if (url.includes("/scrape")) return reply(202, { snapshot_id: "../../customer/balance" });
    throw new Error(`should not fetch ${url}`);
  };
  const r = await findCompanyPages(GRAVIE, { fetch, apiKey: "k", sleep: async () => {} });
  assert.equal(r.linkedin, "error");
  assert.ok(r.notes.some((n) => n.includes("invalid snapshot_id")));
});
