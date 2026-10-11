import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { format } from "date-fns";
import { ChevronRight, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

// Cash-flow document check. The officer uploads a bank or cash-flow statement;
// analyzeCashflow extracts the transaction lines and plain code finds every
// lender paid from the account, late and missed payments, NSF items and
// debt-service metrics. Every evidence row is a line from the statement.
// This panel never changes the company's status.

const ACCEPT = ".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,application/pdf,text/csv,image/png,image/jpeg";
const SAMPLES = {
  csv: { url: "/samples/sample-cashflow.csv", name: "sample-cashflow.csv", type: "text/csv" },
  pdf: { url: "/samples/sample-statement.pdf", name: "sample-statement.pdf", type: "application/pdf" },
};
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const SEVERITY = {
  strong: { label: "Serious", className: "border-ew-red-rule bg-ew-red-bg text-ew-red", glyph: "bg-ew-red" },
  weak: { label: "Minor", className: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber", glyph: "rotate-45 bg-ew-amber" },
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function money(n, cents = false) {
  return typeof n === "number" && Number.isFinite(n) ? (cents ? usdCents : usd).format(n) : "—";
}

function shortDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy");
}

function errorText(e) {
  return e?.response?.data?.error || e?.data?.error || e?.message || "The cash-flow check could not finish. Please try again.";
}

function itemsOf(res) {
  return Array.isArray(res) ? res : res?.items || [];
}

export default function CashflowReview({ borrower, onReviewChange }) {
  const borrowerId = borrower?.id;
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(null); // null | "uploading" | "analyzing"
  const [error, setError] = useState(null);

  const loadLatest = useCallback(async () => {
    if (!borrowerId) return;
    try {
      const reviews = await base44.entities.CashflowReview.filter({ borrower_id: borrowerId }, { limit: 1, sort: "-created_at" });
      setReview(itemsOf(reviews)[0] || null);
    } catch {
      setReview(null);
    } finally {
      setLoading(false);
    }
  }, [borrowerId]);

  useEffect(() => {
    if (onReviewChange) onReviewChange(review);
  }, [review, onReviewChange]);

  useEffect(() => {
    setLoading(true);
    setReview(null);
    setError(null);
    loadLatest();
  }, [loadLatest]);

  async function analyzeFile(file) {
    if (!file || !borrowerId || phase) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 20 MB. Upload a smaller statement.");
      return;
    }
    setError(null);
    try {
      setPhase("uploading");
      const uploaded = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploaded?.file_url || uploaded?.data?.file_url;
      if (!fileUrl) throw new Error("Upload did not return a file URL.");
      setPhase("analyzing");
      const res = await base44.functions.invoke("analyzeCashflow", { borrower_id: borrowerId, file_url: fileUrl });
      const fresh = res?.data?.review || res?.review;
      if (fresh) setReview(fresh);
      else await loadLatest();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPhase(null);
    }
  }

  async function handleSample(kind) {
    const sample = SAMPLES[kind] || SAMPLES.csv;
    setError(null);
    try {
      const res = await fetch(sample.url);
      if (!res.ok) throw new Error("Could not load the sample statement.");
      const blob = await res.blob();
      await analyzeFile(new File([blob], sample.name, { type: sample.type }));
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <section aria-labelledby="cashflow-heading" className="border border-ew-rule bg-ew-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ew-rule-soft px-5 py-4">
        <div className="min-w-0">
          <h2 id="cashflow-heading" className="font-heading text-base font-bold tracking-tight text-ew-ink">
            Bank statement check
          </h2>
          <p className="mt-0.5 max-w-xl text-xs text-ew-muted">
            Upload the applicant's bank statement. We list who they pay each month, late payments and bounced
            payments. Each row is a line copied from the statement.
          </p>
        </div>
      </header>

      <div className="space-y-5 px-5 py-4">
        <Dropzone busy={!!phase} onFile={analyzeFile} onSample={handleSample} />

        {phase && (
          <p className="flex items-center gap-2 text-sm text-ew-ink-soft" role="status" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {phase === "uploading" ? "Uploading statement…" : "Reading the statement and checking each lender…"}
          </p>
        )}

        {error && (
          <p role="alert" className="border-l-2 border-ew-red bg-ew-red-bg px-3 py-2 text-xs text-ew-red">
            {error}
          </p>
        )}

        {loading && <p className="text-sm text-ew-muted">Loading…</p>}

        {!loading && !review && !phase && (
          <p className="text-sm text-ew-muted">No bank statement checked yet for this company.</p>
        )}

        {review && <ReviewBody review={review} />}
      </div>
    </section>
  );
}

function Dropzone({ busy, onFile, onSample }) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (!busy) onFile(e.dataTransfer?.files?.[0]);
  }

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-w-[240px] flex-1 items-center gap-3 border border-dashed px-4 py-3 transition-colors ${
          dragging ? "border-ew-focus bg-ew-hover" : "border-ew-rule bg-ew-paper/40"
        }`}
      >
        <FileUp className="h-5 w-5 shrink-0 text-ew-muted" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <label htmlFor={inputId} className="cursor-pointer font-medium text-ew-ink underline underline-offset-2 hover:text-ew-focus">
            Upload a statement
          </label>
          <span className="text-ew-muted"> or drop it here</span>
          <p id={hintId} className="text-xs text-ew-muted">PDF, CSV, XLSX or image · up to 20 MB</p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          aria-describedby={hintId}
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>
      <div className="flex flex-col justify-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => onSample("csv")} disabled={busy}>
          Try a sample statement
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onSample("pdf")} disabled={busy}>
          Try a sample PDF
        </Button>
      </div>
    </div>
  );
}

function ReviewBody({ review }) {
  const flags = review.flags || [];
  const lenders = review.lenders || [];
  const exceptions = review.exceptions || [];
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs text-ew-muted">
            Statement {shortDate(review.period_start)} to {shortDate(review.period_end)}
            {review.transaction_count ? ` · ${review.transaction_count} lines` : ""}
          </p>
          {review.extraction_method === "sandbox" && <SandboxBadge />}
        </div>
        <p className="mt-1 max-w-3xl text-[15px] font-medium leading-snug text-ew-ink">{review.summary}</p>
      </div>

      {flags.length > 0 && (
        <ul className="space-y-1.5" aria-label="Warning signs from the statement">
          {flags.map((f, i) => {
            const s = SEVERITY[f.severity] || SEVERITY.weak;
            return (
              <li key={i} className="flex items-start gap-2 text-sm text-ew-ink">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 border px-1.5 py-0.5 text-[11px] font-semibold ${s.className}`}>
                  <span className={`h-1.5 w-1.5 ${s.glyph}`} aria-hidden="true" />
                  {s.label}
                </span>
                <span>{f.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      <Metrics review={review} />
      <LendersTable lenders={lenders} />
      {exceptions.length > 0 && <Exceptions lines={exceptions} />}
    </div>
  );
}

function SandboxBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 border border-ew-rule px-1.5 py-0.5 text-[11px] font-medium text-ew-ink-soft"
      title="The file was opened only in a temporary, isolated environment and read by fixed rules. Every line below is copied from the statement."
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      Read in a secure, isolated environment
    </span>
  );
}

function Metrics({ review }) {
  const ratio = review.debt_service_ratio;
  const items = [
    { label: "Lenders", value: review.lender_count ?? 0, alert: (review.lender_count ?? 0) >= 4 },
    {
      label: "Share of incoming cash going to loan payments",
      value: typeof ratio === "number" ? `${Math.round(ratio * 100)}%` : "—",
      alert: typeof ratio === "number" && ratio >= 0.35,
    },
    { label: "Loan payments per month", value: money(review.monthly_debt_service) },
    { label: "Incoming cash per month", value: money(review.monthly_inflows) },
    { label: "Months ending below zero", value: review.negative_months ?? 0, alert: (review.negative_months ?? 0) > 0 },
    { label: "Lowest balance", value: money(review.lowest_balance) },
    { label: "Bounced payments", value: review.nsf_count ?? 0, alert: (review.nsf_count ?? 0) >= 2 },
  ];
  return (
    <dl className="grid grid-cols-2 border-y border-ew-rule sm:grid-cols-4">
      {items.map((m) => (
        <div key={m.label} className="border-ew-rule-soft px-3 py-2 [&:not(:first-child)]:border-l">
          <dt className="text-[11px] leading-tight text-ew-muted">{m.label}</dt>
          <dd className={`mt-0.5 font-mono text-sm font-semibold ${m.alert ? "text-ew-red" : "text-ew-ink"}`}>
            {m.value}
            {m.alert && <span className="sr-only"> (flagged)</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LendersTable({ lenders }) {
  if (lenders.length === 0) {
    return <p className="text-sm text-ew-muted">No regular loan payments found.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="mb-1.5 text-left text-xs font-semibold text-ew-muted">Lenders paid from this account (monthly payments)</caption>
        <thead>
          <tr className="border-b border-ew-rule text-left text-xs text-ew-muted">
            <th scope="col" className="py-1.5 pr-3 font-semibold">Lender</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">Payments</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">Typical amount</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">Usual day</th>
            <th scope="col" className="px-3 py-1.5 text-right font-semibold">Late</th>
            <th scope="col" className="py-1.5 pl-3 text-right font-semibold">Missed</th>
          </tr>
        </thead>
        {lenders.map((l, i) => (
          <LenderRows key={`${l.name}-${i}`} lender={l} />
        ))}
      </table>
    </div>
  );
}

function CountCell({ n, label }) {
  if (!n) return <span className="text-ew-muted">0</span>;
  return (
    <span className="font-semibold text-ew-red">
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function LenderRows({ lender }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const evidence = lender.evidence || [];
  return (
    <tbody className="border-b border-ew-rule-soft">
      <tr className="hover:bg-ew-hover">
        <th scope="row" className="py-2 pr-3 text-left font-medium text-ew-ink">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-sm text-left hover:text-ew-focus"
          >
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
            {lender.name}
            <span className="sr-only">, {open ? "hide" : "show"} payment lines</span>
          </button>
          {lender.cadence && lender.cadence !== "monthly" && (
            <span className="ml-5 block text-[11px] font-normal text-ew-muted">{lender.cadence} payments, not scored for lateness</span>
          )}
        </th>
        <td className="px-3 py-2 text-right font-mono">{lender.payments}</td>
        <td className="px-3 py-2 text-right font-mono">{money(lender.typical_amount, true)}</td>
        <td className="px-3 py-2 text-right font-mono">{lender.typical_day ? `${lender.typical_day}` : "—"}</td>
        <td className="px-3 py-2 text-right font-mono"><CountCell n={lender.late_count} label="late" /></td>
        <td className="py-2 pl-3 text-right font-mono"><CountCell n={lender.missed_count} label="missed" /></td>
      </tr>
      <tr id={panelId} hidden={!open}>
        <td colSpan={6} className="bg-ew-hover px-3 pb-3 pt-1">
          {lender.missed_months?.length > 0 && (
            <p className="mb-1.5 text-xs text-ew-red">No payment found for: {lender.missed_months.join(", ")}</p>
          )}
          <EvidenceTable rows={evidence} />
        </td>
      </tr>
    </tbody>
  );
}

function EvidenceTable({ rows }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[11px] text-ew-muted">
          <th scope="col" className="py-1 pr-3 font-semibold">Date</th>
          <th scope="col" className="py-1 pr-3 font-semibold">Statement line</th>
          <th scope="col" className="py-1 pr-3 text-right font-semibold">Amount</th>
          <th scope="col" className="py-1 text-right font-semibold">Timing</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => (
          <tr key={i} className="border-t border-ew-rule-soft">
            <td className="py-1 pr-3 font-mono text-ew-ink-soft">{e.date}</td>
            <td className="py-1 pr-3 font-mono text-ew-ink">{e.description}</td>
            <td className="py-1 pr-3 text-right font-mono text-ew-ink">{money(e.amount, true)}</td>
            <td className="py-1 text-right">
              {e.days_late ? (
                <span className="font-semibold text-ew-red">{e.days_late} days late</span>
              ) : (
                <span className="text-ew-muted">On time</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Exceptions({ lines }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-ew-muted">Bounced payments and late fees</h3>
      <ul className="mt-1.5 divide-y divide-ew-rule-soft border-y border-ew-rule-soft">
        {lines.map((l, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 py-1 font-mono text-xs">
            <span className="text-ew-ink-soft">{l.date}</span>
            <span className="flex-1 text-ew-ink">{l.description}</span>
            <span className="text-ew-ink">{money(l.amount, true)}</span>
            <span className="font-sans text-[11px] font-semibold text-ew-red">{l.kind === "nsf" ? "Bounced" : "Late fee"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
