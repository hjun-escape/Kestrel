import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { sortBorrowers } from "@/lib/borrowerUtils";
import { useAuth } from "@/lib/AuthContext";
import { normalizeEmail, visibleCompanies } from "@/lib/ownership";
import { asList } from "./assistantData";

// Page-level state shared by the three Assistant columns: the portfolio list,
// the pinned company (kept in the URL as ?company=) and the company the last
// answer was about (shown in the context panel when nothing is pinned).

const AssistantPageContext = createContext(null);

export function AssistantPageProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pinnedId = searchParams.get("company") || null;
  const [companies, setCompanies] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [mentionedId, setMentionedId] = useState(null);
  const { email, isAuthenticated, isLoadingAuth } = useAuth();
  const me = isAuthenticated ? normalizeEmail(email) : "";

  // Signed in: only the user's own companies; signed out: the shared demo book.
  const reloadCompanies = useCallback(async () => {
    if (isLoadingAuth) return;
    try {
      const query = me ? { owner_email: me } : {};
      const res = await base44.entities.Borrower.filter(query, { limit: 500, sort: "-created_date" });
      setCompanies(sortBorrowers(visibleCompanies(asList(res), me)));
      setLoadError(null);
    } catch {
      setCompanies((prev) => prev || []);
      setLoadError("Could not load the portfolio. Reload the page to try again.");
    }
  }, [isLoadingAuth, me]);

  useEffect(() => {
    reloadCompanies();
  }, [reloadCompanies]);

  const setPinned = useCallback(
    (id) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("company", id);
          else next.delete("company");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const byId = useMemo(() => {
    const map = {};
    (companies || []).forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [companies]);

  // The adapter reads these through a ref so the runtime never re-creates.
  const live = useRef({});
  live.current = { pinnedId, companies: companies || [] };

  const value = useMemo(
    () => ({
      companies,
      byId,
      loadError,
      reloadCompanies,
      pinnedId,
      setPinned,
      mentionedId,
      setMentionedId,
      focusId: pinnedId || mentionedId,
      live,
    }),
    [companies, byId, loadError, reloadCompanies, pinnedId, setPinned, mentionedId]
  );

  return <AssistantPageContext.Provider value={value}>{children}</AssistantPageContext.Provider>;
}

export function useAssistantPage() {
  const ctx = useContext(AssistantPageContext);
  if (!ctx) throw new Error("useAssistantPage must be used inside AssistantPageProvider");
  return ctx;
}
