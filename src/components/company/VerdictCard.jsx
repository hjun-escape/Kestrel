import React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowDown, FileText, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button as SharedButton } from "@/components/ui/button";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { StatusLegendPopover } from "@/components/StatusLegend";
import EvidenceList from "@/components/company/EvidenceList";
import { countForRules } from "@/lib/statusRules.ts";
import { SOURCES } from "@/lib/signalTypes";
import { formatRelative, formatUsdFull, isSampleCompany, reasonText } from "@/lib/borrowerUtils";
import { joinList, sourceCoverage } from "@/lib/sourceCoverage";
import { SOURCE_LABELS, VERDICT, ruleSentence, topEvidence, verdictKey } from "@/components/company/plainLabels";

const Button = /** @type {React.ComponentType<any>} */ (SharedButton);

// Headline colour per status. The badge-style chip next to it repeats the colour name, so colour is never the only cue.
const HEADLINE_TONE = {
  red: "text-ew-red",
  yellow: "text-ew-amber",
  green: "text-ew-green",
  not_checked: "text-ew-ink",
};

// The one recommended next step for each status. kind decides where the button goes.
function nextStep(key, { isApplicant, running, sample }) {
  const who = isApplicant ? "the applicant" : "the borrower";
  if (running) return null;
  if (key === "red") {
    return {
      kind: "documents",
      text: isApplicant
        ? "Request documents and answers before this goes to credit committee. The list below is built from the evidence."
        : `Request documents from ${who} and review the loan now. The list below is built from the evidence.`,
      action: "Request documents",
    };
  }
  if (key === "yellow") {
    return {
      kind: "documents",
      text: `Ask ${who} about the warning signs below and request documents that explain them.`,
      action: "Request documents",
    };
  }
  if (key === "green") {
    return {
      kind: "review",
      text: "Nothing in public sources needs follow-up. Proceed with your standard review and re-check before closing.",
      action: "Proceed with standard review",
    };
  }
  if (sample) return null;
  return { kind: "check", text: "Run the first check to look for warning signs in news, court records, job postings and reviews.", action: "Check now" };
}

// Top of the company page: what the status is, why, what to do next, and the evidence behind it.
export default function VerdictCard({
  borrower,
  signals = [],
  sourceStates = {},
  running = false,
  refreshError = null,
  onRefresh,
  onRecheck,
  onEdit,
  onDelete,
  onNextStep,
  onShowAllEvidence,
  evidenceCount = 0,
}) {
  const key = running && !borrower.last_refreshed ? "not_checked" : verdictKey(borrower);
  const verdict = VERDICT[key];
  const style = STATUS_STYLES[key];
  const isApplicant = borrower.stage === "applicant";
  const sample = isSampleCompany(borrower);
  const coverage = sample ? null : sourceCoverage(borrower);
  const partial = !running && coverage && coverage.checked < coverage.total;
  const counts = !running && borrower.last_refreshed ? countForRules(signals, borrower.last_refreshed) : null;
  const rule = counts && counts.status === borrower.status ? ruleSentence(counts) : null;
  const step = nextStep(key, { isApplicant, running, sample });
  const evidence = borrower.last_refreshed ? topEvidence(signals) : [];
  const answered = SOURCES.filter((s) => sourceStates[s] !== "checking").length;

  const meta = [
    isApplicant ? "Applicant" : "Borrower",
    borrower.loan_amount_usd ? `${formatUsdFull(borrower.loan_amount_usd)} ${isApplicant ? "requested" : "lent"}` : null,
    [borrower.hq_city, borrower.hq_state].filter(Boolean).join(", ") || null,
    borrower.industry || null,
  ].filter(Boolean);

  function handleStep() {
    if (step.kind === "check") onRefresh?.();
    else onNextStep?.(step.kind);
  }

  return (
    <section aria-labelledby="company-name" className="relative overflow-hidden border border-ew-rule bg-ew-surface">
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${style.rail}`} />

      <header className="flex flex-col gap-3 border-b border-ew-rule-soft py-4 pl-6 pr-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 id="company-name" className="break-words font-heading text-[26px] font-bold leading-[1.1] tracking-tight text-ew-ink md:text-[30px]">
            {borrower.name}
          </h1>
          <p className="mt-1 text-sm text-ew-ink-soft">
            {meta.join(" · ")}
            {borrower.website_domain && (
              <>
                {meta.length > 0 && " · "}
                <a
                  href={`https://${borrower.website_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink"
                >
                  {borrower.website_domain}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            )}
          </p>
          {sample && (
            <p className="mt-2 flex items-center gap-2 text-xs text-ew-muted">
              <span className="rounded-sm border border-ew-rule px-1.5 text-[11px] font-semibold leading-[18px]">Sample</span>
              Made-up company and warning signs, shown so the screens have something in them. It is not checked live.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRecheck || onRefresh}
            disabled={running || (sample && !onRecheck)}
            title={sample && !onRecheck ? "Sample companies are not checked live" : undefined}
            className="h-8 rounded-sm border-ew-rule px-2.5 text-ew-ink-soft hover:text-ew-ink"
          >
            <RefreshCw aria-hidden="true" className={running ? "animate-spin motion-reduce:animate-none" : ""} />
            {running ? "Checking…" : "Re-check now"}
          </Button>
          {onEdit && (
            <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={running} className="h-8 rounded-sm px-2 text-ew-ink-soft hover:text-ew-ink">
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={running} className="h-8 rounded-sm px-2 text-ew-ink-soft hover:text-ew-red">
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-x-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div data-demo="status-why" className="py-5 pl-6 pr-5 lg:pr-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {!running && (
              <span className={`inline-flex items-center gap-2 rounded-sm border px-2 py-0.5 text-sm font-semibold ${style.badge}`}>
                <span aria-hidden="true" className={`inline-block shrink-0 ${style.glyph}`} />
                {verdict.label}
              </span>
            )}
            <span className={`font-heading text-[24px] font-bold leading-tight tracking-tight md:text-[28px] ${HEADLINE_TONE[key]}`}>
              {running ? "Checking sources…" : verdict.headline}
            </span>
          </p>

          {partial && (
            <p className="mt-2 text-sm">
              <span className="rounded-sm border border-ew-amber-rule bg-ew-amber-bg px-1.5 py-0.5 font-semibold text-ew-amber">
                Based on {coverage.checked} of {coverage.total} sources
              </span>{" "}
              <span className="text-ew-muted">
                Could not reach {joinList([...coverage.unavailable, ...coverage.collecting].map((s) => SOURCE_LABELS[s]?.title.toLowerCase() || s))}. Status may be understated.
              </span>
            </p>
          )}

          <p className="mt-3 max-w-[60ch] text-[16px] leading-snug text-ew-ink">
            {borrower.last_refreshed
              ? reasonText(borrower.why) || "No warning signs in the last 90 days."
              : running
                ? "First check in progress. Status is set when it finishes."
                : "Not checked yet. Run the first check to set a status."}
          </p>

          {running && (
            <div className="mt-3 max-w-sm">
              <div className="flex gap-0.5" role="progressbar" aria-label="Sources answered" aria-valuemin={0} aria-valuemax={SOURCES.length} aria-valuenow={answered}>
                {SOURCES.map((s) => (
                  <span key={s} className={`h-1 flex-1 ${sourceStates[s] === "checking" ? "animate-pulse bg-ew-rule motion-reduce:animate-none" : "bg-ew-ink"}`} />
                ))}
              </div>
              <p className="mt-1 text-xs tabular-nums text-ew-muted">
                {answered} of {SOURCES.length} sources answered
              </p>
            </div>
          )}

          {(rule || borrower.last_refreshed) && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ew-ink-soft">
              {rule && <span className="font-medium tabular-nums">{rule}</span>}
              <StatusLegendPopover />
            </p>
          )}

          {refreshError && (
            <p role="alert" className="mt-3 border-l-2 border-ew-red bg-ew-red-bg px-2 py-1 text-xs text-ew-red">
              {refreshError}
            </p>
          )}

          {step && (
            <div className="mt-5 border border-ew-rule bg-ew-paper p-4">
              <h2 className="font-heading text-sm font-bold text-ew-ink">Recommended next step</h2>
              <p className="mt-1 text-sm leading-snug text-ew-ink-soft">{step.text}</p>
              <Button
                type="button"
                onClick={handleStep}
                className="mt-3 h-10 w-full rounded-sm bg-ew-ink px-4 text-white hover:bg-ew-ink-soft sm:w-auto"
              >
                {step.kind === "documents" ? <FileText aria-hidden="true" /> : step.kind === "check" ? <RefreshCw aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
                {step.action}
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-ew-rule-soft py-5 pl-6 pr-5 lg:border-l lg:border-t-0 lg:pl-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-sm font-bold text-ew-ink">Key evidence</h2>
            {evidenceCount > evidence.length && (
              <button
                type="button"
                onClick={onShowAllEvidence}
                className="rounded-sm text-xs font-semibold text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink"
              >
                See all {evidenceCount} warning signs
              </button>
            )}
          </div>
          {evidence.length > 0 ? (
            <EvidenceList signals={evidence} />
          ) : (
            <p className="mt-2 text-sm text-ew-muted">
              {borrower.last_refreshed ? "No warning signs found in the last 90 days." : running ? "Warning signs appear here as sources answer." : "Nothing to show until the first check."}
            </p>
          )}
        </div>
      </div>

      <TrustFooter borrower={borrower} coverage={coverage} sample={sample} running={running} />
    </section>
  );
}

function TrustFooter({ borrower, coverage, sample, running }) {
  if (!borrower.last_refreshed && !running) return null;
  const sources = sample
    ? "sample data, not checked live"
    : coverage
      ? `${coverage.checked} of ${coverage.total} sources checked`
      : "sources checking";
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 border-t border-ew-rule-soft bg-ew-paper py-2.5 pl-6 pr-5 text-xs text-ew-muted">
      <span>Status set by fixed rules, not AI</span>
      <span aria-hidden="true">·</span>
      <span>every quote checked against its source</span>
      <span aria-hidden="true">·</span>
      <span className={coverage && coverage.checked < coverage.total ? "font-semibold text-ew-amber" : ""}>{sources}</span>
      {borrower.last_refreshed && (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={borrower.last_refreshed} title={formatRelative(borrower.last_refreshed)}>
            checked {formatDistanceToNowStrict(new Date(borrower.last_refreshed), { addSuffix: true })}
          </time>
        </>
      )}
    </p>
  );
}
