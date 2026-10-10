import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { RefreshCw, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import SourceChip from "@/components/SourceChip";
import SignalTimeline from "@/components/SignalTimeline";
import { SOURCES } from "@/lib/signalTypes";
import { filterRecentSignals, formatRelative } from "@/lib/borrowerUtils";

export default function CompanyDetail() {
  const { id } = useParams();
  const [borrower, setBorrower] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  async function loadData() {
    try {
      const b = await base44.entities.Borrower.get(id);
      setBorrower(b);
      const { items } = await base44.entities.Signal.filter(
        { borrower_id: id },
        { limit: 200, sort: "-date" }
      );
      setSignals(items);
    } catch (e) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    setBorrower(null);
    setSignals([]);
    loadData();
  }, [id]);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await base44.functions.invoke("refreshBorrower", { borrower_id: id });
      await loadData();
    } catch (e) {
      setRefreshError("Refresh failed. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (notFound || !borrower) {
    return (
      <div className="min-h-screen bg-white">
        <header className="border-b border-gray-200">
          <div className="mx-auto max-w-6xl px-6 py-3">
            <Link to="/" className="text-sm font-semibold tracking-tight text-gray-900">
              Early Warning
            </Link>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-sm text-gray-500">Company not found.</p>
          <Link to="/" className="mt-2 inline-block text-sm text-gray-700 underline">
            Back to loan book
          </Link>
        </div>
      </div>
    );
  }

  const recentSignals = filterRecentSignals(signals);
  const meta = [
    borrower.hq_city && borrower.hq_state
      ? `${borrower.hq_city}, ${borrower.hq_state}`
      : borrower.hq_city || borrower.hq_state || "",
    borrower.industry,
    borrower.website_domain,
  ].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-sm font-semibold tracking-tight text-gray-900">
            Early Warning
          </Link>
          <Link to="/" className="text-xs text-gray-500 hover:text-gray-800">
            ← Loan book
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{borrower.name}</h1>
              <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
                {borrower.stage}
              </span>
              <StatusBadge
                status={borrower.status}
                lastRefreshed={borrower.last_refreshed}
              />
            </div>
            {borrower.why && (
              <p className="mt-2 max-w-2xl text-sm text-gray-600">{borrower.why}</p>
            )}
            {meta && <p className="mt-1.5 text-xs text-gray-500">{meta}</p>}
            <p className="mt-1.5 text-xs text-gray-500">
              Last refreshed:{" "}
              {borrower.last_refreshed ? (
                <span title={formatRelative(borrower.last_refreshed)}>
                  {formatDistanceToNow(new Date(borrower.last_refreshed), {
                    addSuffix: true,
                  })}
                </span>
              ) : (
                "Not checked yet"
              )}
            </p>
            {(borrower.linkedin_url || borrower.glassdoor_url) && (
              <div className="mt-2 flex gap-4">
                {borrower.linkedin_url && (
                  <a
                    href={borrower.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    LinkedIn <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {borrower.glassdoor_url && (
                  <a
                    href={borrower.glassdoor_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    Glassdoor <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Button onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw
                className={`mr-1.5 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {refreshError && (
              <p className="text-xs text-red-600">{refreshError}</p>
            )}
          </div>
        </div>

        {/* Sources checked */}
        <div className="mt-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">
            Sources checked
          </h2>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((src) => (
              <SourceChip
                key={src}
                source={src}
                lastRefreshed={borrower.last_refreshed}
                sourcesUnavailable={borrower.sources_unavailable}
              />
            ))}
          </div>
        </div>

        {/* Signal timeline */}
        <div className="mt-8">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">
            Signals
          </h2>
          <SignalTimeline
            signals={recentSignals}
            neverRefreshed={!borrower.last_refreshed}
          />
        </div>
      </main>
    </div>
  );
}