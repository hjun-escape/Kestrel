import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StatusBadge from "@/components/StatusBadge";
import AddCompanyDialog from "@/components/AddCompanyDialog";
import { sortBorrowers, getTopSignal, filterRecentSignals, formatUsd, formatRelative } from "@/lib/borrowerUtils";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import { ensureSeedData } from "@/lib/seed";

export default function LoanBook() {
  const navigate = useNavigate();
  const [borrowers, setBorrowers] = useState(null);
  const [signalsByBorrower, setSignalsByBorrower] = useState({});
  const [tab, setTab] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const { items } = await base44.entities.Borrower.filter({}, { limit: 500, sort: "-created_date" });
      const sigRes = await base44.entities.Signal.filter({}, { limit: 500, sort: "-date" });
      const map = {};
      sigRes.items.forEach((s) => {
        if (!map[s.borrower_id]) map[s.borrower_id] = [];
        map[s.borrower_id].push(s);
      });
      setBorrowers(items);
      setSignalsByBorrower(map);
    } catch (e) {
      setBorrowers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await ensureSeedData();
      } catch (e) {
        // seeding failed — still attempt to load whatever is in the DB
      }
      await loadData();
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!borrowers) return [];
    let list = borrowers;
    if (tab === "applicants") list = list.filter((b) => b.stage === "applicant");
    else if (tab === "borrowers") list = list.filter((b) => b.stage === "borrower");
    return sortBorrowers(list);
  }, [borrowers, tab]);

  const isEmpty = !loading && borrowers && borrowers.length === 0;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            Early Warning
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Loan book</h1>
          <Button onClick={() => setAddOpen(true)}>Add company</Button>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mb-4">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="applicants">Applicants</TabsTrigger>
            <TabsTrigger value="borrowers">Borrowers</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading && (
          <p className="py-10 text-sm text-gray-500">Loading…</p>
        )}

        {isEmpty && (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">
              No companies yet. Add one to start monitoring.
            </p>
          </div>
        )}

        {!loading && !isEmpty && (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium">Stage</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Why</th>
                  <th className="px-3 py-2.5 font-medium">Top signal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Loan / requested</th>
                  <th className="px-3 py-2.5 font-medium">Last refreshed</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const topSignal = getTopSignal(
                    filterRecentSignals(signalsByBorrower[b.id] || [])
                  );
                  return (
                    <tr
                      key={b.id}
                      onClick={() => navigate(`/borrower/${b.id}`)}
                      className="cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">{b.name}</div>
                        <div className="text-xs text-gray-500">{b.website_domain}</div>
                      </td>
                      <td className="px-3 py-3 capitalize text-gray-600">{b.stage}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={b.status} lastRefreshed={b.last_refreshed} />
                      </td>
                      <td className="max-w-xs px-3 py-3 text-gray-600">
                        {b.why || "—"}
                      </td>
                      <td className="px-3 py-3">
                        {topSignal ? (
                          <span className="text-gray-700">
                            {SIGNAL_TYPES[topSignal.type]?.label || topSignal.type}
                            <span className="text-gray-400"> · </span>
                            {format(new Date(topSignal.date), "MMM d")}
                          </span>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                        {formatUsd(b.loan_amount_usd)}
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {b.last_refreshed ? (
                          <span title={formatRelative(b.last_refreshed)}>
                            {formatDistanceToNow(new Date(b.last_refreshed), {
                              addSuffix: true,
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-400">Not checked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={loadData}
      />
    </div>
  );
}