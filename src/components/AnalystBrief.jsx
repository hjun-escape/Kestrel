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
    className: "border-ew-green-rule bg-ew-green-bg text-ew-green",
  },
  request_documents: {
    label: "Request documents",
    className: "border-ew-amber-rule bg-ew-amber-bg text-ew-amber",
  },
  escalate: {
    label: "Escalate",
    className: "border-ew-red-rule bg-ew-red-bg text-ew-red",
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
    <li className="border-l-2 border-ew-rule pl-4">
      <p className="text-sm font-medium text-ew-ink">{finding.claim}</p>
      <blockquote className="mt-1.5 text-sm italic text-ew-ink-soft">
        &ldquo;{finding.quote}&rdquo;
      </blockquote>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-ew-muted">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-2 hover:text-ew-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus"
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
            <span className="text-ew-rule">·</span>
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
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-ew-rule-soft pt-3">
      <CollapsibleTrigger className="inline-flex items-center gap-1 text-xs font-medium text-ew-ink-soft hover:text-ew-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus">
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        How the analyst worked
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 space-y-1.5">
          {(steps || []).map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-ew-ink-soft">
              <span className="w-4 shrink-0 text-right font-mono text-ew-rule">{i + 1}.</span>
              <span className="min-w-0">
                <span className="font-medium text-ew-ink-soft">
                  {TOOL_LABELS[step.tool] || step.tool}
                </span>
                {step.input && <span className="break-all"> &mdash; {step.input}</span>}
                <span className={step.ok ? "text-ew-rule" : "text-ew-red"}>
                  {" "}
                  ({step.ok ? step.detail || "ok" : `failed${step.detail ? `: ${step.detail}` : ""}`})
                </span>
              </span>
            </li>
          ))}
          {(!steps || steps.length === 0) && (
            <li className="text-xs text-ew-muted">No web lookups; brief based on stored signals.</li>
          )}
        </ol>
        {dropped > 0 && (
          <p className="mt-2 text-xs text-ew-muted">
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

  const runButton = (
    <Button size="sm" variant="outline" onClick={runAnalyst} disabled={running || !borrowerId} className="h-8 shrink-0 rounded-sm">
      {running ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileSearch className="mr-1.5 h-4 w-4" aria-hidden="true" />
      )}
      {running ? "Investigating…" : analysis ? "Run again" : "Run analyst"}
    </Button>
  );

  if (!analysis && !running) {
    return (
      <section aria-labelledby="analyst-brief-heading" className="border border-ew-rule bg-ew-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="analyst-brief-heading" className="font-heading text-sm font-bold text-ew-ink">
              Analyst brief
            </h2>
            <p className="mt-0.5 text-xs text-ew-muted">
              {loading
                ? "Loading…"
                : "Not run. Reads public news for lawsuits, new lenders, executive exits and layoffs."}
            </p>
          </div>
          {runButton}
        </div>
        {error && (
          <p role="alert" className="mt-2 rounded-sm border border-ew-red-rule bg-ew-red-bg px-3 py-2 text-xs text-ew-red">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="analyst-brief-heading"
      className="border border-ew-rule bg-ew-surface"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ew-rule-soft px-4 py-3">
        <div className="min-w-0">
          <h2 id="analyst-brief-heading" className="font-heading text-sm font-bold text-ew-ink">
            Analyst brief
          </h2>
          <p className="mt-0.5 text-xs text-ew-muted">
            {analysis?.created_at
              ? `Written ${formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })} · ${format(new Date(analysis.created_at), "MMM d, yyyy HH:mm")}`
              : "AI investigation of public news. Quotes are checked against their sources."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {runButton}
          {running && (
            <p className="text-xs text-ew-muted" aria-live="polite">
              Searching news and reading sources. This can take up to 2 minutes.
            </p>
          )}
        </div>
      </header>

      <div className="space-y-5 px-4 py-3">
        {error && (
          <p role="alert" className="rounded-sm border border-ew-red-rule bg-ew-red-bg px-3 py-2 text-xs text-ew-red">
            {error}
          </p>
        )}

        {analysis && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ew-muted">Recommended action</span>
              <Badge
                variant="outline"
                className={`rounded-sm font-medium ${action?.className || "border-ew-rule bg-ew-hover text-ew-ink-soft"}`}
              >
                {action?.label || analysis.recommended_action}
              </Badge>
            </div>

            <p className="max-w-3xl text-sm leading-relaxed text-ew-ink-soft">{analysis.summary}</p>

            <div className="space-y-2">
              <SectionLabel>Findings</SectionLabel>
              {findings.length > 0 ? (
                <ul className="space-y-4">
                  {findings.map((f, i) => (
                    <Finding key={`${f.source_url}-${i}`} finding={f} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ew-muted">No verified findings.</p>
              )}
            </div>

            {questions.length > 0 && (
              <div className="space-y-2">
                <SectionLabel>Open questions</SectionLabel>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ew-ink-soft">
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
