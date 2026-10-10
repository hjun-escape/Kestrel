import React from "react";
import { Link } from "react-router-dom";

// Thin top bar shared by the loan book and the detail page.
export default function AppHeader({ children }) {
  return (
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
        <div className="flex items-center gap-3">{children}</div>
      </div>
    </header>
  );
}
