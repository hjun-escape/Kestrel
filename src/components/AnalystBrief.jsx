import React, { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ExternalLink, FileSearch, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Analyst brief: the latest Analysis for a borrower, written by the
// analyzeBorrower function. Every finding shown has a verbatim quote that was
// checked in code against its source. The analyst never changes status.

const ACTIONS = {
  proceed: {
    label: "Proceed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  request_documents: {
    label: "Request documents",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  escalate: {
    label: "Escalate",
    className: "border-red-200 bg-red-50 text-red-800",
  },
};

const TOOL_LABELS = {
  news_search: "News search",
  read_page: "Read article",
  plan: "Planning",
};

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

function errorText(e) {
  return (
    e?.response?.data?.error ||
    e?.data?.error ||
    e?.message ||
    "The analyst could not finish. Please try again."
  );
}

function SectionLabel({ children }) {
  return (
    <h3 className="text-sm font-semibold text-ew-ink">
      {children}
    </h3>
  );
}

function Finding({ finding }) {
  const href = safeHref(finding.source_url);
  const sourceLabel = finding.source_name || hostOf(finding.source_url) || "Source";
  return (
    <li className="border-l-2 border-gray-300 pl-4">
      <p className="text-sm font-medium text-gray-900">{finding.claim}</p>
      <blockquote className="mt-1.5 text-sm italic text-gray-600">
        &ldquo;{finding.quote}&rdquo;
      </blockquote>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:text-gray-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-400"
          >
            {sourceLabel}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span>{sourceLabel}</span>
        )}
        {finding.date && (
          <>
            <span className="text-gray-300">·</span>
            <span>{finding.date}</span>
          </>
        )}
      </div>
    </li>
  );
}

function Steps({ steps, dropped }) {
  const [open, setOpen] = useState(false);
  if ((!steps || steps.length === 0) && !dropped) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-gray-100 pt-3">
      <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-400">
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        How the analyst worked
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-1.5">
          {(steps || []).map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-600">
              <span className="w-4 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
              <span className="min-w-0">
                <span className="font-medium text-gray-700">
                  {TOOL_LABELS[step.tool] || step.tool}
                </span>
                {step.input && <span className="break-all"> &mdash; {step.input}</span>}
                <span className={step.ok ? "text-gray-400" : "text-red-600"}>
                  {" "}
                  ({step.ok ? step.detail || "ok" : `failed${step.detail ? `: ${step.detail}` : ""}`})
                </span>
              </span>
            </li>
          ))}
          {(!steps || steps.length === 0) && (
            <li className="text-xs text-gray-500">No web lookups; brief based on stored signals.</li>
          )}
        </ol>
        {dropped > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            {dropped} finding{dropped === 1 ? " was" : "s were"} discarded because the quote
            could not be matched word for word to its source.
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function AnalystBrief({ borrower }) {
  const borrowerId = borrower?.id;
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const loadLatest = useCallback(async () => {
    if (!borrowerId) return;
    try {
      const res = await base44.entities.Analysis.filter(
        { borrower_id: borrowerId },
        { limit: 1, sort: "-created_at" }
      );
      const items = Array.isArray(res) ? res : res?.items || [];
      setAnalysis(items[0] || null);
    } catch {
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [borrowerId]);

  useEffect(() => {
    setLoading(true);
    setAnalysis(null);
    setError(null);
    loadLatest();
  }, [loadLatest]);

  async function runAnalyst() {
    setRunning(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("analyzeBorrower", { borrower_id: borrowerId });
      const fresh = res?.data?.analysis || res?.analysis;
      if (fresh) setAnalysis(fresh);
      else await loadLatest();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }

  const action = analysis ? ACTIONS[analysis.recommended_action] : null;
  const findings = analysis?.findings || [];
  const questions = analysis?.open_questions || [];

  return (
    <section
      aria-labelledby="analyst-brief-heading"
      className="rounded-md border border-gray-200 bg-white"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="min-w-0">
          <h2 id="analyst-brief-heading" className="text-sm font-semibold text-gray-900">
            Analyst brief
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {analysis?.created_at
              ? `Written ${formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })} · ${format(new Date(analysis.created_at), "MMM d, yyyy HH:mm")}`
              : "AI investigation of public news. Quotes are checked against their sources."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button size="sm" variant="outline" onClick={runAnalyst} disabled={running || !borrowerId}>
            {running ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSearch className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {running ? "Investigating…" : analysis ? "Run again" : "Run analyst"}
          </Button>
          {running && (
            <p className="text-xs text-gray-500" aria-live="polite">
              Searching news and reading sources. This can take up to 2 minutes.
            </p>
          )}
        </div>
      </header>

      <div className="space-y-5 px-5 py-4">
        {error && (
          <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        {loading && <p className="text-sm text-gray-500">Loading…</p>}

        {!loading && !analysis && !running && (
          <p className="text-sm text-gray-500">
            No brief yet. Run the analyst to investigate lawsuits, new lenders, executive
            exits and layoffs for this company.
          </p>
        )}

        {analysis && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Recommended action</span>
              <Badge
                variant="outline"
                className={`rounded font-medium ${action?.className || "border-gray-200 bg-gray-50 text-gray-700"}`}
              >
                {action?.label || analysis.recommended_action}
              </Badge>
            </div>

            <p className="max-w-3xl text-sm leading-relaxed text-gray-800">{analysis.summary}</p>

            <div className="space-y-2">
              <SectionLabel>Findings</SectionLabel>
              {findings.length > 0 ? (
                <ul className="space-y-4">
                  {findings.map((f, i) => (
                    <Finding key={`${f.source_url}-${i}`} finding={f} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No verified findings.</p>
              )}
            </div>

            {questions.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Open questions</SectionLabel>
                <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <Steps steps={analysis.steps} dropped={analysis.findings_dropped || 0} />
          </>
        )}
      </div>
    </section>
  );
}
