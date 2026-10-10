import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AppHeader from "@/components/AppHeader";
import CompanyHeader from "@/components/CompanyHeader";
import SourceStatusRow from "@/components/SourceStatusRow";
import SignalTimeline from "@/components/SignalTimeline";
import DecisionBar from "@/components/DecisionBar";
import {
  POLL_INTERVAL_MS,
  deriveSourceStates,
  filterRecentSignals,
  getActiveRefresh,
  isAtRisk,
  startRefresh,
} from "@/lib/borrowerUtils";

async function fetchCompany(id) {
  const [borrower, sigRes] = await Promise.all([
    base44.entities.Borrower.get(id),
    base44.entities.Signal.filter({ borrower_id: id }, { limit: 200, sort: "-date" }),
  ]);
  return { borrower, signals: sigRes.items || [] };
}

export default function CompanyDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const idRef = useRef(id);
  const [borrower, setBorrower] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [run, setRun] = useState(null);
  const [refreshError, setRefreshError] = useState(null);

  async function loadData() {
    const requestedId = id;
    const data = await fetchCompany(requestedId);
    if (idRef.current !== requestedId) return null;
    setBorrower(data.borrower);
    setSignals(data.signals);
    return data;
  }

  // Follow a refresh run (started here or by the "Screen new applicant" dialog).
  function attach(activeRun) {
    setRun(activeRun);
    setRefreshError(null);
    activeRun.promise.then(async (result) => {
      if (idRef.current !== activeRun.borrowerId) return;
      if (!result.ok) setRefreshError(result.error);
      try {
        await loadData();
      } catch {
        // keep what is on screen; the next refresh will reload
      }
      if (idRef.current === activeRun.borrowerId) setRun(null);
    });
  }

  function handleRefresh(current = { borrower, signals }) {
    const activeRun = startRefresh(id, {
      unavailableBefore: current.borrower?.sources_unavailable || [],
      signalIdsBefore: (current.signals || []).map((s) => s.id),
    });
    attach(activeRun);
  }

  useEffect(() => {
    idRef.current = id;
    setLoading(true);
    setNotFound(false);
    setBorrower(null);
    setSignals([]);
    setRun(null);
    setRefreshError(null);
    (async () => {
      let data = null;
      try {
        data = await loadData();
      } catch {
        if (idRef.current === id) setNotFound(true);
      } finally {
        if (idRef.current === id) setLoading(false);
      }
      if (!data) return;
      document.title = `${data.borrower.name} | Early Warning`;
      const active = getActiveRefresh(id);
      if (active) attach(active);
      else if (searchParams.get("checking") === "1" && !data.borrower.last_refreshed) handleRefresh(data);
      if (searchParams.has("checking")) setSearchParams({}, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // refreshBorrower saves after each source, so poll while it runs and the
  // source row and timeline fill in as sources answer.
  useEffect(() => {
    if (!run) return undefined;
    const timer = setInterval(() => {
      loadData().catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, id]);

  if (loading) return <DetailShell><DetailSkeleton /></DetailShell>;

  if (notFound || !borrower) {
    return (
      <DetailShell>
        <div className="border border-ew-rule bg-ew-surface px-6 py-10">
          <p className="font-heading text-lg font-semibold text-ew-ink">Company not found</p>
          <p className="mt-1 text-sm text-ew-muted">It may have been removed from the loan book.</p>
          <Link to="/" className="mt-3 inline-block rounded-sm text-sm font-medium text-ew-ink underline underline-offset-2">
            Back to loan book
          </Link>
        </div>
      </DetailShell>
    );
  }

  const running = !!run;
  const sourceStates = deriveSourceStates(borrower, signals, run);
  const recentSignals = filterRecentSignals(signals);
  const olderCount = signals.length - recentSignals.length;
  const newIds = run ? new Set(signals.map((s) => s.id).filter((sid) => !run.snapshot.signalIdsBefore.includes(sid))) : null;
  const showDecision = borrower.stage === "applicant" && isAtRisk(borrower);

  return (
    <DetailShell>
      <div className="border border-ew-rule bg-ew-surface">
        <CompanyHeader
          borrower={borrower}
          sourceStates={sourceStates}
          running={running}
          refreshError={refreshError}
          onRefresh={() => handleRefresh()}
        />
        <SourceStatusRow states={sourceStates} recentSignals={recentSignals} running={running} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="evidence-heading" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 id="evidence-heading" className="font-heading text-xl font-bold tracking-tight text-ew-ink">
              Evidence
            </h2>
            <p className="font-mono text-xs text-ew-muted">
              {recentSignals.length} in last 90 days{olderCount > 0 ? `, ${olderCount} older` : ""}
            </p>
          </div>
          <SignalTimeline
            signals={signals}
            neverRefreshed={!borrower.last_refreshed}
            checking={running}
            newIds={newIds}
          />
        </section>

        <aside aria-label="Analysis and decision" className="flex min-w-0 flex-col gap-4">
          {showDecision && <DecisionBar key={borrower.id} companyName={borrower.name} />}
          {/* ANALYST_BRIEF_SLOT */}
          <CompanyLinks borrower={borrower} />
        </aside>
      </div>
    </DetailShell>
  );
}

function DetailShell({ children }) {
  return (
    <div className="min-h-screen bg-ew-paper text-ew-ink">
      <AppHeader />
      <main className="mx-auto max-w-[1360px] px-6 pb-16 pt-4">
        <nav aria-label="Breadcrumb" className="mb-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-sm text-sm text-ew-muted hover:text-ew-ink"
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Loan book
          </Link>
        </nav>
        {children}
      </main>
    </div>
  );
}

function CompanyLinks({ borrower }) {
  const links = [
    { label: "Website", href: borrower.website_domain ? `https://${borrower.website_domain}` : null },
    { label: "LinkedIn", href: borrower.linkedin_url },
    { label: "Glassdoor", href: borrower.glassdoor_url },
  ].filter((l) => l.href && /^https?:\/\//.test(l.href));
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="links-heading" className="border border-ew-rule bg-ew-surface px-4 py-3">
      <h2 id="links-heading" className="text-xs font-semibold text-ew-muted">
        Company profiles
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${l.label} (opens in a new tab)`}
              className="inline-flex items-center gap-1.5 rounded-sm border border-ew-rule px-2 py-1 text-xs font-medium text-ew-ink hover:border-ew-ink-soft hover:bg-ew-hover"
            >
              {l.label}
              <ExternalLink aria-hidden="true" className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="border border-ew-rule bg-ew-surface p-5" aria-busy="true" aria-label="Loading company">
      <div className="h-7 w-1/3 animate-pulse rounded-sm bg-ew-rule-soft" />
      <div className="mt-4 h-4 w-2/3 animate-pulse rounded-sm bg-ew-rule-soft" />
      <div className="mt-6 grid grid-cols-6 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded-sm bg-ew-rule-soft" />
        ))}
      </div>
    </div>
  );
}
