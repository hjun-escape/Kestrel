// Run: node --test tests/*.test.ts   (Node 22+, runs .ts via type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { scoreBorrower, type Signal } from "../base44/functions/scoreBorrower/entry.ts";

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
  // Strong first, then newest: the hiring drop (Oct 10) comes before the CFO departure (Sep 12).
  assert.deepEqual(scoreBorrower(s, TODAY), {
    status: "red",
    why: "Red: Job postings 84% below normal for company size + CFO departure (Sep 12).",
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
  assert.match(other, /^Yellow: Something entirely different happened at the… \(Oct 1\)\.$/);
});
