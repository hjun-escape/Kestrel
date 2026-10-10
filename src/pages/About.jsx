import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";

// General About page (header "About"): plain and short, in the app's light style.

const SOURCES = ["News", "Court filings and WARN notices", "Job posts", "Employee reviews", "LinkedIn", "The applicant's cash-flow statement"];

const RULES = [
  { title: "AI reads", body: "It tags each article or review and copies the exact sentence that matters. It never sets a status." },
  { title: "Rules decide", body: "Fixed thresholds over the last 90 days: 2 strong flags, or 1 strong and 2 weak, is Red; 1 strong or 2 weak is Yellow." },
  { title: "You approve", body: "Every flag shows its source, date and quote. The credit decision stays with the officer." },
];

export default function About() {
  useEffect(() => {
    const previous = document.title;
    document.title = "About | Kestrel";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-ew-paper text-ew-ink">
      <AppHeader />
      <main id="main" className="mx-auto max-w-[720px] px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="font-heading text-[32px] font-bold leading-tight tracking-[-0.01em]">About Kestrel</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ew-ink-soft">
          Kestrel screens mid-size private companies before a bank lends, and keeps watching them after the loan closes.
          These companies report quarterly, 45 to 90 days after quarter end. Departures, layoffs, lawsuits and missed
          payments show up in public well before that.
        </p>

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-ew-muted">What it checks</h2>
        <ul className="mt-3 grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
          {SOURCES.map((s) => (
            <li key={s} className="border-b border-ew-rule-soft pb-2">
              {s}
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-ew-muted">How it decides</h2>
        <dl className="mt-3 divide-y divide-ew-rule border-y border-ew-rule">
          {RULES.map((r) => (
            <div key={r.title} className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-[15px] font-semibold">{r.title}</dt>
              <dd className="text-[15px] leading-relaxed text-ew-ink-soft">{r.body}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-ew-muted">Data</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ew-ink-soft">
          Public web data is collected through Bright Data. Every flag links to the page it came from.
        </p>

        <p className="mt-10 flex flex-wrap gap-4 text-[14px] font-semibold">
          <Link to="/" className="underline underline-offset-4 hover:text-ew-ink-soft">
            Open the loan book
          </Link>
          <Link to="/welcome" className="underline underline-offset-4 hover:text-ew-ink-soft">
            See how a check runs
          </Link>
        </p>
      </main>
    </div>
  );
}
