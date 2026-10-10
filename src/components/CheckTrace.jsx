import React, { useEffect, useState } from "react";
import { Check, CircleSlash, Loader2, Minus } from "lucide-react";

// "How this was checked": the News and Legal pipeline for one check, step by step.
// Reads the latest CheckRun (written by newsSignals while it works), so during a
// refresh the steps fill in on each poll. Click a step to see its rows.
// run: CheckRun | null. refreshing: a refresh is in progress on this page.
// stale: the stored run predates the refresh in progress (its new run is not saved yet).

const STEP_STATE = {
  done: { label: "Done", Icon: Check, text: "text-ew-ink" },
  running: { label: "Working", Icon: Loader2, text: "text-ew-focus", spin: true },
  waiting: { label: "Waiting", Icon: Minus, text: "text-ew-muted" },
  failed: { label: "Failed", Icon: CircleSlash, text: "text-ew-muted" },
  off: { label: "Off", Icon: Minus, text: "text-ew-muted" },
};

const TYPE_LABEL = { exec_departure: "Executive departure", legal_layoffs: "Lawsuit / layoffs" };
const DECISION = {
  kept: { label: "Kept", className: "font-semibold text-ew-ink" },
  dropped: { label: "Dropped", className: "text-ew-muted" },
  failed: { label: "Not tagged", className: "text-ew-muted" },
  pending: { label: "Waiting", className: "text-ew-muted" },
};

function deriveSteps(run) {
  const articles = run.articles || [];
  const searches = run.searches || [];
  const running = run.status === "running";
  const failed = run.status === "failed";
  const fullText = articles.filter((a) => a.read === true).length;
  const tagged = articles.filter((a) => a.decision !== "pending").length;
  const relevant = articles.filter((a) => a.relevant).length;
  const kept = articles.filter((a) => a.decision === "kept").length;
  const searchDone = searches.length >= 2 || (!running && searches.length > 0);
  const stepState = (doneWhen, started) => (doneWhen ? "done" : failed ? "failed" : running && started ? "running" : running ? "waiting" : "done");
  const li = run.linkedin_status;
  return [
    {
      id: "search", title: "1. Search", sub: "Google News via Bright Data",
      value: searches.reduce((n, s) => n + (s.count || 0), 0), unit: "articles found",
      state: stepState(searchDone, true),
    },
    {
      id: "read", title: "2. Read", sub: "Full article text",
      value: `${fullText} of ${articles.length}`, unit: "full text",
      state: stepState(searchDone && !running, searchDone),
    },
    {
      id: "tag", title: "3. Tag", sub: "AI reads each article",
      value: relevant, unit: `relevant of ${tagged} tagged`,
      state: stepState(searchDone && tagged === articles.length && !running, articles.length > 0),
    },
    {
      id: "verify", title: "4. Verify", sub: "Same company, exact quote",
      value: kept, unit: kept === 1 ? "signal kept" : "signals kept",
      state: stepState(!running && !failed, tagged > 0),
    },
    {
      id: "linkedin", title: "LinkedIn", sub: "Executives' profiles",
      value: (run.linkedin || []).length, unit: "executives checked",
      state: li === "off" ? "off" : li === "running" ? (running ? "running" : "failed") : li === "skipped" ? "failed" : "done",
    },
  ];
}

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-3 py-1.5 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function SourceLink({ url, children }) {
  if (!url) return <span>{children}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink">
      {children}
    </a>
  );
}

function Table({ caption, head, children, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="mb-1.5 text-left text-xs font-semibold text-ew-muted">{caption}</caption>
        <thead>
          <tr className="border-b border-ew-rule text-left text-[11px] uppercase tracking-wide text-ew-muted">{head}</tr>
        </thead>
        <tbody className="divide-y divide-ew-rule-soft">{children}</tbody>
      </table>
      {empty && <p className="px-3 py-2 text-sm text-ew-muted">{empty}</p>}
    </div>
  );
}

function StepDetail({ step, run }) {
  const articles = run.articles || [];
  if (step === "search") {
    const rows = run.searches || [];
    return (
      <Table caption="Two Google News searches, last 180 days, top 5 results each" empty={rows.length ? null : "Searching..."}
        head={<><Th>Looking for</Th><Th>Search</Th><Th className="text-right">Results</Th></>}>
        {rows.map((s) => (
          <tr key={s.query_type}>
            <Td>{TYPE_LABEL[s.query_type] || s.query_type}</Td>
            <Td className="font-mono text-xs text-ew-ink-soft">{s.query}</Td>
            <Td className="text-right">{s.ok ? s.count : <span className="text-ew-muted">Failed: {s.error}</span>}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (step === "read") {
    return (
      <Table caption="Each result is opened through Bright Data so the AI reads the article, not just the headline" empty={articles.length ? null : "Waiting for search results..."}
        head={<><Th>Article</Th><Th>Source</Th><Th>Date</Th><Th>Text used</Th></>}>
        {articles.map((a) => (
          <tr key={a.url}>
            <Td><SourceLink url={a.url}>{a.title}</SourceLink></Td>
            <Td className="text-ew-ink-soft">{a.source}</Td>
            <Td className="whitespace-nowrap font-mono text-xs">{a.date}</Td>
            <Td className="text-ew-ink-soft">{a.read === true ? "Full article" : a.read === false ? "Search preview only" : "Reading..."}</Td>
          </tr>
        ))}
      </Table>
    );
  }
  if (step === "tag") {
    return (
      <Table caption="The AI only tags; it never sets the status. Its reasoning is shown as written." empty={articles.length ? null : "Waiting for articles..."}
        head={<><Th>Article</Th><Th>Relevant</Th><Th>Same company</Th><Th>Type</Th><Th>Severity</Th><Th>AI reasoning</Th></>}>
        {articles.map((a) => (
          <tr key={a.url}>
            <Td><SourceLink url={a.url}>{a.title}</SourceLink></Td>
            {a.decision === "pending" ? (
              <Td className="text-ew-muted" colSpan={5}>Waiting</Td>
            ) : a.decision === "failed" ? (
              <Td className="text-ew-muted" colSpan={5}>{a.why}</Td>
            ) : (
              <>
                <Td>{a.relevant ? "Yes" : "No"}</Td>
                <Td>{a.same_company ? "Yes" : "No"}</Td>
                <Td className="text-ew-ink-soft">{TYPE_LABEL[a.signal_type] || "None"}</Td>
                <Td className="capitalize text-ew-ink-soft">{a.severity && a.severity !== "none" ? a.severity : "None"}</Td>
                <Td className="text-ew-ink-soft">{a.reason || "—"}</Td>
              </>
            )}
          </tr>
        ))}
      </Table>
    );
  }
  if (step === "verify") {
    return (
      <Table caption="Code keeps a tag only if it is about this company, a departure names a senior role, and the quote appears word for word in the article"
        empty={articles.length ? null : "Nothing to verify yet."}
        head={<><Th>Result</Th><Th>Why</Th><Th>Quote</Th><Th>Article</Th></>}>
        {articles.map((a) => {
          const d = DECISION[a.decision] || DECISION.pending;
          return (
            <tr key={a.url}>
              <Td className={d.className}>{d.label}</Td>
              <Td className="text-ew-ink-soft">{a.decision === "kept" ? "All checks passed" : a.why || "—"}</Td>
              <Td className="text-ew-ink-soft">{a.snippet ? `"${a.snippet}"` : "—"}</Td>
              <Td><SourceLink url={a.url}>{a.title}</SourceLink></Td>
            </tr>
          );
        })}
      </Table>
    );
  }
  const rows = run.linkedin || [];
  const note = run.linkedin_status === "off" ? "LinkedIn check is off." : run.linkedin_status === "running" ? "Checking executives' LinkedIn profiles..."
    : run.linkedin_status === "skipped" ? "LinkedIn check did not finish in time; news results are unaffected." : rows.length ? null : "No executives found.";
  return (
    <Table caption="Executives found in public records, then their LinkedIn profiles. A departure counts only with a dated exit in the last 180 days."
      empty={note} head={<><Th>Executive</Th><Th>Result</Th><Th>Detail</Th><Th>Profile</Th></>}>
      {rows.map((c) => (
        <tr key={c.exec}>
          <Td>{c.exec}</Td>
          <Td className={c.result === "departed" ? "font-semibold text-ew-ink" : "text-ew-muted"}>{c.result}</Td>
          <Td className="text-ew-ink-soft">{c.detail}</Td>
          <Td>{c.profile_url ? <SourceLink url={c.profile_url}>LinkedIn</SourceLink> : "—"}</Td>
        </tr>
      ))}
    </Table>
  );
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CheckTrace({ run, refreshing, stale }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("verify");
  const live = refreshing && (!run || stale || run.status === "running");

  // Open while a check runs so the steps can be watched filling in.
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  if (!run && !refreshing) return null;

  const showRun = run && !stale ? run : null;
  const steps = showRun ? deriveSteps(showRun) : [];
  const status = !showRun
    ? "Starting the news check..."
    : showRun.status === "running"
      ? "Running now"
      : showRun.status === "failed"
        ? `Failed ${formatTime(showRun.finished_at)}: ${showRun.error || "no source answered"}`
        : `Checked ${formatTime(showRun.finished_at)} · ${showRun.signal_count ?? 0} signal${showRun.signal_count === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="check-trace-heading" className="border-t border-ew-rule">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 px-5 py-3 text-left hover:bg-ew-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus"
      >
        <span id="check-trace-heading" className="text-xs font-semibold text-ew-muted">
          How News and Legal were checked
        </span>
        <span className="font-mono text-xs text-ew-ink-soft">
          {status} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4">
          {!showRun ? (
            <p className="flex items-center gap-2 text-sm text-ew-muted">
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Waiting for the first step to report...
            </p>
          ) : (
            <>
              <ol className="grid grid-cols-2 gap-px border border-ew-rule bg-ew-rule md:grid-cols-5">
                {steps.map((s) => {
                  const st = STEP_STATE[s.state];
                  const { Icon } = st;
                  const selected = s.id === step;
                  return (
                    <li key={s.id} className="flex">
                      <button
                        type="button"
                        onClick={() => setStep(s.id)}
                        aria-pressed={selected}
                        className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus ${
                          selected ? "bg-ew-hover shadow-[inset_0_-2px_0_var(--ew-ink)]" : "bg-ew-surface hover:bg-ew-hover"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-heading text-sm font-bold text-ew-ink">{s.title}</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${st.text}`}>
                            <Icon aria-hidden="true" className={`h-3.5 w-3.5 ${st.spin ? "animate-spin" : ""}`} />
                            {st.label}
                          </span>
                        </span>
                        <span className="text-xs text-ew-muted">{s.sub}</span>
                        <span className="text-xs text-ew-ink-soft">
                          <span className="font-semibold text-ew-ink">{s.value}</span> {s.unit}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="mt-3">
                <StepDetail step={step} run={showRun} />
              </div>

              {(showRun.log || []).length > 0 && (
                <details className="mt-3" open={showRun.status === "running"}>
                  <summary className="cursor-pointer text-xs font-semibold text-ew-muted">Activity log</summary>
                  <pre className="mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap border border-ew-rule-soft bg-ew-paper p-2 font-mono text-[11px] leading-relaxed text-ew-ink-soft">
                    {showRun.log.join("\n")}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
