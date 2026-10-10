import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import AskPanel from "@/components/AskPanel";
import UserMenu from "@/components/auth/UserMenu";

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || "");
const SHORTCUT_LABEL = isMac ? "⌘K" : "Ctrl K";

// Thin top bar shared by the loan book and the detail page. Owns the Ask
// Early Warning panel (button or Cmd/Ctrl+K) and the signed-in user menu.
// `onAskClosed` runs when the panel closes so pages can reload their data
// (companies added through chat then appear).
export default function AppHeader({ children, onAskClosed }) {
  const [askOpen, setAskOpen] = useState(false);

  const handleAskOpenChange = useCallback(
    (next) => {
      setAskOpen(next);
      if (!next) onAskClosed?.();
    },
    [onAskClosed]
  );

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
    <header className="border-b border-ew-ink bg-ew-ink text-white">
      <div className="mx-auto flex h-11 max-w-[1360px] items-center justify-between gap-4 px-6">
        <Link
          to="/"
          className="flex items-baseline gap-3 rounded-sm focus-visible:outline-white"
        >
          <span className="font-heading text-[15px] font-bold tracking-tight">
            Early Warning
          </span>
          <span className="hidden text-xs text-white/70 sm:inline">
            Credit risk monitor
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {children}
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            aria-label="Ask Early Warning (keyboard shortcut Command K or Control K)"
            aria-keyshortcuts="Meta+K Control+K"
            className="inline-flex h-7 items-center gap-2 rounded-sm border border-white/30 px-2.5 text-sm text-white hover:bg-white/10 focus-visible:outline-white"
          >
            <MessageSquareText aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Ask</span>
            <kbd aria-hidden="true" className="hidden rounded-sm border border-white/30 px-1 font-mono text-[10px] text-white/70 sm:inline">
              {SHORTCUT_LABEL}
            </kbd>
          </button>
          <UserMenu tone="dark" />
        </div>
      </div>
    </header>
    <AskPanel open={askOpen} onOpenChange={handleAskOpenChange} />
    </>
  );
}
