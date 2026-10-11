import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AppHeader from "@/components/AppHeader";
import CompanyReport from "@/components/CompanyReport";
import EditCompanyDialog from "@/components/EditCompanyDialog";
import DeleteCompanyDialog from "@/components/DeleteCompanyDialog";
import { useAuth } from "@/lib/AuthContext";
import { canSeeCompany, normalizeEmail } from "@/lib/ownership";
import {
  POLL_INTERVAL_MS,
  deriveSourceStates,
  getActiveRefresh,
  startRefresh,
} from "@/lib/borrowerUtils";
import { AUTO_RESUME_DELAY_MS, AUTO_RESUME_MAX, pendingSources, shouldAutoResume } from "@/lib/sourceCoverage";

async function fetchCompany(id) {
  const [borrower, sigRes, runRes] = await Promise.all([
    base44.entities.Borrower.get(id),
    base44.entities.Signal.filter({ borrower_id: id }, "-date", 200),
    // Latest news check, for "How News and Legal were checked". Optional: never blocks the page.
    base44.entities.CheckRun.filter({ borrower_id: id }, "-started_at", 1).catch(() => []),
  ]);
  return { borrower, signals: sigRes || [], checkRun: runRes?.[0] || null };
}

// Thrown by loadData when the company belongs to someone else (or, signed in,
// to the shared demo book): the page shows "no access" and keeps no data.
const NO_ACCESS = "no_access";

export default function CompanyDetail() {
  const { id } = useParams();
  const { email, isAuthenticated, isLoadingAuth } = useAuth();
  const me = isAuthenticated ? normalizeEmail(email) : "";
  const meRef = useRef(me);
  meRef.current = me;
  const [searchParams, setSearchParams] = useSearchParams();
  const idRef = useRef(id);
  const [borrower, setBorrower] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const [run, setRun] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [checkRun, setCheckRun] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  // Automatic re-checks while Bright Data is still collecting (see attach).
  // autoRef holds the live counters; autoResume is what the page shows:
  // { at, sources } while one is scheduled, { exhausted, sources } after the cap.
  const autoRef = useRef({ attempts: 0, stopped: false, timer: null });
  const [autoResume, setAutoResume] = useState(null);
  const navigate = useNavigate();

  async function loadData() {
    const requestedId = id;
    const data = await fetchCompany(requestedId);
    if (idRef.current !== requestedId) return null;
    if (!canSeeCompany(data.borrower, meRef.current)) throw new Error(NO_ACCESS);
    setBorrower(data.borrower);
    setSignals(data.signals);
    setCheckRun(data.checkRun);
    return data;
  }

  function clearAutoTimer() {
    if (autoRef.current.timer) clearTimeout(autoRef.current.timer);
    autoRef.current.timer = null;
  }

  // After a run: if a source is still collecting, check again in 30 s (refreshBorrower
  // resumes the saved snapshot), up to AUTO_RESUME_MAX times per page visit.
  function scheduleAutoResume(result, data, borrowerId) {
    clearAutoTimer();
    const state = autoRef.current;
    const latest = data?.borrower;
    if (!shouldAutoResume({ borrower: latest, attempts: state.attempts, lastResult: result, stopped: state.stopped })) {
      const still = pendingSources(latest);
      const capped = result?.ok && !state.stopped && still.length > 0 && state.attempts >= AUTO_RESUME_MAX;
      setAutoResume(capped ? { exhausted: true, sources: still } : null);
      return;
    }
    setAutoResume({ at: Date.now() + AUTO_RESUME_DELAY_MS, sources: pendingSources(latest) });
    state.timer = setTimeout(() => {
      state.timer = null;
      setAutoResume(null);
      if (idRef.current !== borrowerId || state.stopped) return;
      const active = getActiveRefresh(borrowerId);
      if (active) {
        attach(active);
        return;
      }
      state.attempts += 1;
      handleRefresh(data, { automatic: true });
    }, AUTO_RESUME_DELAY_MS);
  }

  function stopAutoResume() {
    autoRef.current.stopped = true;
    clearAutoTimer();
    setAutoResume(null);
  }

  // Follow a refresh run (started here or by the "Screen new applicant" dialog).
  function attach(activeRun) {
    setRun(activeRun);
    setRefreshError(null);
    activeRun.promise.then(async (result) => {
      if (idRef.current !== activeRun.borrowerId) return;
      if (!result.ok) setRefreshError(result.error);
      let data = null;
      try {
        data = await loadData();
      } catch {
        // keep what is on screen; the next refresh will reload
      }
      if (idRef.current !== activeRun.borrowerId) return;
      setRun(null);
      scheduleAutoResume(result, data, activeRun.borrowerId);
    });
  }

  function handleRefresh(current = { borrower, signals }, { automatic = false } = {}) {
    if (!automatic) {
      // A manual Refresh replaces any scheduled re-check and turns them back on after Stop.
      clearAutoTimer();
      autoRef.current.stopped = false;
      setAutoResume(null);
    }
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
    setNoAccess(false);
    setBorrower(null);
    setSignals([]);
    setRun(null);
    setRefreshError(null);
    setNotice(null);
    clearAutoTimer();
    autoRef.current = { attempts: 0, stopped: false, timer: null };
    setAutoResume(null);
    if (isLoadingAuth) return;
    (async () => {
      let data = null;
      try {
        data = await loadData();
      } catch (error) {
        if (idRef.current === id) {
          if (error?.message === NO_ACCESS) setNoAccess(true);
          else setNotFound(true);
        }
      } finally {
        if (idRef.current === id) setLoading(false);
      }
      if (!data) return;
      document.title = `${data.borrower.name} | Kestrel`;
      const active = getActiveRefresh(id);
      if (active) attach(active);
      else if (searchParams.get("checking") === "1" && !data.borrower.last_refreshed) handleRefresh(data);
      if (searchParams.has("checking")) setSearchParams({}, { replace: true });
    })();
  }, [id, isLoadingAuth, me]);

  // Leaving the page cancels a scheduled re-check.
  useEffect(() => () => clearAutoTimer(), []);

  // refreshBorrower saves after each source, so poll while it runs and the
  // source row and timeline fill in as sources answer.
  useEffect(() => {
    if (!run) return undefined;
    const timer = setInterval(() => {
      loadData().catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [run, id]);

  if (loading) return <DetailShell><DetailSkeleton /></DetailShell>;

  if (noAccess) {
    return (
      <DetailShell>
        <div role="alert" className="border border-ew-rule bg-ew-surface px-6 py-10">
          <p className="font-heading text-lg font-semibold text-ew-ink">Company not found</p>
          <p className="mt-1 text-sm text-ew-muted">
            {me
              ? "This company is not in your loan book. You can only open companies you added."
              : "This company is not in the shared demo book. Sign in with the account that added it."}
          </p>
          <Link to="/" className="mt-3 inline-block rounded-sm text-sm font-medium text-ew-ink underline underline-offset-2">
            Back to loan book
          </Link>
        </div>
      </DetailShell>
    );
  }

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
  const newIds = run ? new Set(signals.map((s) => s.id).filter((sid) => !run.snapshot.signalIdsBefore.includes(sid))) : null;

  return (
    <DetailShell>
      <CompanyReport
        key={borrower.id}
        borrower={borrower}
        signals={signals}
        sourceStates={sourceStates}
        running={running}
        startedAt={run?.startedAt ?? null}
        refreshError={refreshError}
        onRefresh={() => handleRefresh()}
        // Signed-in owners only: the shared demo book is the same for every signed-out visitor (manageCompany).
        onEdit={me ? () => setEditOpen(true) : undefined}
        onDelete={me ? () => setDeleteOpen(true) : undefined}
        notice={notice}
        checkRun={checkRun}
        // A run saved before this refresh started belongs to the previous check.
        checkRunStale={!!run && !!checkRun && Date.parse(checkRun.started_at) < run.startedAt - 5000}
        newIds={newIds}
        autoResume={running ? null : autoResume}
        onStopAutoResume={stopAutoResume}
      />
      <EditCompanyDialog
        borrower={borrower}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(updated, evidenceCleared) => {
          if (updated) setBorrower(updated);
          if (evidenceCleared) setSignals([]);
          setNotice(evidenceCleared ? "Saved. The old evidence was cleared because the company's identity changed. Refresh to check it again." : "Saved.");
          loadData().catch(() => {});
        }}
      />
      <DeleteCompanyDialog
        borrower={borrower}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate("/", { replace: true })}
      />
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
