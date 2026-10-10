import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import AddCompanyDialog from "@/components/AddCompanyDialog";
import SummaryStrip from "@/components/SummaryStrip";
import LoanBookTable from "@/components/LoanBookTable";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { getTopSignal, filterRecentSignals, sortRows, statusKey } from "@/lib/borrowerUtils";
import { ensureSeedData } from "@/lib/seed";

const TABS = [
  { value: "all", label: "All" },
  { value: "applicants", label: "Applicants", stage: "applicant" },
  { value: "borrowers", label: "Borrowers", stage: "borrower" },
];

const DEFAULT_SORT = { key: "status", dir: "asc" };

function groupSignals(items) {
  const map = {};
  items.forEach((s) => {
    map[s.borrower_id] = [...(map[s.borrower_id] || []), s];
  });
  return map;
}

export default function LoanBook() {
  const navigate = useNavigate();
  const [borrowers, setBorrowers] = useState(null);
  const [signalsByBorrower, setSignalsByBorrower] = useState({});
  const [tab, setTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState(null);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const [{ items }, sigRes] = await Promise.all([
        base44.entities.Borrower.filter({}, { limit: 500, sort: "-created_date" }),
        base44.entities.Signal.filter({}, { limit: 500, sort: "-date" }),
      ]);
      setBorrowers(items);
      setSignalsByBorrower(groupSignals(sigRes.items));
    } catch {
      setBorrowers([]);
      setLoadError("Could not load the loan book. Check your connection and reload.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "Loan book | Early Warning";
    (async () => {
      try {
        await ensureSeedData();
      } catch {
        // seeding failed: still load whatever is in the database
      }
      await loadData();
    })();
  }, []);

  const tabCounts = useMemo(() => {
    const list = borrowers || [];
    return {
      all: list.length,
      applicants: list.filter((b) => b.stage === "applicant").length,
      borrowers: list.filter((b) => b.stage === "borrower").length,
    };
  }, [borrowers]);

  // Borrowers in the current tab: drives the summary strip.
  const inTab = useMemo(() => {
    const stage = TABS.find((t) => t.value === tab)?.stage;
    return (borrowers || []).filter((b) => !stage || b.stage === stage);
  }, [borrowers, tab]);

  const rows = useMemo(() => {
    const visible = statusFilter ? inTab.filter((b) => statusKey(b) === statusFilter) : inTab;
    const withSignals = visible.map((b) => ({
      borrower: b,
      topSignal: getTopSignal(filterRecentSignals(signalsByBorrower[b.id] || [])),
    }));
    return sortRows(withSignals, sort.key, sort.dir);
  }, [inTab, statusFilter, signalsByBorrower, sort]);

  function handleSort(key) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "amount" || key === "signal" || key === "checked" ? "desc" : "asc" }
    );
  }

  const isBookEmpty = !loading && !loadError && (borrowers || []).length === 0;
  const isFilterEmpty = !loading && !isBookEmpty && rows.length === 0;

  return (
    <div className="min-h-screen bg-ew-paper text-ew-ink">
      <AppHeader />

      <main className="mx-auto max-w-[1360px] px-6 pb-16 pt-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-[28px] font-bold leading-none tracking-tight">Loan book</h1>
            <p className="mt-2 text-sm text-ew-muted">
              Public warning signs for every applicant and borrower, worst first. Status counts only the last 90 days.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="h-9 rounded-sm bg-ew-ink px-3.5 hover:bg-ew-ink-soft">
            <Plus aria-hidden="true" />
            Screen new applicant
          </Button>
        </div>

        <SummaryStrip
          borrowers={inTab}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
        />

        <div className="mb-2 mt-6 flex items-center justify-between gap-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto rounded-none bg-transparent p-0">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-sm text-ew-muted hover:text-ew-ink data-[state=active]:border-ew-ink data-[state=active]:bg-transparent data-[state=active]:text-ew-ink data-[state=active]:shadow-none"
                >
                  {t.label}
                  <span className="ml-1.5 font-mono text-xs">{loading ? "" : tabCounts[t.value]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className="rounded-sm text-xs font-medium text-ew-ink-soft underline underline-offset-2 hover:text-ew-ink"
            >
              Showing {STATUS_STYLES[statusFilter].label.toLowerCase()} only. Clear filter
            </button>
          )}
        </div>

        {loadError && (
          <div role="alert" className="border border-ew-red-rule bg-ew-red-bg px-4 py-3 text-sm text-ew-red">
            {loadError}
          </div>
        )}

        {isBookEmpty && (
          <div className="border border-dashed border-ew-rule bg-ew-surface px-6 py-14 text-center">
            <p className="font-heading text-lg font-semibold">No companies in the loan book</p>
            <p className="mt-1 text-sm text-ew-muted">Screen an applicant to run the first check on news, court filings, hiring and reviews.</p>
            <Button onClick={() => setAddOpen(true)} className="mt-4 h-9 rounded-sm bg-ew-ink hover:bg-ew-ink-soft">
              Screen new applicant
            </Button>
          </div>
        )}

        {isFilterEmpty && (
          <div className="border border-ew-rule bg-ew-surface px-6 py-10 text-center text-sm text-ew-muted">
            No companies match this view.
            {statusFilter && (
              <button type="button" onClick={() => setStatusFilter(null)} className="ml-1 rounded-sm font-medium text-ew-ink underline underline-offset-2">
                Clear the status filter
              </button>
            )}
          </div>
        )}

        {(loading || rows.length > 0) && (
          <LoanBookTable rows={rows} sort={sort} onSort={handleSort} loading={loading} />
        )}
      </main>

      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(created) => navigate(`/borrower/${created.id}?checking=1`)}
      />
    </div>
  );
}
