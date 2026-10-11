import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Download, ExternalLink, Printer } from "lucide-react";
import { listRecords } from "@/api/data";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { auditFileName, auditTrailCsv, buildAuditTrail, collapseRepeatedChecks, formatTrailDate } from "@/lib/auditTrail.ts";
import { NOT_AI_TEXT } from "@/lib/statusRules.ts";

// Per-company audit trail (from user testing: "best in class... with an audit trail").
// Reads only records this viewer can already load; a record type that fails to load is
// named in the panel and left out, never guessed at.
const PRINT_ID = "kestrel-audit-print";
const PRINT_CLASS = "kestrel-printing-audit";
// Printing renders a copy of the trail straight under <body> and hides everything else,
// so the browser's "Save as PDF" gets only the audit trail, with full source links.
const PRINT_CSS = `#${PRINT_ID} { display: none; }
@media print {
  body.${PRINT_CLASS} > *:not(#${PRINT_ID}) { display: none !important; }
  body.${PRINT_CLASS} #${PRINT_ID} { display: block; padding: 0; background: #fff; }
  body.${PRINT_CLASS} #${PRINT_ID} tr { break-inside: avoid; }
}`;

const KIND_LABEL = {
  status: "Status",
  check_run: "Check",
  signal: "Evidence",
  analysis: "AI news summary",
  lender_check: "Other lenders",
  cashflow: "Cash flow",
  decision: "Decision",
};

const asList = (res) => (Array.isArray(res) ? res : res?.items || []);

const SOURCES = [
  { key: "checkRuns", label: "source checks", load: (q) => listRecords("CheckRun", q, "-started_at", 100) },
  { key: "analyses", label: "AI news summaries", load: (q) => listRecords("Analysis", q, "-created_at", 100) },
  { key: "lenderChecks", label: "lender checks", load: (q) => listRecords("LenderCheck", q, "-created_at", 100) },
  { key: "cashflowReviews", label: "cash-flow reviews", load: (q) => listRecords("CashflowReview", q, "-created_at", 100) },
  { key: "decisions", label: "decisions", load: (q) => listRecords("Decision", q, "-created_at", 200) },
];

function useAuditRecords(borrowerId, enabled, reloadKey) {
  const [state, setState] = useState({ loading: false, records: {}, failed: [] });
  useEffect(() => {
    if (!enabled || !borrowerId) return undefined;
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    const q = { borrower_id: borrowerId };
    Promise.allSettled(SOURCES.map((s) => s.load(q))).then((results) => {
      if (!active) return;
      const records = {};
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") records[SOURCES[i].key] = asList(r.value);
        else failed.push(SOURCES[i].label);
      });
      setState({ loading: false, records, failed });
    });
    return () => {
      active = false;
    };
  }, [borrowerId, enabled, reloadKey]);
  return state;
}

function downloadCsv(entries, companyName) {
  const blob = new Blob([auditTrailCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = auditFileName(companyName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Opens the browser print dialog once the print copy is in the page, then removes it.
function usePrint() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    document.body.classList.add(PRINT_CLASS);
    window.addEventListener("afterprint", done);
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove(PRINT_CLASS);
    };
  }, [printing]);
  return [printing, () => setPrinting(true)];
}

export default function AuditTrail({ borrower, signals }) {
  const [open, setOpen] = useState(false);
  const { loading, records, failed } = useAuditRecords(borrower.id, open, borrower.last_refreshed);
  const entries = buildAuditTrail({ borrower, signals, ...records });
  const shown = collapseRepeatedChecks(entries);
  const generated = formatTrailDate(new Date().toISOString());
  const [printing, startPrint] = usePrint();
  const intro = `Newest first. Generated ${generated}. ${NOT_AI_TEXT}`;

  return (
    <section data-demo="audit-trail" aria-labelledby="audit-heading" className="border-b border-ew-rule">
      <style>{PRINT_CSS}</style>
      {printing &&
        createPortal(
          <div id={PRINT_ID} className="text-ew-ink">
            <h1 className="font-heading text-lg font-bold">Kestrel audit trail: {borrower.name}</h1>
            <p className="mt-1 text-xs text-ew-ink-soft">{intro}</p>
            {failed.length > 0 && <p className="mt-1 text-xs">Not included (could not be loaded): {failed.join(", ")}.</p>}
            <AuditTable entries={shown} loading={false} forPrint />
          </div>,
          document.body
        )}
      <Collapsible open={open} onOpenChange={setOpen}>
        <h2 id="audit-heading" className="font-heading">
          <CollapsibleTrigger data-demo="audit-open" className="group flex w-full items-baseline gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus">
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 translate-y-0.5 text-ew-muted transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-90" />
            <span className="text-lg font-bold tracking-tight text-ew-ink group-hover:underline group-hover:decoration-ew-rule group-hover:underline-offset-4">
              Audit trail
            </span>
            <span className="ml-auto hidden pl-3 text-right font-sans text-xs font-normal text-ew-muted sm:inline">
              {open ? borrower.name : "every check, finding and decision, with who and when"}
            </span>
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <div className="border-t border-ew-rule-soft pb-4 pt-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-[80ch] text-xs leading-snug text-ew-muted">
                {intro}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={loading || entries.length === 0} onClick={() => downloadCsv(entries, borrower.name)} className="h-8 rounded-sm border-ew-rule">
                  <Download aria-hidden="true" />
                  Download audit trail (CSV)
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={loading || entries.length === 0} onClick={startPrint} className="h-8 rounded-sm border-ew-rule">
                  <Printer aria-hidden="true" />
                  Print or save as PDF
                </Button>
              </div>
            </div>
            {failed.length > 0 && (
              <p role="status" className="mt-2 border-l-2 border-ew-amber bg-ew-amber-bg px-2 py-1 text-xs text-ew-ink">
                Could not load {failed.join(", ")} for this viewer, so they are not listed.
              </p>
            )}
            <AuditTable entries={shown} loading={loading} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function AuditTable({ entries, loading, forPrint = false }) {
  if (loading) return <p className="mt-3 text-sm text-ew-muted" aria-busy="true">Loading the audit trail…</p>;
  if (entries.length === 0) return <p className="mt-3 text-sm text-ew-muted">Nothing recorded for this company yet.</p>;
  return (
    <div className={forPrint ? "mt-3" : "mt-3 overflow-x-auto"}>
      <table className={`w-full border-collapse ${forPrint ? "" : "min-w-[720px]"} text-left text-xs`}>
        <caption className="sr-only">Audit trail, newest first</caption>
        <thead>
          <tr className="border-b border-ew-rule text-ew-muted">
            <th scope="col" className="w-[150px] py-2 pr-3 font-semibold">When</th>
            <th scope="col" className="w-[170px] py-2 pr-3 font-semibold">Who</th>
            <th scope="col" className="py-2 pr-3 font-semibold">What happened</th>
            {!forPrint && <th scope="col" className="w-[80px] py-2 font-semibold">Source</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.kind}-${e.at}-${i}`} className="border-b border-ew-rule-soft align-top">
              <td className="py-2 pr-3 tabular-nums text-ew-ink-soft">
                {e.at ? <time dateTime={e.at}>{formatTrailDate(e.at)}</time> : "Unknown"}
              </td>
              <td className="break-words py-2 pr-3 text-ew-ink-soft">{e.actor}</td>
              <td className="py-2 pr-3">
                <p className="font-medium text-ew-ink">
                  <span className="mr-1.5 rounded-sm border border-ew-rule px-1 text-[10px] font-semibold uppercase tracking-wide text-ew-muted">
                    {KIND_LABEL[e.kind]}
                  </span>
                  {e.event}
                  {e.count > 1 && <span className="ml-1.5 tabular-nums text-ew-muted">×{e.count}</span>}
                </p>
                {e.details && <p className="mt-0.5 leading-snug text-ew-ink-soft">{e.details}</p>}
                {forPrint && e.source_url && <p className="mt-0.5 break-all text-ew-muted">Source: {e.source_url}</p>}
              </td>
              {!forPrint && (
              <td className="py-2">
                {e.source_url ? (
                  <a
                    href={e.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open source for: ${e.event} (opens in a new tab)`}
                    className="inline-flex items-center gap-1 rounded-sm font-medium text-ew-ink underline underline-offset-2 hover:text-ew-ink-soft"
                  >
                    Open
                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-ew-muted">—</span>
                )}
              </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
