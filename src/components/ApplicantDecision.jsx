import React, { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, Copy, ExternalLink, Landmark, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  buildDocumentRequest,
  documentRequestToText,
} from "@/lib/documents.ts";

// Applicant decision panel, from lender user testing:
// - "loans at many other banks and small, slightly late payments to them" were
//   the red flags, so the other-lenders count is the headline;
// - "I wish I woulda asked the cash flow documents a lot earlier", so the
//   document request is generated up front;
// - follow-up after declining was informal, so every decision is logged with
//   who made it, a note and an optional follow-up date.
// The lender check never changes the company's status.

const DECISIONS = [
  { value: "request_documents", label: "Request documents", className: "border-ew-rule bg-ew-surface text-ew-ink" },
  { value: "proceed", label: "Proceed", className: "border-ew-rule bg-ew-surface text-ew-ink" },
  { value: "watchlist", label: "Watchlist", className: "border-ew-rule bg-ew-surface text-ew-ink" },
  { value: "decline", label: "Decline", className: "border-ew-rule bg-ew-surface text-ew-ink" },
];
const DECISION_BY_VALUE = Object.fromEntries(DECISIONS.map((d) => [d.value, d]));

const KIND_LABELS = {
  lien: "Lien (UCC)",
  lender_lawsuit: "Lender lawsuit",
  judgment: "Judgment",
  new_loan: "New loan",
  mca: "Merchant cash advance",
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500";

function safeHref(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function errorText(e, fallback) {
  return e?.response?.data?.error || e?.data?.error || e?.message || fallback;
}

function asList(res) {
  return Array.isArray(res) ? res : res?.items || [];
}

function formatWhen(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${format(d, "MMM d, yyyy HH:mm")} (${formatDistanceToNow(d, { addSuffix: true })})`;
}

function SectionLabel({ id, children }) {
  return (
    <h3 id={id} className="text-sm font-semibold text-ew-ink">
      {children}
    </h3>
  );
}

function SourceLink({ url, name }) {
  const href = safeHref(url);
  const label = name || hostOf(url) || "Source";
  if (!href) return <span>{label}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 underline-offset-2 hover:text-gray-900 hover:underline ${focusRing}`}
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Quote({ quote, url, name, date }) {
  return (
    <div>
      <blockquote className="text-sm italic text-gray-700">&ldquo;{quote}&rdquo;</blockquote>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
        <SourceLink url={url} name={name} />
        {date && (
          <>
            <span className="text-gray-300" aria-hidden="true">·</span>
            <span>{date}</span>
          </>
        )}
      </div>
    </div>
  );
}

function LenderList({ lenders }) {
  if (lenders.length === 0) return null;
  return (
    <ul className="divide-y divide-gray-100 rounded border border-gray-200">
      {lenders.map((lender) => (
        <li key={lender.name} className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{lender.name}</span>
            {(lender.kinds || []).map((k) => (
              <span
                key={k}
                className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-700"
              >
                {KIND_LABELS[k] || k}
              </span>
            ))}
          </div>
          <div className="space-y-2 border-l-2 border-gray-200 pl-3">
            {(lender.evidence || []).map((e, i) => (
              <Quote key={`${e.source_url}-${i}`} quote={e.quote} url={e.source_url} name={e.source_name} date={e.date} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function LatePayments({ evidence }) {
  if (evidence.length === 0) return null;
  return (
    <div role="note" aria-labelledby="late-payments-heading" className="rounded border border-red-300 bg-red-50 px-4 py-3">
      <p id="late-payments-heading" className="text-sm font-semibold text-red-900">
        Late payments to other lenders: {evidence.length} source{evidence.length === 1 ? "" : "s"}
      </p>
      <ul className="mt-2 space-y-2">
        {evidence.map((e, i) => (
          <li key={`${e.source_url}-${i}`}>
            {e.lender && <p className="text-xs font-medium text-red-900">{e.lender}</p>}
            <Quote quote={e.quote} url={e.source_url} date={e.date} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchLog({ searched }) {
  const [open, setOpen] = useState(false);
  if (!searched?.length) return null;
  const failed = searched.filter((s) => !s.ok).length;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={`inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 ${focusRing}`}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        What was searched{failed > 0 ? ` (${failed} failed)` : ""}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {searched.map((s, i) => (
            <li key={i} className="break-all">
              <span className="font-medium text-gray-700">{s.tool === "read" ? "Read page" : "Search"}:</span> {s.query}{" "}
              <span className={s.ok ? "text-gray-400" : "text-red-700"}>
                ({s.ok ? s.detail || "ok" : `failed${s.detail ? `: ${s.detail}` : ""}`})
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DocumentChecklist({ items, onCopy, copied }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel id="documents-heading">Documents to request</SectionLabel>
        <Button size="sm" variant="outline" onClick={onCopy} aria-describedby="copy-status">
          {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy as email"}
        </Button>
      </div>
      <span id="copy-status" className="sr-only" aria-live="polite">
        {copied ? "Document request copied to clipboard" : ""}
      </span>
      <ol aria-labelledby="documents-heading" className="space-y-2">
        {items.map((d, i) => (
          <li key={d.item} className="flex gap-3 text-sm">
            <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
            <div className="min-w-0">
              <p className="font-medium text-gray-900">{d.item}</p>
              <p className="text-xs text-gray-600">{d.reason}</p>
              {d.source_url && (
                <p className="mt-0.5 text-xs text-gray-500">
                  <SourceLink url={d.source_url} />
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DecisionBadge({ value }) {
  const d = DECISION_BY_VALUE[value];
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${d?.className || "border-gray-200 bg-gray-50 text-gray-700"}`}>
      {d?.label || value}
    </span>
  );
}

function DecisionHistory({ decisions }) {
  if (decisions.length === 0) {
    return <p className="text-sm text-gray-500">No decisions recorded yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {decisions.map((d) => (
        <li key={d.id || d.created_at} className="rounded border border-gray-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <DecisionBadge value={d.decision} />
            <span>{d.decided_by || "Unknown user"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatWhen(d.created_at)}</span>
          </div>
          {d.note && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{d.note}</p>}
          <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-600">
            {d.follow_up_date && <span>Follow up on {d.follow_up_date}</span>}
            {d.documents_requested?.length > 0 && (
              <span>{d.documents_requested.length} documents requested</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DecisionForm({ saving, onSave }) {
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const submit = async (decision) => {
    const ok = await onSave({ decision, note: note.trim(), follow_up_date: followUp });
    if (ok) {
      setNote("");
      setFollowUp("");
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="decision-note" className="text-xs text-gray-600">Note (optional)</Label>
          <Textarea
            id="decision-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Why this decision, what was discussed, what to check next"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="decision-follow-up" className="text-xs text-gray-600">Follow-up date (optional)</Label>
          <Input
            id="decision-follow-up"
            type="date"
            value={followUp}
            min={format(new Date(), "yyyy-MM-dd")}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </div>
      </div>
      <div role="group" aria-label="Record a decision" className="flex flex-wrap gap-2">
        {DECISIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            disabled={saving}
            onClick={() => submit(d.value)}
            className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors hover:border-ew-ink-soft hover:bg-ew-hover active:bg-ew-rule-soft disabled:cursor-not-allowed disabled:opacity-50 ${d.className} ${focusRing}`}
          >
            {d.label}
          </button>
        ))}
        {saving && <Loader2 className="h-4 w-4 animate-spin self-center text-gray-500" aria-label="Saving decision" />}
      </div>
    </div>
  );
}

function useApplicantRecords(borrowerId) {
  const [check, setCheck] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!borrowerId) return undefined;
    let active = true;
    setLoading(true);
    setCheck(null);
    setAnalysis(null);
    setDecisions([]);
    const q = { borrower_id: borrowerId };
    Promise.allSettled([
      base44.entities.LenderCheck.filter(q, "-created_at", 1),
      base44.entities.Analysis.filter(q, "-created_at", 1),
      base44.entities.Decision.filter(q, "-created_at", 50),
    ]).then(([c, a, d]) => {
      if (!active) return;
      setCheck(c.status === "fulfilled" ? asList(c.value)[0] || null : null);
      setAnalysis(a.status === "fulfilled" ? asList(a.value)[0] || null : null);
      setDecisions(d.status === "fulfilled" ? asList(d.value) : []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [borrowerId]);

  return { check, setCheck, analysis, decisions, setDecisions, loading };
}

export default function ApplicantDecision({ borrower, signals }) {
  const borrowerId = borrower?.id;
  const { email } = useAuth();
  const { check, setCheck, analysis, decisions, setDecisions, loading } = useApplicantRecords(borrowerId);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const documents = useMemo(
    () => buildDocumentRequest(borrower, signals || [], check, analysis),
    [borrower, signals, check, analysis]
  );

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("lenderCheck", { borrower_id: borrowerId });
      const fresh = res?.data?.lender_check || res?.lender_check;
      if (fresh) setCheck(fresh);
    } catch (e) {
      setError(errorText(e, "The lender check could not finish. Please try again."));
    } finally {
      setRunning(false);
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(documentRequestToText(borrower, documents));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy to the clipboard. Select the list and copy it manually.");
    }
  }

  async function saveDecision({ decision, note, follow_up_date }) {
    setSaving(true);
    setError(null);
    try {
      const decidedBy = email || (await base44.auth.me().catch(() => null))?.email;
      if (!decidedBy) {
        setError("Sign in to record a decision. It is logged under your name.");
        return false;
      }
      const record = {
        borrower_id: borrowerId,
        decision,
        note,
        documents_requested: decision === "request_documents" ? documents : [],
        decided_by: decidedBy,
        created_at: new Date().toISOString(),
        ...(follow_up_date ? { follow_up_date } : {}),
      };
      const saved = await base44.entities.Decision.create(record);
      setDecisions((prev) => [saved || record, ...prev]);
      return true;
    } catch (e) {
      setError(errorText(e, "The decision could not be saved. Please try again."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const lenders = check?.lenders || [];
  const late = check?.late_payment_evidence || [];
  const count = check ? check.lender_count ?? lenders.length : null;

  return (
    <section aria-labelledby="applicant-decision-heading" className="rounded-md border border-gray-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id="applicant-decision-heading" className="text-sm font-semibold text-gray-900">
            Other lenders and decision
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Public liens, lender lawsuits and loan news. Quotes are checked against their sources.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button size="sm" variant="outline" onClick={runCheck} disabled={running || !borrowerId}>
            {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Landmark className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {running ? "Checking…" : check ? "Check again" : "Check other lenders"}
          </Button>
          {running && (
            <p className="text-xs text-gray-500" aria-live="polite">
              Searching liens, court records and loan news. This can take up to 90 seconds.
            </p>
          )}
        </div>
      </header>

      <div className="space-y-6 px-5 py-4">
        {error && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="space-y-3" aria-busy={loading || running}>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p
              className={
                count === null || loading
                  ? "text-sm font-semibold text-ew-ink"
                  : "font-heading text-2xl font-bold tabular-nums text-ew-ink"
              }
            >
              Other lenders: {loading ? "…" : count === null ? "not checked" : count}
            </p>
            {check?.created_at && <p className="text-xs text-gray-500">Checked {formatWhen(check.created_at)}</p>}
          </div>
          {check?.summary && <p className="max-w-3xl text-sm text-gray-700">{check.summary}</p>}
          {!loading && !check && !running && (
            <p className="text-sm text-gray-500">
              Not checked yet. Loans at several other banks are an early warning sign; run the check before deciding.
            </p>
          )}
          <LatePayments evidence={late} />
          <LenderList lenders={lenders} />
          <SearchLog searched={check?.searched} />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <DocumentChecklist items={documents} onCopy={copyEmail} copied={copied} />
        </div>

        <div className="space-y-3 border-t border-gray-100 pt-5">
          <SectionLabel>Record a decision</SectionLabel>
          <DecisionForm saving={saving} onSave={saveDecision} />
        </div>

        <div className="space-y-3 border-t border-gray-100 pt-5">
          <SectionLabel>Decision history</SectionLabel>
          <DecisionHistory decisions={decisions} />
        </div>
      </div>
    </section>
  );
}
