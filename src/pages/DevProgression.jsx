import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import SourceStatusRow from "@/components/SourceStatusRow";
import CheckTrace from "@/components/CheckTrace";
import WarningScore from "@/components/WarningScore";
// The same CheckRun builder newsSignals uses on the server, so this replay renders exactly what a live check saves.
import { applyEvent, addLog, applyLinkedIn, newCheckRun } from "../../base44/functions/newsSignals/trace.ts";

// /dev/progression: replays one example news check (TGI Fridays, from a real run on Oct 10)
// through the company page's progress bar and "How News and Legal were checked" panel.
// No data source is called and nothing is saved.

const A = (title, source, date, url, query) => ({ title, source, date, url, query });
const ARTICLES = [
  A("TGI Fridays liquidation plan approved as Chapter 11 winds down", "Restaurant Business", "2026-07-28", "https://example.com/tgi-liquidation", "legal_layoffs"),
  A("TGI Friday's Dining Chain Approved for Bankruptcy Wind-Down Plan", "Bloomberg Law", "2026-07-23", "https://example.com/tgi-wind-down", "legal_layoffs"),
  A("TGI Fridays in Brooklyn, the Last of the Chain's Locations in Ohio, Has Closed", "Cleveland Scene", "2026-09-10", "https://example.com/tgi-ohio", "legal_layoffs"),
  A("TGI Fridays store closures: See a list of locations that have lost the most restaurants", "USA Today", "2026-08-07", "https://example.com/tgi-closures-list", "legal_layoffs"),
  A("TGI Fridays Plan OK'd, Spirit Can Sell NYC Gates To JetBlue", "Law360", "2026-07-27", "https://example.com/tgi-plan-ok", "legal_layoffs"),
  A("How TGI Fridays CEO Ray Blanchette plans to keep the 61-year-old brand young", "Nation's Restaurant News", "2026-08-11", "https://example.com/tgi-ceo-interview", "exec_departure"),
  A("Man in custody after shooting outside Southfield TGI Fridays", "Detroit Free Press", "2026-09-28", "https://example.com/tgi-southfield", "exec_departure"),
  A("Trump calls out UAW president Shawn Fain", "Detroit News", "2026-09-30", "https://example.com/uaw", "exec_departure"),
  A("County clerk reacts to Trump address & Cox departs race for governor", "WILX", "2026-09-24", "https://example.com/clerk", "exec_departure"),
  A("Millions not eligible for President Trump's Medicare rebate", "Newsweek", "2026-10-02", "https://example.com/medicare", "exec_departure"),
];

const T = (relevant, same, type, sev, reason) => ({ relevant, same_company: same, signal_type: type, severity: sev, snippet: "", reason });
const TAGS = [
  [T(true, true, "legal_layoffs", "strong", "Reports court approval of TGI Fridays' liquidation plan in its Chapter 11 case."), "kept", "TGI Fridays' liquidation plan was approved by the bankruptcy court"],
  [T(true, true, "legal_layoffs", "strong", "Same bankruptcy wind-down event, reported by another outlet."), "kept", "approved for a bankruptcy wind-down plan"],
  [T(true, true, "legal_layoffs", "weak", "Reports a new restaurant closure, the chain's last location in Ohio."), "kept", "the last of the chain's locations in Ohio, has closed"],
  [T(true, true, "legal_layoffs", "weak", "Lists store closures, but the quote returned is not in the article text."), "dropped", null, "snippet guard: not an exact quote"],
  [T(true, true, "legal_layoffs", "strong", "Reports the bankruptcy plan approval."), "kept", "TGI Fridays Plan OK'd"],
  [T(false, true, "none", "none", "An interview about brand strategy; the CEO is not leaving."), "dropped", null, "not relevant"],
  [T(false, true, "none", "none", "About a shooting outside a restaurant, not an executive leaving or a legal action."), "dropped", null, "not relevant"],
  [T(false, false, "none", "none", "About the UAW president and the auto industry, not TGI Fridays."), "dropped", null, "not relevant"],
  [T(false, false, "none", "none", "About Michigan politics, not TGI Fridays."), "dropped", null, "not relevant"],
  [T(false, false, "none", "none", "About Medicare rebates, not TGI Fridays."), "dropped", null, "not relevant"],
];

const LINKEDIN = [
  { exec: "Weldon Spangler", profile_url: "https://www.linkedin.com/in/weldon-spangler", result: "unconfirmed", detail: 'Profile shows current employer "Jolly" but no dated role at TGI Fridays' },
  { exec: "Brandon Coleman III", profile_url: "https://www.linkedin.com/in/bccoleman3", result: "unconfirmed", detail: "No dated role at this company on the profile" },
  { exec: "Nik Rupp", profile_url: "https://www.linkedin.com/in/nik-rupp", result: "unconfirmed", detail: 'Profile shows current employer "Uniq Advisory" but no dated role at TGI Fridays' },
];

// [seconds from start, step]. Timings follow the real run.
function buildScript() {
  const steps = [
    [0.3, (r) => addLog(r, "1. Searching Google News via Bright Data (executive departures, legal and layoffs)", 0.3)],
    [0.8, (r) => addLog(r, "A. Searching for leadership: \"TGI Fridays\" CEO CFO executive leadership", 0.8)],
    [5.7, (r) => {
      applyEvent(r, { kind: "search", query_type: "exec_departure", query: '"TGI Fridays" (CEO OR CFO OR president OR founder) (resigns OR "steps down" OR departs OR leaves)', ok: true, count: 5 });
      applyEvent(r, { kind: "search", query_type: "legal_layoffs", query: '"TGI Fridays" (lawsuit OR sued OR lien OR "WARN notice" OR layoffs OR bankruptcy)', ok: true, count: 5 });
      addLog(r, "1. Search exec_departure: 5 articles in the last 180 days", 5.7);
      addLog(r, "1. Search legal_layoffs: 5 articles in the last 180 days", 5.7);
      addLog(r, "2. Reading and tagging 10 articles (one LLM call each)...", 5.7);
    }],
  ];
  ARTICLES.forEach((a, i) => {
    const readAt = 7 + i * 0.6;
    steps.push([readAt, (r) => {
      applyEvent(r, { kind: "read", ...a, read: i !== 3 && i !== 8 });
    }]);
  });
  ARTICLES.forEach((a, i) => {
    const [tag, decision, snippet, why] = TAGS[i];
    const at = 10.5 + i * 1.1;
    steps.push([at, (r) => {
      applyEvent(r, { kind: "tag", url: a.url, tag, decision, why: why || "kept", ...(snippet ? { snippet } : {}) });
      addLog(r, `${decision === "kept" ? "KEEP" : "drop"} ${a.title.slice(0, 70)} -> ${why || "kept"} | model: "${tag.reason}"`, at);
    }]);
  });
  steps.push([16, (r) => addLog(r, "C. Scraping 3 LinkedIn profile(s)...", 16)]);
  steps.push([22, (r) => {
    applyLinkedIn(r, LINKEDIN);
    LINKEDIN.forEach((c) => addLog(r, `D. ${c.exec}: ${c.result} (${c.detail})`, 22));
  }]);
  steps.push([22.6, (r) => {
    addLog(r, "3. 2 signals (newest per type and severity)", 22.6);
    r.status = "done";
    r.finished_at = new Date().toISOString();
    r.signal_count = 2;
  }]);
  return steps.sort((a, z) => a[0] - z[0]);
}

const SPEEDS = [1, 2, 4];

export default function DevProgression() {
  const [run, setRun] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const timers = useRef([]);

  function stop() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function play() {
    stop();
    const r = newCheckRun("demo", new Date(), true);
    setRun(null);
    setStartedAt(Date.now());
    setPlaying(true);
    // The real page only sees a run once newsSignals has saved it, about a second in.
    timers.current.push(setTimeout(() => setRun(structuredClone(r)), 1000 / speed));
    for (const [at, step] of buildScript()) {
      timers.current.push(setTimeout(() => {
        step(r);
        r.updated_at = new Date().toISOString();
        setRun(structuredClone(r));
        if (r.status !== "running") setPlaying(false);
      }, (at * 1000) / speed));
    }
  }

  useEffect(() => {
    play();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchDone = (run?.searches || []).length >= 2;
  const newsDone = run && run.status !== "running";
  // Jobs and Reviews are switched off in refreshBorrower today, so they answer "unavailable" right away.
  const states = {
    News: newsDone ? "ok" : "checking",
    Legal: newsDone ? "ok" : "checking",
    Jobs: "unavailable",
    Reviews: "unavailable",
  };
  const kept = (run?.articles || []).filter((a) => a.decision === "kept");
  // Signals as refreshBorrower would store them once the check finishes.
  // newsSignals keeps the newest signal per type and severity, so one event reported by several outlets counts once.
  const signals = newsDone
    ? [...kept]
      .sort((x, z) => z.date.localeCompare(x.date))
      .filter((a, i, all) => all.findIndex((o) => o.signal_type === a.signal_type && o.severity === a.severity) === i)
      .map((a) => ({ type: a.signal_type, severity: a.severity, date: a.date, title: a.title, source_name: a.source, source_url: a.url }))
    : [];
  const recentSignals = signals;

  return (
    <div className="min-h-screen bg-ew-paper text-ew-ink">
      <AppHeader />
      <main className="mx-auto max-w-[1360px] px-6 pb-16 pt-4">
        <nav aria-label="Breadcrumb" className="mb-3">
          <Link to="/" className="inline-flex items-center gap-1 rounded-sm text-sm text-ew-muted hover:text-ew-ink">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Loan book
          </Link>
        </nav>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-ew-ink">Check progression (example)</h1>
            <p className="mt-1 max-w-2xl text-sm text-ew-muted">
              A replay of one news check on TGI Fridays, shown the way the company page shows a live Refresh. No data
              source is called and nothing is saved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-ew-muted">
              Speed
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="rounded-sm border border-ew-rule bg-ew-surface px-2 py-1 text-sm text-ew-ink"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>{s}x</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={play}
              className="rounded-sm border border-ew-ink bg-ew-ink px-3 py-1.5 text-sm font-semibold text-ew-surface hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus"
            >
              {playing ? "Restart" : "Replay"}
            </button>
          </div>
        </div>

        <div className="border border-ew-rule bg-ew-surface">
          <div className="px-5 pb-1 pt-4">
            <p className="font-heading text-lg font-bold text-ew-ink">TGI Fridays</p>
            <p className="text-sm text-ew-muted">tgifridays.com · Dallas, TX · Restaurants</p>
            <p className="mt-1 font-mono text-xs text-ew-ink-soft">
              {playing ? (searchDone ? "Reading and tagging articles..." : "Searching...") : "Check finished"}
            </p>
          </div>
          <SourceStatusRow states={states} recentSignals={recentSignals} running={playing} startedAt={startedAt} />
          <WarningScore borrower={{ last_refreshed: newsDone ? run.finished_at : null }} signals={signals} />
          <CheckTrace run={run} refreshing={playing} stale={false} />
        </div>
      </main>
    </div>
  );
}
