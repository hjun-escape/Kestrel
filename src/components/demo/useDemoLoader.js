import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { startRefresh } from "@/lib/borrowerUtils";
import { DEMO_COMPANIES } from "@/lib/demoCompanies";
import { CHECK_CONCURRENCY, companiesToCheck, runPool, summarizeChecks } from "@/lib/demoLoad";

const DEMO_DOMAINS = new Set(DEMO_COMPANIES.map((c) => c.website_domain));

function errorText(e, fallback) {
  return e?.response?.data?.error || e?.data?.error || e?.message || fallback;
}

function statusOf(e) {
  return e?.response?.status ?? e?.status;
}

// The demo companies as they now stand in this book (shared when signed out, the user's own when signed in).
async function demoRowsInBook(me) {
  const res = await base44.entities.Borrower.filter(me ? { owner_email: me } : {}, { limit: 500, sort: "-created_date" });
  const items = Array.isArray(res) ? res : res?.items || [];
  return items.filter(
    (b) => DEMO_DOMAINS.has(String(b.website_domain || "").trim().toLowerCase()) && (me ? true : !b.owner_email)
  );
}

/**
 * Runs "Load demo companies": loadDemo puts the companies in the book, then every one never checked is
 * checked with refreshBorrower, CHECK_CONCURRENCY at a time. onChanged reloads the table as results land.
 * phase: idle | loading | checking | done | cancelled | error. items: [{ id, name, state, status }],
 * state: queued | checking | done | unavailable | not_started.
 */
export function useDemoLoader({ me, onChanged }) {
  const [phase, setPhase] = useState("idle");
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState("");
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
    };
  }, []);

  const patchItem = useCallback((id, patch) => {
    if (!mounted.current) return;
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const checkOne = useCallback(
    async (row) => {
      patchItem(row.id, { state: "checking" });
      const res = await startRefresh(row.id, { unavailableBefore: row.sources_unavailable || [], signalIdsBefore: [] }).promise;
      const saved = res.ok ? res.data?.borrower : null;
      const result = saved?.last_refreshed
        ? { state: "done", status: saved.status }
        : { state: "unavailable", detail: res.ok ? "No source answered." : res.error };
      patchItem(row.id, result);
      onChangedRef.current?.();
      return result;
    },
    [patchItem]
  );

  const fail = useCallback((message) => {
    if (!mounted.current) return;
    setError(message);
    setPhase("error");
  }, []);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    cancelled.current = false;
    setError(null);
    setSummary("");
    setItems([]);
    setPhase("loading");
    try {
      try {
        await base44.functions.invoke("loadDemo", me ? {} : { purge_placeholders: true });
      } catch (e) {
        // 429: loaded a moment ago (another click or another visitor). The companies are there; go on and check them.
        if (statusOf(e) !== 429) return fail(errorText(e, "Could not load the demo companies. Try again."));
      }
      let rows;
      try {
        rows = await demoRowsInBook(me);
      } catch (e) {
        return fail(errorText(e, "Could not read the loan book. Reload the page."));
      }
      onChangedRef.current?.();
      const toCheck = companiesToCheck(rows);
      if (!mounted.current) return;
      setItems(toCheck.map((b) => ({ id: b.id, name: b.name, state: "queued" })));
      setPhase("checking");

      const results = [];
      await runPool(toCheck, CHECK_CONCURRENCY, async (row) => results.push(await checkOne(row)), () => cancelled.current);
      if (!mounted.current) return;
      setItems((list) => list.map((it) => (it.state === "queued" ? { ...it, state: "not_started" } : it)));
      setSummary(summarizeChecks(results));
      setPhase(cancelled.current ? "cancelled" : "done");
    } finally {
      busy.current = false;
    }
  }, [me, checkOne, fail]);

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  const dismiss = useCallback(() => {
    setPhase("idle");
    setItems([]);
    setSummary("");
    setError(null);
  }, []);

  return { phase, items, error, summary, start, cancel, dismiss, running: phase === "loading" || phase === "checking" };
}
