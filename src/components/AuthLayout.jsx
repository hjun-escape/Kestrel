import React from "react";
import BrandMark from "@/components/auth/BrandMark";
import SignalRuler from "@/components/auth/SignalRuler";

export const PRODUCT_NAME = "Early Warning";
export const TAGLINE =
  "Public warning signs on the companies you lend to, before the financials show them.";

const VALUE_POINTS = [
  {
    title: "One dated record per borrower",
    body: "Filings, registry changes, hiring and news sit on a single timeline.",
  },
  {
    title: "Every signal cites its source",
    body: "Open the original document behind any flag before you act on it.",
  },
  {
    title: "Ranked for your loan book",
    body: "Reviews start with the borrowers whose public footprint changed.",
  },
];

// Split-panel shell for all signed-out screens. The right panel is the only
// place the page's <h1> lives; the left panel is supporting context.
// `icon` is accepted for backward compatibility and ignored.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900 focus:ring-2 focus:ring-slate-900"
      >
        Skip to sign-in form
      </a>

      <aside className="flex flex-col bg-[#0E1A2B] px-6 py-5 text-slate-100 sm:px-10 lg:min-h-screen lg:px-14 lg:py-12">
        <div className="flex items-center gap-3">
          <BrandMark className="h-7 w-7 text-slate-100" />
          <span className="text-lg font-semibold tracking-tight">{PRODUCT_NAME}</span>
        </div>

        <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center">
          <p className="max-w-md text-[1.7rem] font-semibold leading-snug tracking-tight text-white">
            {TAGLINE}
          </p>

          <ul className="mt-12 max-w-md divide-y divide-slate-700 border-y border-slate-700">
            {VALUE_POINTS.map((p) => (
              <li key={p.title} className="py-4">
                <p className="text-sm font-semibold text-white">{p.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{p.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-12">
            <SignalRuler />
          </div>
        </div>

        <p className="hidden text-xs text-slate-400 lg:block">
          For authorized credit and risk staff only.
        </p>
      </aside>

      <main id="auth-main" className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-700">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-700">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
