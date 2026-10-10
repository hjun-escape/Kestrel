import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import SourceStatusRow from "@/components/SourceStatusRow";
import CheckTrace from "@/components/CheckTrace";
import CompanyHeader from "@/components/CompanyHeader";
import SignalTimeline from "@/components/SignalTimeline";
import { filterRecentSignals } from "@/lib/borrowerUtils";
import { scoreBorrower } from "../../base44/functions/scoreBorrower/entry.ts";
import WarningScore from "@/components/WarningScore";
// The same CheckRun builder newsSignals uses on the server, so this replay renders exactly what a live check saves.
import { applyEvent, addLog, applyLinkedIn, newCheckRun } from "../../base44/functions/newsSignals/trace.ts";

// /dev/progression: the whole journey for one example company (TGI Fridays, from a real run on Oct 10):
//   1. Add company   the "Screen new applicant" form is filled in and submitted
//   2. Checking      the company page while the check runs: progress bar, steps filling in, activity log
//   3. Report        the finished company page: status, warning score, sources, how it was checked, evidence.
//                    This is the page a credit officer comes back to from the loan book.
// It reuses the app's real components and the server's CheckRun builder. No data source is called, nothing is saved.

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

const COMPANY = {
  id: "demo-tgi",
  name: "TGI Fridays",
  website_domain: "tgifridays.com",
  industry: "Restaurants",
  hq_city: "Dallas",
  hq_state: "TX",
  stage: "applicant",
  loan_amount_usd: 4500000,
  status: "green",
  why: "",
  last_refreshed: null,
  sources_unavailable: [],
};

const FIELDS = [
  ["name", "Company name", "col-span-6"],
  ["website_domain", "Website domain", "col-span-3"],
  ["industry", "Industry", "col-span-3"],
  ["hq_city", "HQ city", "col-span-4"],
  ["hq_state", "HQ state", "col-span-2"],
  ["loan_amount_usd", "Amount requested (USD)", "col-span-6"],
];

const STAGES = [
  { id: "add", title: "1. Add company", sub: "Screen new applicant" },
  { id: "check", title: "2. Checking", sub: "Sources answer one by one" },
  { id: "report", title: "3. Report", sub: "Saved company page" },
];

// Signals as refreshBorrower stores them: newsSignals keeps the newest per type and severity,
// so one event reported by several outlets counts once.
function storedSignals(run) {
  const kept = (run?.articles || []).filter((a) => a.decision === "kept");
  return [...kept]
    .sort((x, z) => z.date.localeCompare(x.date))
    .filter((a, i, all) => all.findIndex((o) => o.signal_type === a.signal_type && o.severity === a.severity) === i)
    .map((a, i) => ({
      id: `demo-sig-${i}`,
      borrower_id: COMPANY.id,
      type: a.signal_type,
      severity: a.severity,
      date: a.date,
      title: a.title,
      snippet: a.snippet,
      source_name: a.source,
      source_url: a.url,
    }));
}

function Stepper({ stage, reached, onGo }) {
  return (
    <ol className="mb-4 grid grid-cols-1 gap-px border border-ew-rule bg-ew-rule sm:grid-cols-3">
      {STAGES.map((s, i) => {
        const idx = STAGES.findIndex((x) => x.id === stage);
        const state = s.id === stage ? "Current" : i < idx || reached.includes(s.id) ? "Done" : "Next";
        const can = reached.includes(s.id);
        return (
          <li key={s.id} className="flex">
            <button
              type="button"
              disabled={!can}
              onClick={() => onGo(s.id)}
              aria-current={s.id === stage ? "step" : undefined}
              className={`flex w-full items-baseline justify-between gap-2 px-4 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus disabled:cursor-default ${
                s.id === stage ? "bg-ew-hover shadow-[inset_0_-2px_0_var(--ew-ink)]" : "bg-ew-surface hover:bg-ew-hover disabled:hover:bg-ew-surface"
              }`}
            >
              <span>
                <span className="block font-heading text-sm font-bold text-ew-ink">{s.title}</span>
                <span className="block text-xs text-ew-muted">{s.sub}</span>
              </span>
              <span className={`text-xs font-semibold ${state === "Next" ? "text-ew-muted" : "text-ew-ink"}`}>{state}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function AddCompanyStep({ form, typing, onSubmit }) {
  return (
    <div className="border border-ew-rule bg-ew-surface">
      <div className="border-b border-ew-rule px-5 py-3">
        <h2 className="font-heading text-lg font-bold text-ew-ink">Screen new applicant</h2>
        <p className="text-sm text-ew-muted">The officer enters the company. Screening starts the moment it is saved.</p>
      </div>
      <form
        className="grid grid-cols-6 gap-3 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {FIELDS.map(([key, label, span]) => (
          <label key={key} className={`flex flex-col gap-1 text-sm text-ew-ink ${span}`}>
            {label}
            <input
              readOnly
              value={form[key] ?? ""}
              className="rounded-sm border border-ew-rule bg-ew-paper px-2.5 py-1.5 font-mono text-[13px] text-ew-ink"
            />
          </label>
        ))}
        <div className="col-span-6 flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-ew-muted">Stage: Applicant</span>
          <button
            type="submit"
            disabled={typing}
            className="rounded-sm border border-ew-ink bg-ew-ink px-3 py-1.5 text-sm font-semibold text-ew-surface hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus"
          >
            {typing ? "Filling in..." : "Screen applicant"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CompanyPage({ borrower, run, signals, running, startedAt, states }) {
  const recentSignals = filterRecentSignals(signals);
  return (
    <>
      <div className="border border-ew-rule bg-ew-surface">
        <CompanyHeader borrower={borrower} sourceStates={states} running={running} refreshError={null} onRefresh={() => {}} />
        <SourceStatusRow states={states} recentSignals={recentSignals} running={running} startedAt={startedAt} />
        <WarningScore borrower={borrower} signals={signals} />
        <CheckTrace run={run} refreshing={running} stale={false} />
      </div>
      <section aria-labelledby="demo-evidence-heading" className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="demo-evidence-heading" className="font-heading text-xl font-bold tracking-tight text-ew-ink">
            Evidence
          </h2>
          <p className="font-mono text-xs text-ew-muted">{recentSignals.length} in last 90 days</p>
        </div>
        <SignalTimeline signals={signals} neverRefreshed={!borrower.last_refreshed} checking={running} newIds={null} />
      </section>
    </>
  );
}

export default function DevProgression() {
  const [stage, setStage] = useState("add");
  const [reached, setReached] = useState(["add"]);
  const [form, setForm] = useState({});
  const [typing, setTyping] = useState(false);
  const [run, setRun] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const timers = useRef([]);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms / speed));

  function stop() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function startCheck() {
    const r = newCheckRun(COMPANY.id, new Date(), true);
    setStage("check");
    setReached(["add", "check"]);
    setRun(null);
    setStartedAt(Date.now());
    setPlaying(true);
    // The page only sees a run once newsSignals has saved it, about a second in.
    later(1000, () => setRun(structuredClone(r)));
    for (const [at, step] of buildScript()) {
      later(at * 1000, () => {
        step(r);
        r.updated_at = new Date().toISOString();
        setRun(structuredClone(r));
        if (r.status !== "running") {
          setPlaying(false);
          setReached(["add", "check", "report"]);
          later(1800, () => setStage("report"));
        }
      });
    }
  }

  // Types the company in field by field, then submits, like an officer would.
  function playAll() {
    stop();
    setStage("add");
    setReached(["add"]);
    setRun(null);
    setPlaying(false);
    setForm({});
    setTyping(true);
    let t = 300;
    for (const [key] of FIELDS) {
      const value = String(COMPANY[key]);
      for (let i = 1; i <= value.length; i++) {
        later(t, () => setForm((f) => ({ ...f, [key]: value.slice(0, i) })));
        t += 45;
      }
      t += 150;
    }
    later(t, () => setTyping(false));
    later(t + 900, startCheck);
  }

  useEffect(() => {
    playAll();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finished = run && run.status !== "running";
  const signals = finished ? storedSignals(run) : [];
  const scored = finished ? scoreBorrower(signals) : null;
  const borrower = {
    ...COMPANY,
    ...(finished
      ? { status: scored.status, why: scored.why, last_refreshed: run.finished_at, sources_unavailable: ["Jobs", "Reviews"] }
      : {}),
  };
  // Jobs and Reviews are switched off in refreshBorrower today, so they answer "unavailable" right away.
  const states = {
    News: finished ? "ok" : "checking",
    Legal: finished ? "ok" : "checking",
    Jobs: "unavailable",
    Reviews: "unavailable",
  };

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
            <h1 className="font-heading text-2xl font-bold tracking-tight text-ew-ink">From application to report (example)</h1>
            <p className="mt-1 max-w-2xl text-sm text-ew-muted">
              One applicant, TGI Fridays, from being added to the finished report, replayed from a real check on Oct 10.
              No data source is called and nothing is saved.
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
              onClick={playAll}
              className="rounded-sm border border-ew-ink bg-ew-ink px-3 py-1.5 text-sm font-semibold text-ew-surface hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus"
            >
              Play from the start
            </button>
          </div>
        </div>

        <Stepper stage={stage} reached={reached} onGo={setStage} />

        {stage === "add" && (
          <AddCompanyStep form={form} typing={typing} onSubmit={() => { stop(); startCheck(); }} />
        )}

        {stage === "check" && (
          <CompanyPage borrower={borrower} run={run} signals={signals} running={playing} startedAt={startedAt} states={states} />
        )}

        {stage === "report" && (
          <>
            <p className="mb-3 border border-ew-rule bg-ew-surface px-4 py-2.5 text-sm text-ew-ink-soft">
              This is the saved report: the company page. It stays in the loan book, so the officer can come back to it
              any time, and Refresh runs the same check again. Open &ldquo;How News and Legal were checked&rdquo; to see
              every step behind it.
            </p>
            <CompanyPage borrower={borrower} run={run} signals={signals} running={false} startedAt={null} states={states} />
          </>
        )}
      </main>
    </div>
  );
}
