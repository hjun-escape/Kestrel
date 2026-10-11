// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { eventName, scoreBorrower, shortTitle, type Signal } from "../base44/functions/scoreBorrower/entry.ts";

const TODAY = "2026-10-10";

function sig(severity: "strong" | "weak", date: string, title = "Signal", type: Signal["type"] = "legal_layoffs"): Signal {
  return { type, severity, date, title };
}

test("no signals is green", () => {
  assert.deepEqual(scoreBorrower([], TODAY), {
    status: "green",
    why: "Green: no warning signs in the last 90 days.",
  });
});

test("1 weak is green", () => {
  assert.equal(scoreBorrower([sig("weak", "2026-10-01")], TODAY).status, "green");
});

test("2 weak is yellow", () => {
  assert.equal(scoreBorrower([sig("weak", "2026-10-01"), sig("weak", "2026-09-01")], TODAY).status, "yellow");
});

test("1 strong is yellow", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01")], TODAY).status, "yellow");
});

test("1 strong + 1 weak is yellow", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01"), sig("weak", "2026-10-02")], TODAY).status, "yellow");
});

test("1 strong + 2 weak is red", () => {
  const s = [sig("strong", "2026-10-01"), sig("weak", "2026-10-02"), sig("weak", "2026-10-03")];
  assert.equal(scoreBorrower(s, TODAY).status, "red");
});

test("2 strong is red", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01"), sig("strong", "2026-09-01")], TODAY).status, "red");
});

test("signals older than 90 days are ignored", () => {
  // 2026-07-12 is exactly 90 days before TODAY (counts); 2026-07-11 is 91 (ignored).
  assert.equal(scoreBorrower([sig("strong", "2026-07-12")], TODAY).status, "yellow");
  assert.equal(scoreBorrower([sig("strong", "2026-07-11")], TODAY).status, "green");
  assert.equal(scoreBorrower([sig("strong", "2026-07-11"), sig("strong", "2026-01-01")], TODAY).status, "green");
});

test("future-dated and malformed signals are ignored", () => {
  const s = [sig("strong", "2026-10-11"), sig("strong", "Sep 12"), { ...sig("strong", "2026-10-01"), severity: "high" as any }];
  assert.equal(scoreBorrower(s, TODAY).status, "green");
});

test("why line matches the CLAUDE.md example", () => {
  const s = [
    sig("strong", "2026-09-12", "CFO departure", "exec_departure"),
    sig("strong", "2026-10-10", "Job postings 84% below normal for company size", "hiring_drop"),
  ];
  // Strong first, then the worst event: a CFO exit outranks a newer hiring drop (this is the exact CLAUDE.md example).
  assert.deepEqual(scoreBorrower(s, TODAY), {
    status: "red",
    why: "Red: CFO departure (Sep 12) + Job postings 84% below normal for company size.",
  });
});

test("why line puts strong before weak and caps at 2", () => {
  const s = [
    sig("weak", "2026-10-05", "Lawsuit filed by landlord"),
    sig("strong", "2026-08-01", "WARN notice filed"),
    sig("weak", "2026-10-08", "VP Sales departs", "exec_departure"),
  ];
  assert.deepEqual(scoreBorrower(s, TODAY), {
    status: "red",
    why: "Red: WARN notice (Aug 1) + VP Sales departs (Oct 8).",
  });
});

test("yellow on weak only lists the two newest", () => {
  const s = [sig("weak", "2026-09-01", "A"), sig("weak", "2026-10-01", "B"), sig("weak", "2026-08-01", "C")];
  assert.deepEqual(scoreBorrower(s, TODAY), { status: "yellow", why: "Yellow: B (Oct 1) + A (Sep 1)." });
});

test("expired signals never appear in the why line", () => {
  const s = [sig("strong", "2026-01-01", "Old bankruptcy rumor"), sig("strong", "2026-10-01", "CEO resigns", "exec_departure")];
  assert.deepEqual(scoreBorrower(s, TODAY), { status: "yellow", why: "Yellow: CEO departure (Oct 1)." });
});

test("invalid today throws", () => {
  assert.throws(() => scoreBorrower([], "10/10/2026"));
});

test("Base44 handler takes { signals, today } like refreshBorrower sends", async () => {
  const req = new Request("http://x", { method: "POST", body: JSON.stringify({ signals: [sig("strong", "2026-10-01", "CEO resigns")], today: TODAY }) });
  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "yellow", why: "Yellow: CEO resigns (Oct 1)." });
});

test("dates with a time attached count, by their calendar date", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-10-01T00:00:00Z")], TODAY).status, "yellow");
  assert.equal(scoreBorrower([sig("strong", "2026-10-01T23:59:59.000Z", "CEO resigns")], TODAY).why, "Yellow: CEO resigns (Oct 1).");
  assert.equal(scoreBorrower([sig("strong", "2026-07-11T12:00:00Z")], TODAY).status, "green"); // 91 days
});

test("impossible dates are ignored", () => {
  assert.equal(scoreBorrower([sig("strong", "2026-02-30")], TODAY).status, "green");
});

test("the same event reported twice counts once", () => {
  const a = { ...sig("strong", "2026-10-01", "Acme CFO steps down", "exec_departure"), source_url: "https://news.example.com/a" };
  // Same article twice (trailing slash, title case differ), and same headline on the same day from another outlet.
  const s = [a, { ...a, source_url: "https://news.example.com/a/", title: "ACME CFO steps down" }, { ...a, source_url: "https://other.example.com/b" }];
  assert.deepEqual(scoreBorrower(s, TODAY), { status: "yellow", why: "Yellow: CFO departure (Oct 1)." });
});

test("different events are not merged: same link with different titles, or same title on different days", () => {
  const page = "https://www.glassdoor.com/Reviews/Acme-Reviews-E1.htm";
  const strong = { ...sig("strong", "2026-10-01", "Employee review mentions layoffs", "review_distress"), source_url: page };
  const weak = { ...sig("weak", "2026-10-01", "Glassdoor rating down 0.7 in 90 days", "review_distress"), source_url: page };
  const weak2 = { ...sig("weak", "2026-09-01", "Lawsuit filed"), source_url: "https://x.example.com/1" };
  const weak3 = { ...sig("weak", "2026-09-20", "Lawsuit filed"), source_url: "https://x.example.com/2" };
  assert.equal(scoreBorrower([strong, weak, weak2, weak3], TODAY).status, "red");
});

test("a duplicate keeps the strongest copy", () => {
  const w = { ...sig("weak", "2026-10-01", "WARN notice filed"), source_url: "https://x.example.com/w" };
  const s = { ...w, severity: "strong" as const };
  assert.equal(scoreBorrower([w, s], TODAY).status, "yellow");
});

test("why line names news events instead of quoting long headlines", () => {
  const s = [
    sig("strong", "2026-09-10", "Rivian (RIVN) CFO steps down for GE Vernova amid critical R2 ramp", "exec_departure"),
    sig("weak", "2026-10-06", "Family of man killed in loading dock incident at Rivian files wrongful death lawsuit"),
  ];
  assert.deepEqual(scoreBorrower(s, TODAY), {
    status: "yellow",
    why: "Yellow: CFO departure (Sep 10) + Wrongful-death lawsuit (Oct 6).",
  });
  assert.equal(
    scoreBorrower([sig("strong", "2026-09-29", "Equipment lender sues Crestline Logistics over missed payments")], TODAY).why,
    "Yellow: Lender lawsuit (Sep 29).",
  );
});

test("why line names closures, shutdowns and WARN Act cases; unnamed headlines are shortened, not made generic", () => {
  const amys = [
    sig("strong", "2026-09-19", "$1B frozen food giant pulls plug on California manufacturing in shock retreat"),
    sig("weak", "2026-09-26", "Amy’s Kitchen Built Its Food Empire in Santa Rosa. Now It’s Closing Its First Factory"),
  ];
  assert.equal(scoreBorrower(amys, TODAY).why, "Yellow: Shutdown (Sep 19) + Plant closure (Sep 26).");
  assert.equal(
    scoreBorrower([sig("strong", "2026-09-10", "State investigating Essendant, century-old office supply firm, for layoffs that may have violated WARN Act")], TODAY).why,
    "Yellow: WARN Act investigation (Sep 10).",
  );
  const other = scoreBorrower([sig("strong", "2026-10-01", "Something entirely different happened at the company headquarters this week")], TODAY).why;
  assert.match(other, /^Yellow: Something entirely different happened at the company… \(Oct 1\)\.$/);
});

test("eventName recognizes common layoff headline phrasings without overriding closures", () => {
  const cases = [
    ["Sapporo’s Stone Brewing plant cutting hundreds of jobs as production moves out of San Diego County", "Layoffs"],
    ["Mexican food manufacturer cuts 176 California workers", "Layoffs"],
    ["Acme lays off 40 staff", "Layoffs"],
    ["Acme is laying off 58 workers in Ohio", "Layoffs"],
    ["Acme to close Ohio plant, cutting 200 jobs", "Plant closure"],
    ["Acme cuts prices", "Acme cuts prices"],
  ];

  for (const [title, expected] of cases) {
    assert.equal(eventName(sig("strong", TODAY, title)), expected);
  }
});

test("why line leads with the worst event, not the newest (Essendant)", () => {
  const s = [
    sig("strong", "2026-10-10", "No open job postings (about 56 expected for a company this size)", "hiring_drop"),
    sig("strong", "2026-09-25", "Employee review mentions closing", "review_distress"),
    sig("strong", "2026-09-11", "Major U.S. distributor cuts 1,278 jobs amid liquidation risk"),
    sig("weak", "2026-10-09", "Lawsuit filed by landlord"),
  ];
  const { status, why } = scoreBorrower(s, TODAY);
  assert.equal(status, "red");
  assert.match(why, /^Red: Cuts 1,278 jobs amid liquidation risk \(Sep 11\) \+ /);
  assert.ok(why.indexOf("1,278 jobs") < why.indexOf("No open job postings") || !why.includes("No open job postings"));
});

test("within strong, existential events beat other strong signals; weak never beats strong", () => {
  const s = [
    sig("strong", "2026-10-09", "Equipment lender sues Acme over missed payments"),
    sig("strong", "2026-09-01", "Acme files for Chapter 11 bankruptcy"),
    sig("weak", "2026-10-10", "Acme liquidation rumor on forum"),
  ];
  assert.equal(scoreBorrower(s, TODAY).why, "Red: Bankruptcy filing (Sep 1) + Lender lawsuit (Oct 9).");
});

test("same event from two outlets counts once (Amy's Kitchen Santa Rosa closure)", () => {
  const nyPost = { ...sig("strong", "2026-09-19", "Amy's Kitchen Santa Rosa factory closure, 260 jobs"), source_name: "NY Post", source_url: "https://nypost.com/a" };
  const inc = { ...sig("strong", "2026-09-26", "Amy's Kitchen closing Santa Rosa plant, 207 jobs"), source_name: "Inc.", source_url: "https://inc.com/b" };
  const r = scoreBorrower([inc, nyPost], TODAY);
  assert.equal(r.status, "yellow");
  assert.equal(r.why, "Yellow: Plant closure (Sep 19).");
});

test("same event named by place in the snippet merges too", () => {
  const a = { ...sig("strong", "2026-09-19", "$1B frozen food giant pulls plug on California manufacturing"), snippet: "The company will close its Santa Rosa plant, laying off 260 workers." };
  const b = { ...sig("weak", "2026-09-26", "Amy's Kitchen Is Closing Its First Factory"), snippet: "The factory in Santa Rosa will close, affecting 207 employees." };
  assert.equal(scoreBorrower([a, b], TODAY).status, "yellow");
  assert.equal(scoreBorrower([a, b], TODAY).why, "Yellow: Shutdown (Sep 19).");
});

test("different plant closures in different cities stay two events", () => {
  const a = sig("strong", "2026-09-19", "Acme closing Santa Rosa plant, 260 jobs");
  const b = sig("strong", "2026-09-26", "Acme closing Pocatello plant, 210 jobs");
  assert.equal(scoreBorrower([a, b], TODAY).status, "red");
});

test("same place but job counts far apart, or more than 14 days apart, are not merged", () => {
  const a = sig("strong", "2026-09-01", "Acme closing Santa Rosa plant, 260 jobs");
  const far = sig("strong", "2026-09-20", "Acme closing Santa Rosa plant, 250 jobs");
  const diffCount = sig("strong", "2026-09-05", "Acme closing Santa Rosa plant, 90 jobs");
  assert.equal(scoreBorrower([a, far], TODAY).status, "red");
  assert.equal(scoreBorrower([a, diffCount], TODAY).status, "red");
});

test("no shared place or count: same type within 14 days is not merged", () => {
  const a = sig("strong", "2026-09-19", "Acme announces layoffs");
  const b = sig("strong", "2026-09-22", "Acme shuts down Texas unit");
  assert.equal(scoreBorrower([a, b], TODAY).status, "red");
});

test("unnamed headline: a clean clause break is kept whole, no ellipsis", () => {
  assert.equal(shortTitle("Major U.S. distributor cuts 1,278 jobs amid liquidation risk"), "Major U.S. distributor cuts 1,278 jobs amid liquidation risk");
  assert.equal(
    shortTitle("Major U.S. distributor cuts 1,278 jobs amid liquidation risk and a search for buyers"),
    "Major U.S. distributor cuts 1,278 jobs",
  );
});

test("unnamed headline: no clause boundary falls back to a word cut under 64 chars with ellipsis", () => {
  const t = "Regional freight carrier reports mounting losses and declining shipments across its network";
  assert.equal(t.length > 64, true);
  assert.equal(
    shortTitle(t),
    "Regional freight carrier reports mounting losses and declining…",
  );
});
