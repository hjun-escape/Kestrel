import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AboutWorkflow from "@/components/AboutWorkflow";

// General About page (header "About"): plain and short, in the app's light style.

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

        <AboutWorkflow />

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
