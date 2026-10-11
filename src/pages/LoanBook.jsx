import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppHeader from "@/components/AppHeader";
import AddCompanyDialog from "@/components/AddCompanyDialog";
import SummaryStrip from "@/components/SummaryStrip";
import { StatusLegendPopover } from "@/components/StatusLegend";
import LoanBookTable from "@/components/LoanBookTable";
import LoanBookCards from "@/components/LoanBookCards";
import { useIsMobile } from "@/hooks/use-mobile";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { getTopSignal, filterRecentSignals, sortRows, statusKey } from "@/lib/borrowerUtils";
import { ensureSeedData } from "@/lib/seed";
import { useAuth } from "@/lib/AuthContext";
import { normalizeEmail, visibleCompanies } from "@/lib/ownership";
import LoadDemoButton from "@/components/demo/LoadDemoButton";
import DemoProgress from "@/components/demo/DemoProgress";
import DemoEmptyPanel from "@/components/demo/DemoEmptyPanel";
import { useDemoLoader } from "@/components/demo/useDemoLoader";
import { DEMO_LOAD_PARAM, demoLoadRequested, hasRealCompanies } from "@/lib/demoLoad";

const TABS = [
  { value: "all", label: "All" },
  { value: "applicants", label: "Applicants", stage: "applicant" },
  { value: "borrowers", label: "Borrowers", stage: "borrower" },
];

const DEFAULT_SORT = { key: "status", dir: "asc" };

// First direction when a sort key is picked: biggest / newest first for numbers and dates.
const defaultDir = (key) => (key === "amount" || key === "signal" || key === "checked" ? "desc" : "asc");

function groupSignals(items) {
  const map = {};
  items.forEach((s) => {
    map[s.borrower_id] = [...(map[s.borrower_id] || []), s];
  });
  return map;
}

export default function LoanBook() {
  const navigate = useNavigate();
  const location = useLocation();
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
  // Phones get cards instead of the table: one or the other is rendered, never both.
  const isMobile = useIsMobile();

  // Signed in: only the user's own companies. Signed out: only the unowned
  // shared demo book. The backend functions enforce the same rule.
  // quiet: reload behind the table (demo checks landing) without the loading skeleton.
  async function loadData({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
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

  const demo = useDemoLoader({ me, onChanged: () => loadData({ quiet: true }) });

  // "Explore the demo" on the landing page links to "/?demo-load=1": start the demo load once the book has
  // loaded, if the signed-out shared book has no real companies yet. The flag is then removed from the URL.
  const autoDemoHandled = useRef(false);
  useEffect(() => {
    if (autoDemoHandled.current || loading || isLoadingAuth || !demoLoadRequested(location.search)) return;
    autoDemoHandled.current = true;
    const params = new URLSearchParams(location.search);
    params.delete(DEMO_LOAD_PARAM);
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true });
    if (!me && !loadError && !hasRealCompanies(borrowers)) demo.start();
  }, [loading, isLoadingAuth, location.search, me, borrowers, loadError]);

  useEffect(() => {
    document.title = "Loan book | Kestrel";
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
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }
    );
  }

  // Phone sort picker: choosing a key always starts in its default direction.
  function handleSortSet(key) {
    setSort({ key, dir: defaultDir(key) });
  }

  const isBookEmpty = !loading && !loadError && (borrowers || []).length === 0;
  const isFilterEmpty = !loading && !isBookEmpty && rows.length === 0;

  return (
    <div className="min-h-screen bg-ew-paper text-ew-ink">
      <AppHeader onAskClosed={loadData} />

      <main className="mx-auto max-w-[1360px] px-4 pb-16 pt-6 md:px-6">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
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
            <div data-demo="status-legend" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="hidden text-xs text-ew-muted xl:block">
                <span className="font-semibold text-ew-red">Red</span> 2+ strong signs, or 1 strong + 2 weak ·{" "}
                <span className="font-semibold text-ew-amber">Yellow</span> 1 strong, or 2+ weak ·{" "}
                <span className="font-semibold text-ew-green">Green</span> none that count · set by fixed rules, not AI
              </p>
              <StatusLegendPopover align="start" />
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            <LoadDemoButton signedIn={!!me} running={demo.running} onClick={demo.start} />
            <Button data-demo="screen-applicant" onClick={() => openAdd("applicant")} className="h-9 rounded-sm bg-ew-ink px-3.5 hover:bg-ew-ink-soft">
              <Plus aria-hidden="true" />
              Screen new applicant
            </Button>
          </div>
        </div>

        <DemoProgress
          phase={demo.phase}
          items={demo.items}
          error={demo.error}
          summary={demo.summary}
          onCancel={demo.cancel}
          onDismiss={demo.dismiss}
        />

        {!me && !loading && !loadError && !isBookEmpty && !hasRealCompanies(borrowers) && demo.phase === "idle" && (
          <DemoEmptyPanel running={demo.running} onLoad={demo.start} />
        )}

        <SummaryStrip
          borrowers={inTab}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
        />

        <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto rounded-none bg-transparent p-0">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  data-demo={`tab-${t.value}`}
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
                : "Load six real mid-size companies and watch the live checks on news, court filings, hiring and reviews run, or screen an applicant of your own. No account needed."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <LoadDemoButton signedIn={!!me} running={demo.running} onClick={demo.start} variant="default" className="bg-ew-ink hover:bg-ew-ink-soft" />
              <Button variant="outline" onClick={() => openAdd("applicant")} className="h-9 rounded-sm">
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

        {(loading || rows.length > 0) &&
          (isMobile ? (
            <LoanBookCards rows={rows} sort={sort} onSortSet={handleSortSet} loading={loading} />
          ) : (
            <LoanBookTable rows={rows} sort={sort} onSort={handleSort} loading={loading} />
          ))}
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
