import React, { useEffect } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import UserMenu from "@/components/auth/UserMenu";

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || "");
const SHORTCUT_LABEL = isMac ? "⌘K" : "Ctrl K";

const navClass = ({ isActive }) =>
  `inline-flex h-11 items-center border-b-2 px-1 text-sm focus-visible:outline-white ${
    isActive ? "border-white font-semibold text-white" : "border-transparent text-white/75 hover:text-white"
  }`;

// Thin top bar shared by every signed-in page: app name, Loan book and
// Assistant nav, and the user menu. Cmd/Ctrl+K opens the Assistant (on the
// Assistant page itself, the page focuses its composer instead).
export default function AppHeader({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const onAssistant = location.pathname === "/assistant";

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        if (onAssistant) return;
        e.preventDefault();
        navigate("/assistant");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, onAssistant]);

  return (
    <header className="shrink-0 border-b border-ew-ink bg-ew-ink text-white">
      <div className="mx-auto flex h-11 max-w-[1360px] items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-baseline gap-3 rounded-sm focus-visible:outline-white">
            <span className="font-heading text-[15px] font-bold tracking-tight">Early Warning</span>
            <span className="hidden text-xs text-white/70 md:inline">Credit risk monitor</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-4">
            <NavLink to="/" end className={navClass}>
              Loan book
            </NavLink>
            <NavLink
              to="/assistant"
              className={navClass}
              aria-keyshortcuts="Meta+K Control+K"
              title={`Assistant (${SHORTCUT_LABEL})`}
            >
              <MessageSquareText aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
              Assistant
              <kbd aria-hidden="true" className="ml-2 hidden rounded-sm border border-white/30 px-1 font-mono text-[10px] font-normal text-white/70 sm:inline">
                {SHORTCUT_LABEL}
              </kbd>
            </NavLink>
            <Link
              to="/welcome"
              className="hidden h-11 items-center border-b-2 border-transparent px-1 text-sm text-white/75 hover:text-white focus-visible:outline-white sm:inline-flex"
            >
              About
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {children}
          <UserMenu tone="dark" />
        </div>
      </div>
    </header>
  );
}
