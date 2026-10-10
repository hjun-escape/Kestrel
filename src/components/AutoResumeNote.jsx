import React, { useEffect, useState } from "react";
import { joinList } from "@/lib/sourceCoverage";

// Shown under the sources row between automatic re-checks: Bright Data is still
// building a snapshot, and the page will check again on its own (CompanyDetail).
// state: { at, sources } while a re-check is scheduled, or { exhausted, sources }
// after the automatic re-checks ran out.
export default function AutoResumeNote({ state, onStop }) {
  const secondsLeft = useSecondsLeft(state?.at);
  if (!state || !state.sources?.length) return null;
  const sources = joinList(state.sources);

  if (state.exhausted) {
    return (
      <p role="status" className="border-t border-ew-rule-soft px-5 py-2 text-xs text-ew-ink-soft">
        {sources} still collecting from Bright Data. Automatic checks have stopped; press Refresh to check again.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ew-rule-soft px-5 py-2 text-xs text-ew-ink-soft">
      <p>
        <span role="status">Still collecting {sources} from Bright Data. Checking again automatically</span>
        <span aria-hidden="true" className="tabular-nums">
          {secondsLeft !== null ? ` in ${secondsLeft} s` : ""}
        </span>
        .
      </p>
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="rounded-sm font-medium text-ew-ink underline underline-offset-2 hover:text-ew-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus"
        >
          Stop
        </button>
      )}
    </div>
  );
}

// Whole seconds until `at`, ticking once a second; null when there is no target time.
function useSecondsLeft(at) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}
