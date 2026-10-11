import React, { useState } from "react";
import { SIGNAL_TYPES } from "@/lib/signalTypes";
import { warningScore, BANDS, POINTS, MAX_WEAK_COUNTED } from "@/lib/warningScore.ts";

// Warning score 0-100 with the reason behind every point. Display only; its band always equals the
// status from scoreBorrower (see src/lib/warningScore.ts). Status uses color plus a text label.
const BAND = {
  red: { label: "Red", bar: "bg-ew-red", text: "text-ew-red", cell: "bg-ew-red-bg" },
  yellow: { label: "Yellow", bar: "bg-ew-amber", text: "text-ew-amber", cell: "bg-ew-amber-bg" },
  green: { label: "Green", bar: "bg-ew-green", text: "text-ew-green", cell: "bg-ew-green-bg" },
};

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function Line({ line }) {
  const s = line.signal;
  const type = SIGNAL_TYPES[s.type]?.label || s.type;
  return (
    <li className="flex items-baseline gap-3 py-1.5">
      <span className={`w-10 shrink-0 text-right font-mono text-sm ${line.points ? "font-semibold text-ew-ink" : "text-ew-muted"}`}>
        {line.points ? `+${line.points}` : "0"}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-ew-ink">{type}</span>
        <span className="text-ew-ink-soft">: {s.title}</span>
        <span className="text-ew-muted">
          {" · "}
          <span title={s.date_approx ? "Approximate date" : undefined}>
            {s.date_approx && "~"}
            {shortDate(s.date)}
          </span>
          {" · "}
          {line.note}
        </span>
        {s.source_url && (
          <>
            {" · "}
            <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink">
              {s.source_name || "Source"}
            </a>
          </>
        )}
      </span>
    </li>
  );
}

export default function WarningScore({ borrower, signals }) {
  const [open, setOpen] = useState(false);
  if (!borrower?.last_refreshed) return null; // never checked: status is a placeholder, so no score either

  const ws = warningScore(signals || []);
  const band = BAND[ws.band] || BAND.green;

  return (
    <section data-demo="score" aria-labelledby="warning-score-heading" className="border-t border-ew-rule px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 id="warning-score-heading" className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.06em] text-ew-muted">
            Warning score
          </h2>
          <span className="whitespace-nowrap">
            <span className="font-mono text-2xl font-semibold text-ew-ink">{ws.score}</span>
            <span className="ml-1 text-sm text-ew-muted">/ 100</span>
          </span>
          <span className={`ml-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold ${band.cell} ${band.text}`}>{band.label}</span>
          {/* Say up front that the score cannot disagree with the status: its bands are the status rules. */}
          <span className="w-full text-xs text-ew-muted sm:w-auto">Same rules as the status, counted in points</span>
        </div>

        <div className="min-w-[220px] flex-1">
          <div
            role="meter"
            aria-label="Warning score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ws.score}
            aria-valuetext={`${ws.score} of 100, ${band.label}`}
            className="relative h-2 w-full rounded-sm bg-ew-rule"
          >
            <div className={`h-full rounded-sm ${band.bar}`} style={{ width: `${Math.max(ws.score, 1)}%` }} />
            {[BANDS.yellow, BANDS.red].map((t) => (
              <span key={t} aria-hidden="true" className="absolute top-[-3px] h-[14px] w-px bg-ew-ink-soft" style={{ left: `${t}%` }} />
            ))}
          </div>
          <div aria-hidden="true" className="relative mt-0.5 h-3 font-mono text-[10px] text-ew-muted">
            <span className="absolute" style={{ left: `${BANDS.yellow}%`, transform: "translateX(-50%)" }}>Yellow {BANDS.yellow}</span>
            <span className="absolute" style={{ left: `${BANDS.red}%`, transform: "translateX(-50%)" }}>Red {BANDS.red}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-sm text-xs font-semibold text-ew-ink underline decoration-ew-rule underline-offset-2 hover:decoration-ew-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ew-focus"
        >
          {open ? "Hide reasons" : "Why this score"}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-ew-rule-soft pt-2">
          <p className="text-xs text-ew-muted">
            Last 90 days only. Strong signal +{POINTS.strong}, weak signal +{POINTS.weak} (up to {MAX_WEAK_COUNTED}), capped at 100.
            Yellow from {BANDS.yellow}, Red from {BANDS.red}: the same lines as the status rules. {ws.why}
          </p>
          {ws.counted.length === 0 ? (
            <p className="mt-2 text-sm text-ew-muted">No warning signals in the last 90 days.</p>
          ) : (
            <ul className="mt-1 divide-y divide-ew-rule-soft">
              {ws.counted.map((l, i) => (
                <Line key={`c${i}`} line={l} />
              ))}
            </ul>
          )}
          {ws.notCounted.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-ew-muted">Not counted</p>
              <ul className="divide-y divide-ew-rule-soft">
                {ws.notCounted.map((l, i) => (
                  <Line key={`n${i}`} line={l} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
