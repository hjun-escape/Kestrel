import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { POLL_INTERVAL_MS } from "@/lib/borrowerUtils";
import { asList } from "./assistantData";

async function latest(entity, borrowerId) {
  try {
    const res = await base44.entities[entity].filter({ borrower_id: borrowerId }, { limit: 1, sort: "-created_at" });
    return asList(res)[0] || null;
  } catch {
    return null;
  }
}

async function findByDomain(domain) {
  const res = await base44.entities.Borrower.filter({ website_domain: domain }, { limit: 1, sort: "-created_date" });
  return asList(res)[0] || null;
}

async function fetchCompany(id, domain, withExtras) {
  const borrower = id ? await base44.entities.Borrower.get(id) : domain ? await findByDomain(domain) : null;
  if (!borrower) return { borrower: null, signals: [] };
  const sigRes = await base44.entities.Signal.filter({ borrower_id: borrower.id }, { limit: 200, sort: "-date" });
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
  const [state, setState] = useState({ data: null, loading: Boolean(companyId || domain), error: null });
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    if (!companyId && !domain) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const req = ++reqRef.current;
    try {
      const data = await fetchCompany(companyId, domain, extras);
      if (req === reqRef.current) setState({ data, loading: false, error: null });
    } catch {
      if (req === reqRef.current) {
        setState((prev) => ({ ...prev, loading: false, error: "Could not load this company. It will retry shortly." }));
      }
    }
  }, [companyId, domain, extras]);

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
