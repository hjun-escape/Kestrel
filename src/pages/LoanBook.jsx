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
import { useAuth } from "@/lib/AuthContext";
import { normalizeEmail, visibleCompanies } from "@/lib/ownership";

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
  const { email, isAuthenticated, isLoadingAuth, navigateToLogin } = useAuth();
  const me = isAuthenticated ? normalizeEmail(email) : "";
  const [borrowers, setBorrowers] = useState(null);
  const [signalsByBorrower, setSignalsByBorrower] = useState({});
  const [tab, setTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState(null);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [addOpen, setAddOpen] = useState(false);
  const [addStage, setAddStage] = useState("applicant");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Signed in: only the user's own companies. Signed out: only the unowned
  // shared demo book. The backend functions enforce the same rule.
  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const query = me ? { owner_email: me } : {};
      const [{ items }, sigRes] = await Promise.all([
        base44.entities.Borrower.filter(query, { limit: 500, sort: "-created_date" }),
        base44.entities.Signal.filter({}, { limit: 500, sort: "-date" }),
      ]);
      setBorrowers(visibleCompanies(items, me));
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
  }, []);

  useEffect(() => {
    if (isLoadingAuth) return;
    (async () => {
      try {
        await ensureSeedData();
      } catch {
        // seeding failed: still load whatever is in the database
      }
      await loadData();
    })();
  }, [isLoadingAuth, me]);

  function openAdd(stage) {
    setAddStage(stage);
    setAddOpen(true);
  }

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
      <AppHeader onAskClosed={loadData} />

      <main className="mx-auto max-w-[1360px] px-6 pb-16 pt-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-[28px] font-bold leading-none tracking-tight">
              {me ? "My companies" : "Loan book"}
            </h1>
            <p className="mt-2 text-sm text-ew-muted">
              {me
                ? "Public warning signs for the applicants and borrowers you added, worst first."
                : "Shared demo book: public warning signs for every applicant and borrower, worst first."}{" "}
              Status counts only the last 90 days.
            </p>
            {!me && !isLoadingAuth && (
              <p className="mt-1 text-xs text-ew-muted">
                <button
                  type="button"
                  onClick={navigateToLogin}
                  className="rounded-sm font-medium text-ew-ink-soft underline underline-offset-2 hover:text-ew-ink"
                >
                  Sign in to keep your own companies
                </button>
              </p>
            )}
          </div>
          <Button onClick={() => openAdd("applicant")} className="h-9 rounded-sm bg-ew-ink px-3.5 hover:bg-ew-ink-soft">
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
            <p className="font-heading text-lg font-semibold">
              {me ? "You have not added any companies yet" : "No companies in the loan book"}
            </p>
            <p className="mx-auto mt-1 max-w-[520px] text-sm text-ew-muted">
              {me
                ? "Screen a new applicant before you lend, or add a company you already lend to. Only you will see the companies you add."
                : "Screen an applicant to run the first check on news, court filings, hiring and reviews."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => openAdd("applicant")} className="h-9 rounded-sm bg-ew-ink hover:bg-ew-ink-soft">
                Screen a new applicant
              </Button>
              {me && (
                <Button variant="outline" onClick={() => openAdd("borrower")} className="h-9 rounded-sm">
                  Add a company
                </Button>
              )}
            </div>
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
        initialStage={addStage}
        onCreated={(created) => navigate(`/borrower/${created.id}?checking=1`)}
      />
    </div>
  );
}
