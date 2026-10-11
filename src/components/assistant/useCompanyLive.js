import { useCallback, useEffect, useRef, useState } from "react";
import { getRecord, listRecords } from "@/api/data";
import { POLL_INTERVAL_MS } from "@/lib/borrowerUtils";
import { useAuth } from "@/lib/AuthContext";
import { canSeeCompany, normalizeEmail } from "@/lib/ownership";
import { asList } from "./assistantData";

async function latest(entity, borrowerId) {
  try {
    const res = await listRecords(entity, { borrower_id: borrowerId }, "-created_at", 1);
    return asList(res)[0] || null;
  } catch {
    return null;
  }
}

// Per-user companies (src/lib/ownership.js): only companies the viewer may see.
async function findByDomain(domain, me) {
  const res = await listRecords("Borrower", { website_domain: domain }, "-created_date", 5);
  return asList(res).find((b) => canSeeCompany(b, me)) || null;
}

async function fetchCompany(id, domain, withExtras, me) {
  const found = id ? await getRecord("Borrower", id) : domain ? await findByDomain(domain, me) : null;
  const borrower = canSeeCompany(found, me) ? found : null;
  if (!borrower) return { borrower: null, signals: [] };
  const sigRes = await listRecords("Signal", { borrower_id: borrower.id }, "-date", 200);
  const out = { borrower, signals: asList(sigRes) };
  if (!withExtras) return out;
  const [analysis, lenderCheck, cashflow] = await Promise.all([
    latest("Analysis", borrower.id),
    latest("LenderCheck", borrower.id),
    latest("CashflowReview", borrower.id),
  ]);
  return { ...out, analysis, lenderCheck, cashflow };
}

// Loads one company (by id, or by website domain while a new applicant is
// being created) and polls every POLL_INTERVAL_MS while `poll` is true.
export function useCompanyLive(companyId, { domain = null, poll = false, extras = false } = {}) {
  const { email, isAuthenticated } = useAuth();
  const me = isAuthenticated ? normalizeEmail(email) : "";
  const [state, setState] = useState({ data: null, loading: Boolean(companyId || domain), error: null });
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!companyId && !domain) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const req = ++reqRef.current;
    try {
      const data = await fetchCompany(companyId, domain, extras, me);
      if (req === reqRef.current) setState({ data, loading: false, error: null });
    } catch {
      if (req === reqRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: "Could not load this company. It will retry shortly." }));
      }
    }
  }, [companyId, domain, extras, me]);

  useEffect(() => {
    setState({ data: null, loading: Boolean(companyId || domain), error: null });
    load();
  }, [companyId, domain, load]);

  useEffect(() => {
    if (!poll) return undefined;
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll, load]);

  // One last read when polling stops, so the final status shows.
  const wasPolling = useRef(poll);
  useEffect(() => {
    if (wasPolling.current && !poll) load();
    wasPolling.current = poll;
  }, [poll, load]);

  return { ...state, reload: load };
}
