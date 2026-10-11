import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import StatusBadge from "@/components/StatusBadge";
import { deriveSourceStates } from "@/lib/borrowerUtils";
import { useAssistantPage } from "./AssistantContext";
import { setActionState, useActionState } from "./actionStore";
import { asList, errorText, safeHref } from "./assistantData";
import { devinErrorMessage } from "@/components/devin/devinRunUtils";
import { useCompanyLive } from "./useCompanyLive";
import SourceProgress from "./SourceProgress";

const KIND_LABEL = {
  screen: "Screen new applicant",
  refresh: "Re-check public sources",
  deep_check: "Analyst deep check",
  devin_investigation: "Ask Devin to investigate",
};

const CONFIRM_LABEL = {
  screen: "Add and check",
  refresh: "Run check",
  deep_check: "Run deep check",
  devin_investigation: "Ask Devin",
};

const PARAM_LABEL = {
  name: "Company",
  website_domain: "Website",
  hq_city: "HQ city",
  hq_state: "HQ state",
  industry: "Industry",
  loan_amount_usd: "Loan requested",
  question: "Question",
};

const STATUS_NOTE = {
  pending: "Waiting for your confirmation",
  running: "Running",
  done: "Done",
  error: "Did not finish",
  cancelled: "Cancelled",
  interrupted: "Was running when this chat was closed",
};

function formatParam(key, value) {
  if (key === "loan_amount_usd" && typeof value === "number") return `$${value.toLocaleString("en-US")}`;
  return String(value);
}

async function snapshotFor(id) {
  try {
    const [borrower, sigRes] = await Promise.all([
      base44.entities.Borrower.get(id),
      base44.entities.Signal.filter({ borrower_id: id }, { limit: 200, sort: "-date" }),
    ]);
    return {
      unavailableBefore: borrower?.sources_unavailable || [],
      signalIdsBefore: asList(sigRes).map((s) => s.id),
    };
  } catch {
    return { unavailableBefore: [], signalIdsBefore: [] };
  }
}

function doneMessage(action, data) {
  if (action.kind === "screen") {
    const name = data?.borrower?.name || action.params.name;
    return data?.refresh?.ok
      ? `${name} was added as an applicant and checked.`
      : `${name} was added as an applicant. The first check did not finish: ${data?.refresh?.error || "unknown error"}.`;
  }
  if (action.kind === "refresh") return "Check finished.";
  if (action.kind === "devin_investigation") return "Devin is investigating. This takes a few minutes.";
  const summary = data?.result?.summary;
  return summary ? `Deep check finished: ${summary}` : "Deep check finished. The analyst brief is on the company page.";
}

function useConfirm(action, onFinished) {
  // onFinished(companyId | null) runs after the action settles.
  return async function confirm() {
    const companyId = action.params?.id || null;
    const snapshot = companyId ? await snapshotFor(companyId) : { unavailableBefore: [], signalIdsBefore: [] };
    setActionState(action.action_id, {
      status: "running",
      kind: action.kind,
      companyId,
      domain: action.kind === "screen" ? action.params.website_domain : null,
      snapshot,
      message: "",
      startedAt: Date.now(),
      devinUrl: null,
    });
    try {
      const { state: _ignored, ...clean } = action;
      const res = await base44.functions.invoke("confirmAction", { action: clean });
      const data = res?.data || {};
      const settledId = data?.borrower?.id || companyId;
      setActionState(action.action_id, {
        status: "done",
        companyId: settledId,
        message: doneMessage(action, data),
        devinUrl: action.kind === "devin_investigation" ? safeHref(data?.result?.run?.devin_url) : null,
      });
      onFinished(settledId);
    } catch (e) {
      setActionState(action.action_id, {
        status: "error",
        message: action.kind === "devin_investigation" ? devinErrorMessage(e) : errorText(e, "The action could not be completed. Try again."),
      });
      onFinished(null);
    }
  };
}

function LiveProgress({ state, action }) {
  const running = state.status === "running";
  const { data } = useCompanyLive(state.companyId, {
    domain: state.companyId ? null : state.domain,
    poll: running,
  });
  const borrower = data?.borrower;
  const run = running ? { snapshot: state.snapshot || { unavailableBefore: [], signalIdsBefore: [] } } : null;
  const states = useMemo(
    () => deriveSourceStates(borrower, data?.signals || [], run),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [borrower, data?.signals, running]
  );
  const name = borrower?.name || action.params?.name || "Company";
  return (
    <div className="mt-3 border-t border-ew-rule-soft pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-heading text-sm font-bold text-ew-ink">{name}</span>
        {borrower && !running ? (
          <StatusBadge status={borrower.status} lastRefreshed={borrower.last_refreshed} />
        ) : (
          <span className="text-xs text-ew-muted">{running ? "Checking sources" : ""}</span>
        )}
      </div>
      <SourceProgress states={states} running={running} label="Sources" ariaLabel={`Source check for ${name}`} />
      {!running && borrower?.why && <p className="mt-2 text-[13px] leading-snug text-ew-ink-soft">{borrower.why}</p>}
      {borrower?.id && (
        <Link
          to={`/borrower/${borrower.id}`}
          className="mt-2 inline-block text-xs font-medium text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink"
        >
          Open {name}
        </Link>
      )}
    </div>
  );
}

// Proposed action from the assistant. Nothing runs until Confirm; then a live
// progress card follows the company's sources until the check returns.
export function ActionCard({ data }) {
  const action = data?.action;
  const live = useActionState(action?.action_id);
  const { reloadCompanies, setMentionedId, byId } = useAssistantPage();
  const confirm = useConfirm(action || {}, (settledId) => {
    reloadCompanies();
    if (settledId) setMentionedId(settledId);
  });
  if (!action?.action_id) return null;

  const status = live?.status || "pending";
  const running = status === "running";
  const canAct = status === "pending" || status === "error";
  const showProgress =
    (action.kind === "refresh" || action.kind === "screen") && live && status !== "cancelled" && Boolean(live.companyId || live.domain);

  const isDevin = action.kind === "devin_investigation";
  const devinCompany = isDevin ? byId?.[action.params?.id]?.name || "this company" : "";
  const title = isDevin ? `Ask Devin to investigate ${devinCompany}` : KIND_LABEL[action.kind] || action.kind;
  const handleConfirm = () => {
    if (action.params?.id) setMentionedId(action.params.id);
    confirm();
  };
  const handleCancel = () => setActionState(action.action_id, { status: "cancelled", kind: action.kind, message: "Nothing was changed." });

  return (
    <section
      aria-label={isDevin ? title : KIND_LABEL[action.kind] || "Proposed action"}
      className={`mt-4 rounded-sm border bg-ew-surface px-4 py-3 transition-colors ${
        status === "pending" ? "border-ew-ink shadow-[3px_3px_0_var(--ew-rule-soft)]" : "border-ew-rule"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-sm font-bold text-ew-ink">{title}</h3>
        <span className={`inline-flex items-center gap-1 text-xs ${status === "error" ? "text-ew-red" : "text-ew-muted"}`}>
          {running && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
          {STATUS_NOTE[status] || status}
        </span>
      </div>
      <p className="mt-1 text-sm text-ew-ink-soft">{action.summary}</p>
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-0.5 text-xs">
        {Object.entries(action.params || {})
          .filter(([key]) => key !== "id")
          .map(([key, value]) => (
            <React.Fragment key={key}>
              <dt className="text-ew-muted">{PARAM_LABEL[key] || key}</dt>
              <dd className="break-words font-medium text-ew-ink">{formatParam(key, value)}</dd>
            </React.Fragment>
          ))}
      </dl>
      {live?.message && (
        <p role={status === "error" ? "alert" : undefined} className={`mt-2 text-[13px] ${status === "error" ? "text-ew-red" : "text-ew-ink-soft"}`}>
          {live.message}
        </p>
      )}
      {canAct && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex h-8 items-center rounded-sm bg-ew-ink px-3 text-sm font-semibold text-white hover:bg-ew-ink-soft"
          >
            {status === "error" ? "Try again" : CONFIRM_LABEL[action.kind] || "Confirm"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex h-8 items-center rounded-sm border border-ew-rule bg-ew-surface px-3 text-sm font-medium text-ew-ink hover:border-ew-ink-soft"
          >
            Cancel
          </button>
        </div>
      )}
      {isDevin && status === "done" && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {live?.companyId && (
            <Link to={`/borrower/${live.companyId}#devin-review`} className="font-medium text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink">
              See the review section on the company page
            </Link>
          )}
          {live?.devinUrl && (
            <a href={live.devinUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink">
              Open in Devin<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      )}
      {showProgress && <LiveProgress state={live} action={action} />}
    </section>
  );
}
