import React from "react";

// Decorative motif for the brand panel: public signals accumulate on a
// timeline well before the financials report lands. Neutral tones only;
// status colors are reserved for real risk status elsewhere in the app.
const SIGNAL_X = [18, 44, 63, 97, 118, 151, 170, 203];
const FILING_X = 262;

export default function SignalRuler() {
  return (
    <svg viewBox="0 0 320 72" className="w-full max-w-sm h-auto" role="presentation" aria-hidden="true">
      <line x1="8" y1="44" x2="312" y2="44" stroke="#475569" strokeWidth="1" />
      {[8, 68, 128, 188, 248, 308].map((x) => (
        <line key={x} x1={x} y1="44" x2={x} y2="50" stroke="#475569" strokeWidth="1" />
      ))}
      {SIGNAL_X.map((x, i) => (
        <circle key={x} cx={x} cy={44} r={i % 3 === 0 ? 3.5 : 2.5} fill="#E2E8F0" />
      ))}
      <line x1={FILING_X} y1="14" x2={FILING_X} y2="58" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" />
      <text x="8" y="28" fill="#CBD5E1" fontSize="11" fontFamily="inherit">Public signals</text>
      <text x={FILING_X - 6} y="10" fill="#94A3B8" fontSize="11" textAnchor="end" fontFamily="inherit">Financials report</text>
    </svg>
  );
}
